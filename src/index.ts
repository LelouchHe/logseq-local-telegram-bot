import "@logseq/libs";
import { PageEntity, BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

// 4.* has URL is not constructor error, fallback to 3.*
import { Telegraf, Context  } from "telegraf";

import { marked } from "marked"

// internal
import { log, error, showMsg, getDateString } from "./utils";
import { runAtInterval, cancelJob } from "./timed_job";
import { settings, initializeSettings } from "./settings";
import { setupMessageHandlers } from "./message_handlers";
import { setupCommandHandlers } from "./command_handlers";

type OperationHandler = (bot: Telegraf<Context>, blockId: string) => Promise<void>;

const BOT_TOKEN_REGEX = /^[0-9]{8,10}:[a-zA-Z0-9_-]{35}$/;
const ONE_DAY_IN_SECOND = 24 * 60 * 60;
const SCHEDULED_NOTIFICATION_JOB = "ScheduledTimedJob";
const DEADLINE_NOTIFICATION_JOB = "DeadlineNotificationJob";
const JOB_TYPES: { [ key: string ]: string } = {
  [SCHEDULED_NOTIFICATION_JOB]: "scheduled",
  [DEADLINE_NOTIFICATION_JOB]: "deadline"
};

const blockContextMenuHandlers: { [key: string]: OperationHandler } = {
  "Send": handleSendOperation as OperationHandler
};

async function findTask(date: Date, type: string, status: string[]) {
  const dateString = getDateString(date);
  const ret: Array<PageEntity[]> | undefined = await logseq.DB.datascriptQuery(`
    [:find (pull ?b [*])
     :where
     [?b :block/${type} ?d]
     [(= ?d ${dateString})]
     [?b :block/marker ?marker]
     [(contains? #{${status.map(s => ("\"" + s + "\"")).join(" ")}} ?marker)]]
    `);
  
  if (!ret) {
    log(`There are no tasks with ${type} for ${dateString}`);
    return [];
  }

  return ret.flat();
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

function startTimedJob(bot: Telegraf<Context>, name: string, time: Date) {
  runAtInterval(name, time, ONE_DAY_IN_SECOND, async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tasks = await findTask(tomorrow, JOB_TYPES[name], ["TODO", "DOING", "NOW", "LATER", "WAITING"]);
    for (let task of tasks) {
      handleSendOperation(bot, task.uuid);
    }
  });
}

function updateTimedJob(bot: Telegraf<Context>, name: string, time: Date | null) {
  cancelJob(name);
  if (time) {
    startTimedJob(bot, name, time);
  }
}

function setupTimedJob(bot: Telegraf<Context>) {
  if (settings.scheduledNotificationTime) {
    startTimedJob(bot, SCHEDULED_NOTIFICATION_JOB, settings.scheduledNotificationTime);
  }

  if (settings.deadlineNotificationTime) {
    startTimedJob(bot, DEADLINE_NOTIFICATION_JOB, settings.deadlineNotificationTime);
  }
}

function setupMarked(bot: Telegraf<Context>) {
  const renderer = new marked.Renderer();
  renderer.image = (href, title, text) => {
    return `<a href="${href}">${title ? title : "&#8288;"}</a>`;
  };

  marked.use({ renderer });
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
    // command should be before message
    setupCommandHandlers(bot);
    setupMessageHandlers(bot);

    // logseq operation
    setupBlockContextMenu(bot);
    setupSlashCommand(bot);

    // job at certain time
    setupTimedJob(bot);

    // setupMarked(bot);

    if (settings.isMainBot) {
      bot.launch();
      log("Bot is launched");
    }

    log("Bot is ready");
  }
}

async function main() {
  // logseq.settings is NOT available until now
  initializeSettings();

  // FIXME: refactor settings change
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

    if (new_settings.scheduledNotificationTime != old_settings.scheduledNotificationTime) {
      updateTimedJob(bot, SCHEDULED_NOTIFICATION_JOB, settings.scheduledNotificationTime);
    }

    if (new_settings.deadlineNotificationTime != old_settings.deadlineNotificationTime) {
      updateTimedJob(bot, DEADLINE_NOTIFICATION_JOB, settings.deadlineNotificationTime);
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
