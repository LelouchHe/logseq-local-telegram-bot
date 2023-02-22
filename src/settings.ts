import "@logseq/libs";
import { SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";

import { showMsg, nameof } from "./utils";

export { Settings, settings, initializeSettings, JOURNAL_PAGE_NAME };

const JOURNAL_PAGE_NAME = "Journal";
const BOT_TOKEN_REGEX = /^[0-9]{8,10}:[a-zA-Z0-9_-]{35}$/;

class Settings {
  constructor(onUpdate: (key: string) => void) {
    if (!logseq.settings!.chatIds) {
      logseq.updateSettings({ "chatIds": {} });
    }

    logseq.onSettingsChanged((new_settings, old_settings) => {
      if (new_settings.botToken != old_settings.botToken) {
        if (settings.botToken) {
          onUpdate(nameof<Settings>("botToken"));
        } else {
          showMsg("Bot Token is not valid");
        }
      }

      if (new_settings.isMainBot != old_settings.isMainBot) {
        onUpdate(nameof<Settings>("isMainBot"));
      }

      if (new_settings.scheduledNotificationTime != old_settings.scheduledNotificationTime) {
        onUpdate(nameof<Settings>("scheduledNotificationTime"));
      }

      if (new_settings.deadlineNotificationTime != old_settings.deadlineNotificationTime) {
        onUpdate(nameof<Settings>("deadlineNotificationTime"));  
      }

      if (new_settings.enableCustomizedCommand != old_settings.enableCustomizedCommand) {
        onUpdate(nameof<Settings>("enableCustomizedCommand"));
      }
    });
  }

  // it only has 2 value
  // 1. valid token
  // 2. ""
  public get botToken(): string {
    if (!logseq.settings!.botToken.match(BOT_TOKEN_REGEX)) {
      return "";
    }

    return logseq.settings!.botToken;
  }

  public get isMainBot(): boolean {
    return logseq.settings!.isMainBot;
  }

  public get authorizedUsers(): string[] {
    return logseq.settings!.authorizedUsers.split(",").map((rawUserName: string) => rawUserName.trim());
  }

  public get pageName(): string {
    if (!logseq.settings!.pageName) {
      logseq.settings!.pageName = JOURNAL_PAGE_NAME;
    }

    return logseq.settings!.pageName;
  }

  public get inboxName(): string {
    return logseq.settings!.inboxName;
  }

  public get appendAtBottom(): boolean {
    return logseq.settings!.appendAtBottom;
  }

  public get scheduledNotificationTime() {
    if (this.isMainBot && logseq.settings!.scheduledNotificationTime) {
      return new Date(logseq.settings!.scheduledNotificationTime);
    } else {
      return null;
    }
  }

  public get deadlineNotificationTime() {
    if (this.isMainBot && logseq.settings!.deadlineNotificationTime) {
      return new Date(logseq.settings!.deadlineNotificationTime);
    } else {
      return null;
    }
  }

  public get enableCustomizedCommand(): boolean {
    return this.isMainBot && logseq.settings!.enableCustomizedCommand;
  }

  public get enableCustomizedCommandFromMessage(): boolean {
    return this.enableCustomizedCommand && logseq.settings!.enableCustomizedCommandFromMessage;
  }

  // below are internal persistent data

  // key: userName
  // value: chatId
  public get chatIds(): { [key: string]: number } {
    const users = this.authorizedUsers;
    let chatIds = logseq.settings!.chatIds;
    for (let key in chatIds) {
      if (!users.includes(key)) {
        delete chatIds[key];
      }
    }
    this.chatIds = chatIds;
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
    description: "The content of the block that all regular messages from Telegram are added to. If it's not available, a new Inbox will be created at the end of target page. If its value is empty, the messages will be added to the target page",
    type: "string",
    default: "#Inbox",
    title: "Inbox Name",
  },
  {
    key: "appendAtBottom",
    description: "If it's set to true, the new messages will be appended at the bottom of Inbox, instead of the top.",
    type: "boolean",
    default: false,
    title: "Append At Bottom",
  },
  {
    key: "scheduledNotificationTime",
    description: "The local time of notificaiton for not-done task with scheduled date. The message should be sent one day before the scheduled at this specific time. Clearing it disable this feature. It's only enabled for main bot",
    type: "string",
    default: "",
    title: "Scheduled Notification Time",
    inputAs: "datetime-local"
  },
  {
    key: "deadlineNotificationTime",
    description: "The local time of notificaiton for not-done task with deadline date. The message should be sent one day before the deadline at this specific time. Clearing it disables this feature. It's only enabled for main bot",
    type: "string",
    default: "",
    title: "Deadline Notification Time",
    inputAs: "datetime-local"
  },
  {
    key: "enableCustomizedCommand",
    description: "Whether to enable customized command mode, which enables eligible users to run native js/ts or query datascript. **This is still experimenting**",
    type: "boolean",
    default: false,
    title: "Enable Customized Command",
  },
  {
    key: "enableCustomizedCommandFromMessage",
    description: "Whether to allow messages to include customized command, which enables eligible users to add new commands from Telegram. **This is still experimenting**",
    type: "boolean",
    default: false,
    title: "Enable Customized Command From Message",
  }
];

function initializeSettings(onUpdate: (key: string) => void) {
  logseq.useSettingsSchema(settingsSchema);
  settings = new Settings(onUpdate);
}