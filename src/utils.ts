import "@logseq/libs";
import { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

import { Message } from "typegram";

import { settings } from "./settings";

export { log, error, showMsg, showError, getDateString, getTimestampString, isMessageAuthorized, nameof, stringifyBlocks };

const PROJECT_NAME = "Local Telegram Bot";

function format(message: string) {
  return `[${PROJECT_NAME}] ` + message;
}

// Though it doesn't provide the name, at least it does compile check
// https://stackoverflow.com/a/50470026
function nameof<T>(name: Extract<keyof T, string>): string {
  return name;
}

function log(message: string) {
  console.log(format(message));
}

function error(message: string) {
  console.error(format(message));
}

function showMsg(message: string) {
  logseq.UI.showMsg(format(message));
}

function showError(message: string) {
  logseq.UI.showMsg(format(message), "error");
}

function getDateString(date: Date) {
  const d = {
    day: `${date.getDate()}`.padStart(2, "0"),
    month: `${date.getMonth() + 1}`.padStart(2, "0"),
    year: date.getFullYear()
  };

  return `${d.year}${d.month}${d.day}`;
}

function getTimestampString(date: Date) {
  const t = {
    hour: `${date.getHours()}`.padStart(2, "0"),
    minute: `${date.getMinutes()}`.padStart(2, "0")
  };

  return `${t.hour}:${t.minute}`;
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

function convertBlocksToText(root: BlockEntity, addId: boolean, tab: string, indent: string): string {
  if (!root) {
    error("Block doesn't include content");
    return "";
  }

  let text = indent + root.content + (addId ? `(\`${root.uuid}\`)` : "") + "\n";
  if (root.children) {
    for (let child of root.children) {
      text += convertBlocksToText(child as BlockEntity, addId, tab, indent + tab);
    }
  }

  return text;
}

function stringifyBlocks(root: BlockEntity, addId: boolean) {
  return convertBlocksToText(root, addId, "\t\t", "");
}