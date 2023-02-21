import "@logseq/libs";
import { PageEntity, BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";

// 4.* has URL is not constructor error, fallback to 3.*
import { Telegraf, Context  } from "telegraf";
import { marked } from "marked";

// internal
import { log, error, showMsg, getDateString, nameof } from "./utils";
import { runAtInterval, cancelJob } from "./timed-job";
import { settings, initializeSettings, Settings } from "./settings";
import { setupMessageHandlers } from "./message_handlers";
import { disableCustomizedCommands, enableCustomizedCommands, setupCommandHandlers } from "./command_handlers";

type OperationHandler = (bot: Telegraf<Context>, blockId: string) => Promise<void>;

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

function startTimedJobs(bot: Telegraf<Context>) {
  if (settings.scheduledNotificationTime) {
    startTimedJob(bot, SCHEDULED_NOTIFICATION_JOB, settings.scheduledNotificationTime);
  }

  if (settings.deadlineNotificationTime) {
    startTimedJob(bot, DEADLINE_NOTIFICATION_JOB, settings.deadlineNotificationTime);
  }
}

function stopTimedJobs() {
  cancelJob(SCHEDULED_NOTIFICATION_JOB);
  cancelJob(DEADLINE_NOTIFICATION_JOB);
}

function setupMarked(bot: Telegraf<Context>) {
  const renderer = new marked.Renderer();
  renderer.image = (href, title, text) => {
    return `<a href="${href}">${title ? title : "&#8288;"}</a>`;
  };

  marked.use({ renderer });
}

async function startMainBot(bot: Telegraf<Context>) {
  try {
    // bot.launch can't catch all exception
    // use getMe first
    await bot.telegram.getMe();
    await bot.launch();
  } catch (e) {
    error("bot failed to launch");
    showMsg("Bot Token is not valid");
    logseq.showSettingsUI();

    // rethrow to stop the process
    throw e;
  }

  startTimedJobs(bot);

  if (settings.enableCustomizedCommand) {
    enableCustomizedCommands();
  } else {
    disableCustomizedCommands();
  }

  log("bot has started as Main Bot");
}

async function stopMainBot(bot: Telegraf<Context>) {
  disableCustomizedCommands();
  stopTimedJobs();
  await bot.stop();

  log("bot has stopped as Main Bot");
}

function setupBot(bot: Telegraf<Context>) {
  // command should be before message
  setupCommandHandlers(bot);

  // need this to handle photo renderer for non-Main bot
  setupMessageHandlers(bot);

  // logseq operation
  setupBlockContextMenu(bot);
  setupSlashCommand(bot);

  // setupMarked(bot);
}

// this is called only when botToken is valid in format
async function start(bot: Telegraf<Context>) {
  if (bot.token) {
    log("try to stop the old bot");
    await stopMainBot(bot);
  }

  bot.token = settings.botToken;

  if (settings.enableCustomizedCommand) {
    enableCustomizedCommands();
  }

  if (settings.isMainBot) {
    await startMainBot(bot);
  }

  log("bot is ready");
}

async function main() {
  const bot = new Telegraf<Context>("");

  // logseq.settings is NOT available until now
  initializeSettings((name) => {
    switch (name) {
      case nameof<Settings>("botToken"):
        start(bot);
        break;

      case nameof<Settings>("isMainBot"):
        if (bot.token) {
          if (settings.isMainBot) {
            startMainBot(bot);
          } else {
            stopMainBot(bot);
          }
        }
        break;

      case nameof<Settings>("scheduledNotificationTime"):
        updateTimedJob(bot, SCHEDULED_NOTIFICATION_JOB, settings.scheduledNotificationTime);
        break;

      case nameof<Settings>("deadlineNotificationTime"):
        updateTimedJob(bot, DEADLINE_NOTIFICATION_JOB, settings.deadlineNotificationTime);
        break;

      case nameof<Settings>("enableCustomizedCommand"):
        if (settings.enableCustomizedCommand) {
          enableCustomizedCommands();
        } else {
          disableCustomizedCommands();
        }
        break;
    }
  });

  setupBot(bot);

  if (!settings.botToken) {
    showMsg("Bot Token is not valid");
    logseq.showSettingsUI();
    return;
  }

  start(bot);
}

// bootstrap
logseq.ready(main).catch(console.error);
