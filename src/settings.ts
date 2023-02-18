import "@logseq/libs";
import { SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";

export { settings, initializeSettings, JOURNAL_PAGE_NAME };

const JOURNAL_PAGE_NAME = "Journal";

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
    return logseq.settings!.authorizedUsers.split(",").map((rawUserName: string) => rawUserName.trim());
  }

  public get pageName() {
    if (!logseq.settings!.pageName) {
      logseq.settings!.pageName = JOURNAL_PAGE_NAME;
    }

    return logseq.settings!.pageName;
  }

  public get inboxName() {
    return logseq.settings!.inboxName;
  }

  public get scheduledNotificationTime() {
    if (logseq.settings!.scheduledNotificationTime) {
      return new Date(logseq.settings!.scheduledNotificationTime);
    } else {
      return null;
    }
  }

  public get deadlineNotificationTime() {
    if (logseq.settings!.deadlineNotificationTime) {
      return new Date(logseq.settings!.deadlineNotificationTime);
    } else {
      return null;
    }
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
    description: "The content of the block that all regulare messages from Telegram are added to. If it's not found, messages are added to the 2nd block of the current page",
    type: "string",
    default: "#Inbox",
    title: "Inbox Name",
  },
  {
    key: "scheduledNotificationTime",
    description: "The local time of notificaiton for not-done task with scheduled date. The message should be sent one day before the scheduled at this specific time. Clearing it disable this feature",
    type: "string",
    default: "",
    title: "Scheduled Notification Time",
    inputAs: "datetime-local"
  },
  {
    key: "deadlineNotificationTime",
    description: "The local time of notificaiton for not-done task with deadline date. The message should be sent one day before the deadline at this specific time. Clearing it disables this feature",
    type: "string",
    default: "",
    title: "Deadline Notification Time",
    inputAs: "datetime-local"
  }
];

function initializeSettings() {
  logseq.useSettingsSchema(settingsSchema);
  settings = new Settings();
}