import { PageEntity, BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

import { Telegraf, Context } from "telegraf";
import { MessageSubTypes } from "telegraf/typings/telegram-types";
import { Message, MessageEntity } from "typegram";

import { log, getDateString, isMessageAuthorized } from "./utils";
import { settings, JOURNAL_PAGE_NAME } from "./settings";
import { commandTypes } from "./command_handlers";

export { setupMessageHandlers };

type MessageHandler = (ctx: Context, message: Message.ServiceMessage) => Promise<void>;
type EntityHandler = (text: string, entity: MessageEntity) => string;

const DEFAULT_CAPTION = "no caption";

const entityHandlers: { [ type: string ]: EntityHandler } = {
  "pre": handleCodeEntity,
  "code": handleCodeEntity
};

async function findPage(pageName: string): Promise<BlockEntity[]> {
  if (pageName != JOURNAL_PAGE_NAME) {
    return logseq.Editor.getPageBlocksTree(pageName);
  }

  const todayDate = getDateString(new Date());
  const ret: Array<PageEntity[]> | undefined = await logseq.DB.datascriptQuery(`
      [:find (pull ?p [*])
       :where
       [?b :block/page ?p]
       [?p :block/journal? true]
       [?p :block/journal-day ?d]
       [(= ?d ${todayDate})]]
    `);

  if (!ret) {
    log("Today's Journal is not available");
    return [];
  }

  const pages = ret.flat();
  if (pages.length == 0 || !pages[0].name) {
    log("Today's Journal is not available");
    return [];
  }

  return logseq.Editor.getPageBlocksTree(pages[0].name);;
}

async function writeBlock(pageName: string, inboxName: string, text: string): Promise<boolean> {
  const pageBlocksTree = await findPage(pageName);
  if (!pageBlocksTree || pageBlocksTree.length == 0) {
    log("Request page is not available");
    return false;
  }

  let inboxBlock: BlockEntity | undefined | null = settings.appendAtBottom
    ? pageBlocksTree[pageBlocksTree.length - 1]
    : pageBlocksTree[0];

  if (inboxName) {
    inboxBlock = pageBlocksTree.find((block: { content: string }) => {
      return block.content === inboxName;
    });
    if (!inboxBlock) {
      inboxBlock = await logseq.Editor.insertBlock(
        pageBlocksTree[pageBlocksTree.length - 1].uuid,
        inboxName,
        {
          before: false,
          sibling: true
        }
      );
    }
  }

  if (!inboxBlock) {
    log(`Unable to find Inbox: ${inboxName}`);
    return false;
  }

  const params = { before: !settings.appendAtBottom, sibling: !inboxName };
  await logseq.Editor.insertBlock(inboxBlock.uuid, text, params);
  return true;
}

function handleCodeEntity(text: string, entity: MessageEntity): string {
  let code = "`";
  if (text.indexOf("\n") > 0) {
    code = "```";
  }
  
  return code + text + code;
}

function handleEntity(text: string, entity: MessageEntity): string {
  if (entityHandlers[entity.type]) {
    text = entityHandlers[entity.type](text, entity);
  }

  return text;
}

function textHandlerGenerator() {
  async function handler(ctx: Context, message: Message.TextMessage) {
    if (!message?.text) {
      ctx.reply("Message is not valid");
      return;
    }

    let text = message.text;
    if (!settings.enableCustomizedCommandFromMessage) {
      for (let prefix in commandTypes) {
        if (text.startsWith(prefix)) {
          log(`command is not allowed in message: ${text}`);
          ctx.reply("Command is not allowed in message");
          return;
        }
      }
    }
    
    if (message.entities) {
      message.entities.sort((a, b) => a.offset - b.offset);
      let subs: string[] = [];
      let offset = 0;
      for (let entity of message.entities) {
        subs.push(text.substring(offset, entity.offset));
        let sub = text.substring(entity.offset, entity.offset + entity.length);
        subs.push(handleEntity(sub, entity));
        offset = entity.offset + entity.length;
      }

      text = subs.join("");
    }

    if (!await writeBlock(
      settings.pageName,
      settings.inboxName,
      text)) {
      ctx.reply("Failed to write this to Logseq");
    }
  }

  return {
    type: "text",
    handler: handler as MessageHandler
  };
}

function photoTemplate(caption: string, id: string, url: string) {
  return `{{renderer :local_telegram_bot-showPhoto,${caption},${id}}}![${caption}](${url})`;
}

function photoHandlerGenerator(bot: Telegraf<Context>) {
  async function handler(ctx: Context, message: Message.PhotoMessage) {
    if (!message?.photo || message.photo.length == 0) {
      ctx.reply("Photo is not valid");
      return;
    }

    const lastPhoto = message.photo[message.photo.length - 1];
    const photoUrl = await ctx.telegram.getFileLink(lastPhoto.file_id);
    const caption = message.caption ?? DEFAULT_CAPTION;
    if (!await writeBlock(
      settings.pageName,
      settings.inboxName,
      photoTemplate(caption, lastPhoto.file_id, photoUrl))) {
      ctx.reply("Failed to write this to Logseq");
    }
  }

  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    let [type, caption, photoId] = payload.arguments;
    // backward compatibility
    if (type !== ':local_telegram_bot' && type !== ":local_telegram_bot-showPhoto") {
      return;
    }

    const photoUrl = await bot.telegram.getFileLink(photoId);

    // replace the whole block with new renderer and img
    // renderer runs once at one time, so no loop
    // invalid renderer removes itself from rendering
    // photo url from Telegram is not permanent, need to fetch everytime
    logseq.Editor.updateBlock(
      payload.uuid,
      photoTemplate(caption, photoId, photoUrl));
  });

  return {
    type: "photo",
    handler: handler as MessageHandler
  };
}

function setupMessageHandlers(bot: Telegraf<Context>) {
  const messageHandlers: { type: string, handler: MessageHandler }[] = [
    textHandlerGenerator(),
    photoHandlerGenerator(bot)
  ];

  for (let handler of messageHandlers) {
    // FIXME: no way to check union type?
    bot.on(handler.type as MessageSubTypes, (ctx) => {
      if (ctx.message
        && isMessageAuthorized(ctx.message as Message.ServiceMessage)) {
        handler.handler(ctx, ctx.message);
      }
    });
  }
}