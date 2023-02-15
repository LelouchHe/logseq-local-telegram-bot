import "@logseq/libs";
import { PageEntity, BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";

// 4.* has URL is not constructor error, fallback to 3.*
import { Telegraf, Context  } from "telegraf";
import { MessageSubTypes  } from "telegraf/typings/telegram-types";
import { Message } from "typegram";

import { marked } from "marked"

type InputHandler = (ctx: Context, message: Message.ServiceMessage) => Promise<void>;
type OperationHandler = (bot: Telegraf<Context>, blockId: string) => Promise<void>;

class Settings {
  constructor() {
    if (!logseq.settings!.chatIds) {
      logseq.updateSettings({ "chatIds": {} });
    }
  }

  public get botToken(): string {
    return logseq.settings!.botToken;
  }

  public get isMainBot(): boolean {
    return logseq.settings!.isMainBot;
  }

  public get authorizedUsers() {
    return parseAuthorizedUsers(logseq.settings!.authorizedUsers);
  }
  public set authorizedUsers(users: string[]) {
    logseq.settings!.authorizedUsers = users.join(",");
  }

  public get pageName() {
    if (!logseq.settings!.pageName) {
      this.pageName = JOURNAL_PAGE_NAME;
    }

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

  // below are internal persistent data

  // key: userName
  // value: chatId
  public get chatIds(): { [key: string]: number } {
    const users = settings.authorizedUsers;
    let chatIds = logseq.settings!.chatIds;
    for (let key in chatIds) {
      if (!users.includes(key)) {
        delete chatIds[key];
      }
    }
    settings.chatIds = chatIds;
    return logseq.settings!.chatIds;
  }
  public set chatIds(ids: { [key: string]: number }) {
    // it's a bug to update settings for array/object type
    // need to set it to something else before updating it
    logseq.updateSettings({ "chatIds": null });
    logseq.updateSettings({ "chatIds": ids });
  }
}

let settings: Settings;

const JOURNAL_PAGE_NAME = "Journal";
const BOT_TOKEN_REGEX = /^[0-9]{8,10}:[a-zA-Z0-9_-]{35}$/;
const SCHEDULED_JOB = 0;
const DEADLINE_JOB = 1;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

const settingsSchema: SettingSchemaDesc[] = [
  {
    key: "botToken",
    description: "Telegram Bot token. In order to start you need to create Telegram bot: https://core.telegram.org/bots#3-how-do-i-create-a-bot. Create a bot with BotFather, which is essentially a bot used to create other bots. The command you need is /newbot. After you choose title, BotFaher give you the token",
    type: "string",
    default: "",
    title: "Bot Token",
  },
  {
    key: "isMainBot",
    description: "If you have multiple Logseq open at the same time, probably from different devices, only one should be set to true, to avoid conflicts of multiple bots running together",
    type: "boolean",
    default: false,
    title: "Is Main Bot",
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
    description: "The name of the page that all regular messages from Telegram are added to. \"Journal\" is reserved for today's Journal, and it's the default. The page should be available.",
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
  "register": handleRegisterCommand as InputHandler,
  "help": handleHelpCommand as InputHandler
};

const blockContextMenuHandlers: { [key: string]: OperationHandler } = {
  "Send": handleSendOperation as OperationHandler
};

function log(message: string) {
  console.log("[Local Telegram Bot] " + message);
}

function error(message: string) {
  console.error("[Local Telegram Bot] " + message);
}

function showMsg(message: string) {
  logseq.UI.showMsg("[Local Telegram Bot] " + message);
}

function parseAuthorizedUsers(d: string): string[] {
  return d.split(",").map((rawUserName: string) => rawUserName.trim());
}

function getDateString(date: Date) {
  const d = {
    day: `${date.getDate()}`.padStart(2, "0"),
    month: `${date.getMonth() + 1}`.padStart(2, "0"),
    year: date.getFullYear()
  }

  return `${d.year}${d.month}${d.day}`;
}

async function findNotDone(date: Date, type: string) {
  const dateString = getDateString(date);
  const ret: Array<PageEntity[]> | undefined = await logseq.DB.datascriptQuery(`
    [:find (pull ?b [*])
     :where
     [?b :block/${type} ?d]
     [(= ?d ${dateString})]
     [?b :block/marker ?marker]
     [(not= #{"DONE"} ?marker)]]
    `);
  
  if (!ret) {
    log(`There are no NotDone ${type} for ${dateString}`);
    return [];
  }

  return ret.flat();
}

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

async function handleRegisterCommand(ctx: Context, message: Message.ServiceMessage) {
  ctx.reply(`${message.from!.username} have been successfully registered.
            You are eligible to receive message from now`);
}

async function handleHelpCommand(ctx: Context, message: Message.ServiceMessage) {
  ctx.reply(`this is help: ${ctx.message?.text}`);
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
  await writeBlocks(
    settings.pageName,
    settings.inboxName,
    [`{{renderer :local_telegram_bot,${message.caption ?? "no caption"},${lastPhoto.file_id}}}`]);
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

  const chatIds = settings.chatIds;
  if (!(message.from.username in chatIds)) {
    chatIds[message.from.username] = message.chat.id;
  }

  settings.chatIds = chatIds;

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

function convertBlocksToText(root: BlockEntity, tab: string, indent: string): string {
  if (!root) {
    error("Block doesn't include content");
    return "";
  }

  let text = indent + root.content + "\n";
  if (root.children) {
    for (let child of root.children) {
      text += convertBlocksToText(child as BlockEntity, tab, indent + tab);
    }
  }

  return text;
}

async function handleSendOperation(bot: Telegraf<Context>, blockId: string) {
  if (Object.keys(settings.chatIds).length == 0) {
    showMsg("Authorized users need to \"/register\" first");
    return;
  }
  const root = await logseq.Editor.getBlock(blockId, { includeChildren: true });
  if (!root) {
    showMsg("Fail to get block");
    return;
  }

  const text = convertBlocksToText(root, "\t\t", "");
  const html = marked.parseInline(text);
  for (let key in settings.chatIds) {
    bot.telegram.sendMessage(settings.chatIds[key], html, { parse_mode: "HTML" });
    log("Send message");
  }
}

function setupBlockContextMenu(bot: Telegraf<Context>) {
  for (let key in blockContextMenuHandlers) {
    logseq.Editor.registerBlockContextMenuItem(`Local Telegram Bot: ${key}`, async (e) => {
      blockContextMenuHandlers[key](bot, e.uuid);
    });
  }
}

function setupSlashCommand(bot: Telegraf<Context>) {
  logseq.Editor.registerSlashCommand("Local Telegram Bot: Send", async (e) => {
    handleSendOperation(bot, e.uuid);
  });
}

function setupMacro(bot: Telegraf<Context>) {
  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    let [type, caption, photoId] = payload.arguments;
    if (type !== ':local_telegram_bot') {
      return;
    }

    // photo url from Telegram is not permanent, need to fetch everytime
    // FIXME: use caption, instead of alt
    const photoUrl = await bot.telegram.getFileLink(photoId);
    logseq.provideUI({
      key: photoId,
      slot,
      template: `<img src="${photoUrl}" alt="${caption}" />`,
    });
  });
}

function getDelayInMs(time: Date) {
  const now = new Date();
  time.setFullYear(now.getFullYear());
  time.setMonth(now.getMonth());
  time.setDate(now.getDate());

  if (time < now) {
    time.setTime(time.getTime() + ONE_DAY_IN_MS);
  }

  return time.getTime() - now.getTime();
}

const jobIds: number[] = [ 0, 0 ];
function runAtEveryday(which: number, time: Date, cb: () => void) {
  const delay = getDelayInMs(time);
  jobIds[which] = setTimeout(() => {
    log(`job(${which}) is running at ${new Date().toLocaleString()}`);
    cb();
    jobIds[which] = runAtEveryday(which, time, cb);
  }, delay);

  log(`job(${which}) will run in ${delay} ms`);

  return jobIds[which];
}

async function setupTimedJob(bot: Telegraf<Context>) {
  runAtEveryday(SCHEDULED_JOB, new Date(), async () => {
    console.log(jobIds);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const scheduledList = await findNotDone(tomorrow, "scheduled");
    for (let scheduled of scheduledList) {
      handleSendOperation(bot, scheduled.uuid);
    }
  });

  runAtEveryday(DEADLINE_JOB, new Date(), async () => {
    console.log(jobIds);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const deadlineList = await findNotDone(tomorrow, "deadline");
    for (let deadline of deadlineList) {
      handleSendOperation(bot, scheduled.uuid);
    }
  });
}

// FIXME: start order should be refactored to remove global bot
// global bot
let bot: Telegraf<Context>;

async function start() {
  if (bot) {
    // restart with new botToken
    bot.token = settings.botToken;
  } else {
    // start first time
    bot = new Telegraf(settings.botToken);

    // inbound message
    setupCommands(bot);
    setupMessageTypes(bot);

    // logseq operation
    setupBlockContextMenu(bot);
    setupSlashCommand(bot);
    setupMacro(bot);

    // job at certain time
    setupTimedJob(bot);

    if (settings.isMainBot) {
      bot.launch();
      log("Bot is launched");
    }

    log("Bot is ready");
  }
}

async function main() {
  settings = new Settings();

  logseq.useSettingsSchema(settingsSchema);
  logseq.onSettingsChanged((new_settings, old_settings) => {
    if (new_settings.botToken != old_settings.botToken) {
      if (settings.botToken.match(BOT_TOKEN_REGEX)) {
        start();
      } else {
        showMsg("Bot Token is not valid");
      }
    }

    if (new_settings.isMainBot != old_settings.isMainBot) {
      if (bot) {
        if (settings.isMainBot) {
          bot.launch();
          log("Bot is launched");
        } else {
          bot.stop();
          log("Bot is stopped");
        }
      }
    }
  });

  if (!settings.botToken.match(BOT_TOKEN_REGEX)) {
    showMsg("Bot Token is not valid");
    logseq.showSettingsUI();
    return;
  }

  start();
}

// bootstrap
logseq.ready(main).catch(console.error);
