import "@logseq/libs";
import { LSPluginUser } from "@logseq/libs/dist/LSPlugin.user";

import { log, error } from "./utils";

export { Command, parseCommand, runCommand, stringifyCommand, commandTypes, COMMAND_PAGE_NAME, QUERY_COMMAND, RUN_COMMAND, DEBUG_CMD_RENDERER };

class Command {
  public type: string = "";
  public name: string = "";
  public params: string[] = [];
  public script: string = "";
  public description: string = "";
}

const COMMAND_PAGE_NAME = "local-telegram-bot";
const QUERY_COMMAND = "query";
const RUN_COMMAND = "run";
const DEBUG_CMD_RENDERER = "{{renderer :local_telegram_bot-debugCmd}}";

const commandTypes: { [key: string]: string } = {
  [`[[${COMMAND_PAGE_NAME}/${QUERY_COMMAND}]]`]: `${QUERY_COMMAND}`,
  [`[[${COMMAND_PAGE_NAME}/${RUN_COMMAND}]]`]: `${RUN_COMMAND}`,
};


// FIXME: not that sandboxed
// function needs to be run here, not outside iframe
async function runFunction(body: string, argv: any[], params: string[] = []) {
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
  const result = await sandboxedFunc.apply(null, argv);
  document.body.removeChild(iframe);

  return {
    result: result,
    logs: logs
  };
}

async function runScript(script: string, inputs: any[]) {
  return {
    result: await logseq.DB.datascriptQuery(script, ...inputs),
    logs: [] as any[]
  }
}

function parseCommand(content: string): Command | null {
  let prefix = "";
  for (let key in commandTypes) {
    if (content.startsWith(key)) {
      prefix = key;
      break;
    }
  }

  if (!prefix) {
    log(`content is not valid: ${content}`);
    return null;
  }

  const parts = content.substring(prefix.length).split("```");
  if (parts.length < 2) {
    log(`content is not valid: ${content}`);
    return null;
  }

  const command = new Command();
  command.type = commandTypes[prefix];

  let signature = parts[0].trim();
  if (signature.endsWith(DEBUG_CMD_RENDERER)) {
    signature = signature.substring(0, signature.length - DEBUG_CMD_RENDERER.length).trim();
  }

  const names = signature.split(" ");
  command.name = names[0];
  command.params = names.slice(1);

  command.script = parts[1].substring(parts[1].indexOf("\n")).trim();
  command.description = parts.length == 3 ? parts[2].trim() : "";

  return command;
}

async function runCommand(command: Command, argv: any[]) {
  switch (command.type) {
    case "query":
      return await runScript(command.script, argv);

    case "run":
      return await runFunction(command.script, argv, command.params);

    default:
      error(`invalid command type: ${command.type}`);
      return null;
  }
}

function stringifyCommand(command: Command): string {
  let prefix = "";
  for (let key in commandTypes) {
    if (commandTypes[key] === command.type) {
      prefix = key;
      break;
    }
  }

  if (!prefix) {
    log(`command is not valid: ${command.type}`);
    return "";
  }

  // FIXME: remove this
  const language = command.type == QUERY_COMMAND ? "clojure" : "js";

  const lines: string[] = [
    `${prefix} ${command.name} ${command.params.join(" ")} ${DEBUG_CMD_RENDERER}\n`,
    "```" + language + "\n" + command.script + "\n```\n",
    `${command.description}\n`
  ];

  return lines.join("");
}