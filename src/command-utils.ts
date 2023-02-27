import "@logseq/libs";
import { LSPluginUser } from "@logseq/libs/dist/LSPlugin.user";

import { OPEN_PLAYGROUND_RENDERER } from "./command-playground";
import { log, error } from "./utils";

export { Command, parseCommand, runCommand, stringifyCommand, setupSlashCommands, commandInfos, COMMAND_PAGE_NAME };

class Command {
  public type: string = "";
  public name: string = "";
  public params: string[] = [];
  public script: string = "";
  public description: string = "";
}

class CommandInfo {
  public type: string = "";
  public language: string = "";
  public description: string = "";
  public slashCommand: string = "";

  public constructor(
    type: string,
    language: string,
    description: string,
    slashCommand: string) {
    this.type = type;
    this.language = language;
    this.description = description;
    this.slashCommand = slashCommand;
  }

  public get pageName(): string {
    return `[[${COMMAND_PAGE_NAME}/${this.type}]]`;
  }
}

const COMMAND_PAGE_NAME = "local-telegram-bot";
const QUERY_COMMAND = "query";
const RUN_COMMAND = "run";

const commandInfos: CommandInfo[] = [
  new CommandInfo(
    QUERY_COMMAND,
    "clojure",
    "Query customized datascript",
    "Local Telegram Bot: Define Customized Query"),
  new CommandInfo(
    RUN_COMMAND,
    "js",
    "Run customized js",
    "Local Telegram Bot: Define Customized Query")
];

function slashTemplate(name: string, language: string) {
  let template = `[[${COMMAND_PAGE_NAME}/${name}]] name param0 param1 ${OPEN_PLAYGROUND_RENDERER}\n`;
  template += `\`\`\`${language}\n\`\`\`\n`;
  template += "description";
  return template;
}

function setupSlashCommands() {
  // FIXME: unable to un-register?
  for (let info of commandInfos) {
    logseq.Editor.registerSlashCommand(info.slashCommand, async (e) => {
      logseq.Editor.updateBlock(e.uuid, slashTemplate(info.type, info.language));
    });
  }
}

// FIXME: not that sandboxed
// function needs to be run here, not outside iframe
async function runFunction(body: string, argv: any[], params: string[] = []) {
  const func = `function(${params.join(", ")}) { "use stricts"; ${body} }`;
  const wrap = `{ return async ${func}; };`;

  const iframe = document.createElement('iframe');
  iframe.style.display = "none";
  // try best to sandbox
  iframe.sandbox.value = "allow-same-origin allow-scripts";
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
  let commandInfo: CommandInfo | undefined;
  for (let info of commandInfos) {
    if (content.startsWith(info.pageName)) {
      commandInfo = info;
      break;
    }
  }

  if (!commandInfo) {
    log(`content is not valid: ${content}`);
    return null;
  }

  const parts = content.substring(commandInfo.pageName.length).split("```");
  if (parts.length < 2) {
    log(`content is not valid: ${content}`);
    return null;
  }

  const command = new Command();
  command.type = commandInfo.type;

  let signature = parts[0].trim();
  if (signature.endsWith(OPEN_PLAYGROUND_RENDERER)) {
    signature = signature.substring(0, signature.length - OPEN_PLAYGROUND_RENDERER.length).trim();
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
  let commandInfo: CommandInfo | undefined;
  for (let info of commandInfos) {
    if (info.type === command.type) {
      commandInfo = info;
      break;
    }
  }

  if (!commandInfo) {
    log(`command is not valid: ${command.type}`);
    return "";
  }

  const lines: string[] = [
    `${commandInfo.pageName} ${command.name} ${command.params.join(" ")} ${OPEN_PLAYGROUND_RENDERER}\n`,
    "```" + commandInfo.language + "\n" + command.script + "\n```\n",
    `${command.description}\n`
  ];

  return lines.join("");
}