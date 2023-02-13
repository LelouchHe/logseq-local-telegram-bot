import "@logseq/libs";
import { PageEntity, BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";

// 4.* has URL is not constructor error, fallback to 3.*
import { Telegraf, Context } from "telegraf";
import { MessageSubTypes } from "telegraf/typings/telegram-types";
import { Message } from "typegram";

import axios from "axios";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";

type InputHandler = (ctx: Context, message: Message.ServiceMessage) => Promise<void>;

class Settings {
  public get botToken() {
    return logseq.settings!.botToken;
  }

  public get authorizedUsers() {
    return logseq.settings!.authorizedUsers
            .split(",")
            .map((rawUserName: string) => rawUserName.trim());
  }
  public set authorizedUsers(users: string[]) {
    logseq.settings!.authorizedUsers = users.join(",");
  }

  public get pageName() {
    return logseq.settings!.pageName;
  }
  public set pageName(name: string) {
    logseq.settings!.pageName = name;
  }

  public get inboxName() {
    return logseq.settings!.inboxName;
  }
  public set inboxName(name: string) {
    logseq.settings!.inboxName = name;
  }
}

const settings = new Settings();

const journalPageName = "Journal";
const botTokenRegex = /^[0-9]{8,10}:[a-zA-Z0-9_-]{35}$/;

const settingsSchema: SettingSchemaDesc[] = [
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

const messageHandlers: { [key: string]: InputHandler } = {
  "text": handleTextMessage as InputHandler,
  "photo": handlePhotoMessage as InputHandler
};

const commandHandlers: { [key: string]: InputHandler } = {
  "echo": handleEchoCommand as InputHandler
};

function log(message: string) {
  console.log("[Local Telegram Bot] " + message);
}

function error(message: string) {
  console.error("[Local Telegram Bot] " + message);
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
    log(`Unable to find Inbox: ${inboxName}`);
    return false;
  }

  const targetBlock = inboxBlock.uuid;
  const blocks = texts.map(t => ({ content: t }));
  const params = { before: true, sibling: !inboxName };
  await logseq.Editor.insertBatchBlock(targetBlock, blocks, params);
  return true;
}

async function handleEchoCommand(ctx: Context, message: Message.ServiceMessage) {
  ctx.reply(ctx.message?.text ?? "");
}

async function handleTextMessage(ctx: Context, message: Message.TextMessage) {
  if (!message?.text) {
    ctx.reply("Message is not valid");
    return;
  }

  if (!await writeBlocks(
      settings.pageName,
      settings.inboxName,
      [ message.text ])) {
    ctx.reply("Failed to write this to Logseq");
    return;
  }
}

async function handlePhotoMessage(ctx: Context, message: Message.PhotoMessage) {
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
  
  const fullFilePath = `./assets/storages/${logseq.baseInfo.id}/${filePath}`;
  const text = `![${message.caption ?? ""}](${fullFilePath})`;
  if (!await writeBlocks(
      settings.pageName,
      settings.inboxName,
      [ text ])) {
    ctx.reply("Failed to write this to Logseq");
    return;
  }
}

function isMessageAuthorized(message: Message.ServiceMessage): boolean {
  if (!message.from?.username) {
    log("Invalid username from message");
    return false;
  }

  if (settings.authorizedUsers.length > 0) {
    if (!settings.authorizedUsers.includes(message.from.username)) {
      log(`Unauthorized username: ${message.from.username}`)
      return false;
    }
  }

  return true;
}

function setupCommands(bot: Telegraf<Context>) {
  for (let commandType in commandHandlers) {
    bot.command(commandType, (ctx) => {
      if (ctx.message
        && isMessageAuthorized(ctx.message as Message.ServiceMessage)) {
        commandHandlers[commandType](ctx, ctx.message);
      }
    });
  }
}

function setupMessageTypes(bot: Telegraf<Context>) {
  for (let messageType in messageHandlers) {
    bot.on(messageType as MessageSubTypes, (ctx) => {
      if (ctx.message
        && isMessageAuthorized(ctx.message as Message.ServiceMessage)) {
        messageHandlers[messageType](ctx, ctx.message);
      }
    });
  }
}

let bot: Telegraf<Context>;

async function start() {
  if (bot) {
    await bot.stop();
  }

  bot = new Telegraf(settings.botToken);

  setupCommands(bot);
  setupMessageTypes(bot);
  logseq.Editor.registerBlockContextMenuItem("Local Telegram Bot: Send", async (e) => {
    console.log(e);
  });
  logseq.Editor.registerSlashCommand("Local Telegram Bot: Send", async (e) => {
    console.log(e);
  });

  try {
    await bot.launch();
  } catch (e) {
    error("Failed to launch bot");
  }

  log("Start");
}

async function main() {
  logseq.useSettingsSchema(settingsSchema);
  logseq.onSettingsChanged((new_settings, old_settings) => {
    if (new_settings.botToken != old_settings.botToken) {
      if (new_settings.botToken.match(botTokenRegex)) {
        start();
      } else {
        logseq.UI.showMsg("[Local Telegram Bot] Bot Token is not valid");
      }
    } 
  });

  if (!settings.botToken.match(botTokenRegex)) {
    logseq.UI.showMsg("[Local Telegram Bot] Bot Token is not valid");
    logseq.showSettingsUI();
    return;
  }

  start();
}

// bootstrap
logseq.ready(main).catch(console.error);
