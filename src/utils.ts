import "@logseq/libs";
import { LSPluginUser } from "@logseq/libs/dist/LSPlugin.user";

import { Message } from "typegram";

import { settings } from "./settings";

export { log, error, showMsg, showError, getDateString, isMessageAuthorized, nameof, runFunction, runScript };

const PROJECT_NAME = "Local Telegram Bot";

function format(message: string) {
  return `[${PROJECT_NAME}] ` + message;
}

// FIXME: not that sandboxed
// function needs to be run here, not outside iframe
async function runFunction(body: string, args: string[], params: string[] = []) {
  const func = `function(${params.join(", ")}) { "use stricts"; ${body} }`;
  const wrap = `{ return async ${func}; };`;
  
  const iframe = document.createElement('iframe');
  // try best to sandbox
  iframe.sandbox.value = "allow-same-origin";
  document.body.appendChild(iframe);

  // pass logseq to iframe
  iframe.contentWindow!.logseq = logseq as LSPluginUser;
  const logs: any[] = [];
  const newLog = (...data: any[]) => {
    logs.push(...data);
  }
  iframe.contentWindow!.self.console.log = newLog;
  iframe.contentWindow!.self.console.error = newLog;

  const sandboxedFunc: Function = new iframe.contentWindow!.self.Function(wrap).call(null);
  const result = await sandboxedFunc.apply(null, args);
  document.body.removeChild(iframe);

  return {
    result: result,
    logs: logs
  };
}

async function runScript(script: string, inputs: string[]) {
  return {
    result: await logseq.DB.datascriptQuery(script, ...inputs),
    logs: [] as any[]
  }
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
