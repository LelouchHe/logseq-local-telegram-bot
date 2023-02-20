import "@logseq/libs";

import { Message } from "typegram";

import { settings } from "./settings";

export { log, error, showMsg, getDateString, isMessageAuthorized, nameof, createFunction };

const PROJECT_NAME = "Local Telegram Bot";

function format(message: string) {
  return `[${PROJECT_NAME}] ` + message;
}

function createFunction(body: string, params: string[] = []) {
  const func = `function(${params.join(", ")}) { ${body} }`;
  const wrap = () => `{ return ${func}; };`;
  return new Function(wrap()).call(null);
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

function getDateString(date: Date) {
  const d = {
    day: `${date.getDate()}`.padStart(2, "0"),
    month: `${date.getMonth() + 1}`.padStart(2, "0"),
    year: date.getFullYear()
  }

  return `${d.year}${d.month}${d.day}`;
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
