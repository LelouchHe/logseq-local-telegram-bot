import "@logseq/libs";
import { BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";

// 4.* has URL is not constructor error, fallback to 3.*
import { Telegraf, Context } from "telegraf";
import { Message } from "typegram"

import axios from "axios";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";

const productId = "logseq-local-telegram-bot";
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
    key: "createPageIfNotAvailable",
    description: "Whether to create page if the page name is not available. \"Journal\" page won't be created anyway",
    type: "boolean",
    default: false,
    title: "Create Page If Not Available",
  },
  {
    key: "inboxName",
    description: "The content of the block that all regulare messages from Telegram are added to. If it's not found, messages are added to the front the current page",
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

async function writeBlocks(pageName: string, inboxName: string, texts: string[]) {
  const pageBlocksTree = await logseq.Editor.getPageBlocksTree(pageName);
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
    logseq.UI.showMsg("[Local Telegram Bot] Unable to find inbox");
    return;
  }

  const targetBlock = inboxBlock.uuid;
  const blocks = texts.map(t => ({ content: t }));
  const params = { before: true, sibling: true };
  await logseq.Editor.insertBatchBlock(targetBlock, blocks, params);
}

async function handleText(ctx: Context, message: Message.TextMessage) {
  ctx.reply("this is a normal message");
  await writeBlocks("Feb 12th, 2023", "#text", [ message.text ]);
}

async function handlePhoto(ctx: Context, message: Message.PhotoMessage) {
  ctx.reply("this is a photo message");
  const lastPhoto = message.photo[message.photo.length - 1];

  const fileUrl = await ctx.telegram.getFileLink(lastPhoto.file_id);

  const ext = fileUrl.slice(fileUrl.lastIndexOf("."));
  const filePath = uuidv4() + ext;
  const response = await axios.get(fileUrl, { responseType: "arraybuffer" });

  const storage = logseq.Assets.makeSandboxStorage();
  await storage.setItem(filePath, response.data);
  
  const fullFilePath = `./assets/storages/${productId}/${filePath}`;
  await writeBlocks("Feb 12th, 2023", "#photo", [`![](${fullFilePath})`]);
}

function setupMessageTypes(bot: Telegraf<Context>) {
  bot.on("text", (ctx) => {
    handleText(ctx, ctx.message as Message.TextMessage);
  });
  bot.on("photo", (ctx) => {
    handlePhoto(ctx, ctx.message as Message.PhotoMessage);
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
