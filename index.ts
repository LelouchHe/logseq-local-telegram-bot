import "@logseq/libs";
import { PageEntity, BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";

// 4.* has URL is not constructor error, fallback to 3.*
import { Telegraf, Context } from "telegraf";
import { Message } from "typegram"

import axios from "axios";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";

const productId = "logseq-local-telegram-bot";
const journalPageName = "Journal";
const settings: SettingSchemaDesc[] = [
  {
    key: "botToken",
    description: "Telegram Bot token. In order to start you need to create Telegram bot: https://core.telegram.org/bots#3-how-do-i-create-a-bot. Create a bot with BotFather, which is essentially a bot used to create other bots. The command you need is /newbot. After you choose title, BotFaher give you the token",
    type: "string",
    default: "",
    title: "Bot token",
  },
  {
    key: "authorizedUsers",
    description: "Be sure to add your username in authorizedUsers, because your recently created bot is publicly findable and other peoples may send messages to your bot. If there are multiple usernames, separate them by \",\", with optional leading or trailing space, like \"your_username1, your_username2\". If you leave this empty - all messages from all users will be processed!",
    type: "string",
    default: "",
    title: "Authorized Users",
  },
  {
    key: "pageName",
    description: "The name of the page that all regular messages from Telegram are added to. \"Journal\" is reserved for today's Journal",
    type: "string",
    default: "Journal",
    title: "Page Name",
  },
  {
    key: "inboxName",
    description: "The content of the block that all regulare messages from Telegram are added to. If it's not found, messages are added to the 2nd block of the current page",
    type: "string",
    default: "#Inbox",
    title: "Inbox Name",
  }
];

function setupCommands(bot: Telegraf<Context>) {
  bot.command("echo", (ctx) => {
    ctx.reply(ctx.message?.text ?? "");
  });
}

async function findPage(pageName: string): Promise<BlockEntity[]> {
  if (pageName != journalPageName) {
    return logseq.Editor.getPageBlocksTree(pageName);
  }

  const d = new Date();
  const todayDateObj = {
    day: `${d.getDate()}`.padStart(2, "0"),
    month: `${d.getMonth() + 1}`.padStart(2, "0"),
    year: d.getFullYear(),
  };
  const todayDate = `${todayDateObj.year}${todayDateObj.month}${todayDateObj.day}`;

  const ret: Array<PageEntity[]> | undefined = await logseq.DB.datascriptQuery(`
      [:find (pull ?p [*])
       :where
       [?b :block/page ?p]
       [?p :block/journal? true]
       [?p :block/journal-day ?d]
       [(= ?d ${todayDate})]]
    `);

  if (!ret) {
    console.log("Today's Journal is not available");
    return [];
  }
  
  const pages = ret.flat();
  if (pages.length == 0 || !pages[0].name) {
    console.log("Today's Journal is not available");
    return [];
  }

  return logseq.Editor.getPageBlocksTree(pages[0].name);;
}

async function writeBlocks(pageName: string, inboxName: string, texts: string[]): Promise<boolean> {
  const pageBlocksTree = await findPage(pageName);
  if (!pageBlocksTree || pageBlocksTree.length == 0) {
    console.log("Request page is not available");
    return false;
  }

  let inboxBlock: BlockEntity|undefined|null = pageBlocksTree[0];
  
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
    console.log(`Unable to find Inbox: ${inboxName}`);
    return false;
  }

  console.log(inboxBlock);

  const targetBlock = inboxBlock.uuid;
  const blocks = texts.map(t => ({ content: t }));
  const params = { before: true, sibling: !inboxName };
  await logseq.Editor.insertBatchBlock(targetBlock, blocks, params);
  return true;
}

async function handleText(ctx: Context, message: Message.TextMessage) {
  if (!message?.text) {
    ctx.reply("Message is not valid");
    return;
  }

  if (!await writeBlocks(
      logseq.settings!.pageName,
      logseq.settings!.inboxName,
      [ message.text ])) {
    ctx.reply("Failed to write this to Logseq");
    return;
  }
}

async function handlePhoto(ctx: Context, message: Message.PhotoMessage) {
  if (!message?.photo || message.photo.length == 0) {
    ctx.reply("Photo is not valid");
    return;
  }

  const lastPhoto = message.photo[message.photo.length - 1];

  const fileUrl = await ctx.telegram.getFileLink(lastPhoto.file_id);

  const ext = fileUrl.slice(fileUrl.lastIndexOf("."));
  const filePath = uuidv4() + ext;
  const response = await axios.get(fileUrl, { responseType: "arraybuffer" });

  const storage = logseq.Assets.makeSandboxStorage();
  await storage.setItem(filePath, response.data);
  
  const fullFilePath = `./assets/storages/${productId}/${filePath}`;
  if (!await writeBlocks(
      logseq.settings!.pageName,
      logseq.settings!.inboxName,
      [`![](${fullFilePath})`])) {
    ctx.reply("Failed to write this to Logseq");
    return;
  }
}

function isMessageAuthorized(message: Message.ServiceMessage): boolean {
  if (!message.from?.username) {
    console.log("Invalid username from message");
    return false;
  }

  const authorizedUsers: string[] = logseq.settings!.authorizedUsers.split(",").map((rawUserName: string) => rawUserName.trim());
  if (authorizedUsers && authorizedUsers.length > 0) {
    if (!authorizedUsers.includes(message.from.username)) {
      console.log(`Unauthorized username: ${message.from.username}`)
      return false;
    }
  }

  return true;
}

function setupMessageTypes(bot: Telegraf<Context>) {
  bot.on("text", (ctx) => {
    if (isMessageAuthorized(ctx.message as Message.ServiceMessage)) {
      handleText(ctx, ctx.message as Message.TextMessage);
    }
  });

  bot.on("photo", (ctx) => {
    if (isMessageAuthorized(ctx.message as Message.ServiceMessage)) {
      handlePhoto(ctx, ctx.message as Message.PhotoMessage);
    }
  });
}

async function main() {
  console.log("[Local Telegram Bot] Start");
  logseq.useSettingsSchema(settings);

  const bot = new Telegraf(logseq.settings!.botToken);
  
  setupCommands(bot);
  setupMessageTypes(bot);
  
  bot.launch();
}

// bootstrap
logseq.ready(main).catch(console.error);
