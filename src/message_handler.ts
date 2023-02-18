import { PageEntity, BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

import { Telegraf, Context } from "telegraf";
import { MessageSubTypes } from "telegraf/typings/telegram-types";
import { Message } from "typegram";

import { log, getDateString, isMessageAuthorized } from "./utils";
import { settings, JOURNAL_PAGE_NAME } from "./settings";

export { setupMessageTypes };

type InputHandler = (ctx: Context, message: Message.ServiceMessage) => Promise<void>;

const DEFAULT_CAPTION = "no caption";
const messageHandlers: { type: string, handler: InputHandler }[] = [];

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

async function writeBlocks(pageName: string, inboxName: string, texts: string[]): Promise<boolean> {
  const pageBlocksTree = await findPage(pageName);
  if (!pageBlocksTree || pageBlocksTree.length == 0) {
    log("Request page is not available");
    return false;
  }

  let inboxBlock: BlockEntity | undefined | null = pageBlocksTree[0];

  if (inboxName) {
    inboxBlock = pageBlocksTree.find((block: { content: string }) => {
      return block.content === inboxName;
    });
    if (!inboxBlock) {
      inboxBlock = await logseq.Editor.insertBlock(
        pageBlocksTree[pageBlocksTree.length - 1].uuid,
        inboxName,
        {
          before: pageBlocksTree[pageBlocksTree.length - 1].content ? false : true,
          sibling: true
        }
      );
    }
  }
  if (!inboxBlock) {
    log(`Unable to find Inbox: ${inboxName}`);
    return false;
  }

  const targetBlock = inboxBlock.uuid;
  const blocks = texts.map(t => ({ content: t }));
  const params = { before: true, sibling: !inboxName };
  await logseq.Editor.insertBatchBlock(targetBlock, blocks, params);
  return true;
}

function textHandlerGenerator() {
  async function handler(ctx: Context, message: Message.TextMessage) {
    if (!message?.text) {
      ctx.reply("Message is not valid");
      return;
    }

    if (!await writeBlocks(
      settings.pageName,
      settings.inboxName,
      [message.text])) {
      ctx.reply("Failed to write this to Logseq");
      return;
    }
  }

  return {
    type: "text",
    handler: handler as InputHandler
  };
}

function photoTemplate(caption: string, id: string, url: string) {
  return `{{renderer :local_telegram_bot,${caption},${id}}}![${caption}](${url})`;
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
    await writeBlocks(
      settings.pageName,
      settings.inboxName,
      [
        photoTemplate(caption, lastPhoto.file_id, photoUrl)
      ]);
  }

  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    let [type, caption, photoId] = payload.arguments;
    if (type !== ':local_telegram_bot') {
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
    handler: handler as InputHandler
  };
}

function setupMessageTypes(bot: Telegraf<Context>) {
  messageHandlers.push(textHandlerGenerator());
  messageHandlers.push(photoHandlerGenerator(bot));

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