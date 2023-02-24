import { BlockEntity, IUserOffHook, PageEntity } from "@logseq/libs/dist/LSPlugin.user";

import { Telegraf, Context } from "telegraf";
import { Message } from "typegram";
import stringArgv from "string-argv";
import minimist from "minimist";
import { marked } from "marked";

// json-view doesn't have types
// @ts-ignore
import jsonview from '@pgrabovets/json-view';
import "@pgrabovets/json-view/src/jsonview.scss"

import { settings } from "./settings";
import { runFunction, runScript, isMessageAuthorized, log, error } from "./utils";

export { setupCommandHandlers, enableCustomizedCommands, disableCustomizedCommands };

type CommandHandler = (ctx: Context) => Promise<void>;

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

const commandTypes: { [ key: string ]: string } = {
  [`[[${COMMAND_PAGE_NAME}/${QUERY_COMMAND}]]`]: `${QUERY_COMMAND}`,
  [`[[${COMMAND_PAGE_NAME}/${RUN_COMMAND}]]`]: `${RUN_COMMAND}`,
};

const commandHandlers: { type: string, description: string, handler: CommandHandler }[] = [
  runHandlerGenerator(),
  queryHandlerGenerator(),
  helpHandlerGenerator()
];

const commands = new Map<string, { [key: string]: Command }>;

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

  command.script = parts[1].substring(parts[1].indexOf("\n"));
  command.description = parts.length == 3 ? parts[2].trim() : "";

  return command;
}

async function runCommand(command: Command, argv: string[]) {
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

async function updateCommands() {
  // FIXME: no need to clear everytime
  commands.clear();

  const refs = await logseq.Editor.getPageLinkedReferences(COMMAND_PAGE_NAME);
  if (!refs) {
    log(`no customized commands`);
    return;
  }

  for (let ref of refs) {
    for (let block of ref[1]) {
      const command = parseCommand(block.content);
      if (!command) {
        continue;
      }

      if (!commands.has(command.type)) {
        commands.set(command.type, {});
      }

      commands.get(command.type)![command.name] = command;
    }
  }
}

function handleArgs(key: string, args: string): { command: Command, argv: string[] } | null {
  if (!commands.has(key)) {
    return null;
  }

  const cmds = commands.get(key)!;

  const argv = minimist(stringArgv(args))._;
  if (!cmds[argv[0]]) {
    return null;
  }

  return {
    command: cmds[argv[0]],
    argv: argv
  }
}

async function processCommand(type: string, ctx: Context) {
  const prefix = `/${type}`;
  const text = ctx.message!.text;
  
  // this should never happen
  if (!text.startsWith(prefix)) {
    error(`invalid command: ${type}: ${text}`);
    ctx.reply("not a valid command");
    return;
  }

  const args = text.substring(prefix.length + 1);
  const h = handleArgs(type, args);
  if (!h) {
    ctx.reply("not a valid command");
    return;
  }

  await handleCommand(h.command, h.argv, ctx);
}

async function handleCommand(command: Command, argv: string[], ctx: Context) {
  if (!command.script) {
    ctx.reply("not a valid command");
    return;
  }

  try {
    const result = await runCommand(command, argv.slice(1));
    if (result?.result != undefined && result?.result != null) {
      // FIXME: maximum size of message is 4k
      // how to enable users to copy uuid?
      const msg = JSON.stringify(result.result, null, 2);
      const html = marked.parseInline(msg);
      await ctx.reply(html, { parse_mode: "HTML" });
    } else if (result?.logs && result?.logs.length > 0) {
      ctx.reply(JSON.stringify(result.logs, null, 2));
    } else {
      ctx.reply("unknown error");
    }
  } catch (e) {
    ctx.reply((<Error>e).message);
  }
}

function runHandlerGenerator() {
  return {
    type: RUN_COMMAND,
    description: "Customized js/ts script",
    handler: async (ctx: Context) => {
      processCommand(RUN_COMMAND, ctx);
    }
  }
}

function queryHandlerGenerator() {
  return {
    type: QUERY_COMMAND,
    description: "Customized datascript query",
    handler: async (ctx: Context) => {
      processCommand(QUERY_COMMAND, ctx);
    }
  }
}

function helpHandlerGenerator() {
  return {
    type: "help",
    description: "List all available commands",
    handler: async (ctx: Context) => {
      let msg = "Available commands:\n";
      for (let { type, description, handler } of commandHandlers) {
        msg += `/${type}: ${description}\n`;
      }

      if (commands.size > 0) {
        msg += "\nCustomized commands:\n";
        commands.forEach((cmds, type) => {
          for (let subType in cmds) {
            const cmd = cmds[subType];
            msg += `[/${type} ${subType}|/${subType}] ${cmd.params.join(" ")}: ${cmd.description}\n`
          }
        });
      }

      ctx.reply(msg);
    }
  }
}

function slashTemplate(name: string, language: string) {
  let template = `[[${COMMAND_PAGE_NAME}/${name}]] name param0 param1 ${DEBUG_CMD_RENDERER}\n`;
  template += `\`\`\`${language}\n\`\`\`\n`;
  template += "description";
  return template;
}

function inputTemplate(index: number, blockId: string, placeholder: string) {
  return `<input id="param${index}-${blockId}"
               class="debugCmd-param"
               placeholder="${placeholder}"
               data-on-click="debugCmd_click_input" />`;
}

function setupSlashCommands() {
  // FIXME: unable to un-register?
  logseq.Editor.registerSlashCommand("Local Telegram Bot: Define Customized Query", async (e) => {
    logseq.Editor.updateBlock(e.uuid, slashTemplate(QUERY_COMMAND, "clojure"));
  });

  logseq.Editor.registerSlashCommand("Local Telegram Bot: Define Customized Run", async (e) => {
    logseq.Editor.updateBlock(e.uuid, slashTemplate(RUN_COMMAND, "ts"));
  });
}

function createDebugResultView(result: any, logs: any[]) {
  const logsDiv = document.createElement("div") as HTMLDivElement;
  logsDiv.className = "debugCmd-logs";
  const logsView = jsonview.create(logs);
  jsonview.render(logsView, logsDiv);

  // Fix json-view string parse
  if (typeof result === "string") {
    result = `"${result}"`;
  }
  const resultView = jsonview.create(result);
  const resultDiv = document.createElement("div") as HTMLDivElement;
  resultDiv.className = "debugCmd-result";

  const closeDebug = (e: Event) => {
    const target = e.target as HTMLElement;

    if (target.closest(".debugCmd-result") === null && resultDiv.parentElement == document.body) {
      logseq.toggleMainUI();
      document.body.removeChild(resultDiv);
      jsonview.destroy(resultView);
      jsonview.destroy(logsView);
      document.removeEventListener("click", closeDebug);
    }
  };
  document.addEventListener("click", closeDebug);
  logseq.showMainUI();
  jsonview.render(resultView, resultDiv);
  resultDiv.appendChild(logsDiv);

  document.body.appendChild(resultDiv);
}

function setupDebug() {
  logseq.provideStyle(`
    .debugCmd {
      background-color: orange;
      display: inline-table;
      cursor: pointer;
    }
    .debugCmd-try {
      color: green;
      margin: 0 5px 0;
    }
    .debugCmd-param {
      width: 60px;
      padding: 0 2px 0;
      margin: 2px;
    }
    `);

  let css = document.querySelector("style") as HTMLStyleElement;
  logseq.provideStyle(css.textContent!);

  logseq.provideModel({
    async debugCmd_try(e: any) {
      const { blockid } = e.dataset;
      const block = await logseq.Editor.getBlock(blockid);
      if (!block) {
        return;
      }

      const cmd = parseCommand(block.content);
      if (!cmd) {
        log(`invalid command content: ${block.content}`);
        return;
      }

      const argv: string[] = [];
      for (let i = 0; i < cmd.params.length; i++) {
        const input = top!.document.querySelector(`#param${i}-${blockid}`) as HTMLInputElement;
        argv.push(input.value);
      }

      let result: any = null;
      let logs: any[] = [];
      
      try {
        const commandResult = await runCommand(cmd, argv);
        if (commandResult == null) {
          logs.push("unknow error");
        } else {
          result = commandResult.result;
          logs = commandResult.logs;
        }
      } catch (e) {
        logs.push(e);
      }

      createDebugResultView(result, logs);
    },
    debugCmd_click_input(e: any) {
      const input = top!.document.querySelector(`#${e.id}`) as HTMLInputElement;
      input!.focus();
    }
  });

  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    let [type] = payload.arguments;
    if (type !== ':local_telegram_bot-debugCmd') {
      return;
    }

    const block = await logseq.Editor.getBlock(payload.uuid);
    if (!block) {
      log(`invalid command block: ${slot}: ${payload.uuid}`);
      return;
    }

    const cmd = parseCommand(block.content);
    if (!cmd) {
      log(`invalid command content: ${block.content}`);
      return;
    }

    const inputs: string[] = [];
    for (let i = 0; i < cmd.params.length; i++) {
      inputs.push(inputTemplate(i, payload.uuid, cmd.params[i]));
    }

    logseq.provideUI({
      key: payload.uuid,
      slot,
      template: `
      <div class="debugCmd">
        <span class="debugCmd-try"
              data-blockid="${payload.uuid}"
              data-on-click="debugCmd_try">▶️</span>
        ${inputs.join("")}
      </div>
     `,
    });
  });
}

function setupCommandMiddleware(bot: Telegraf<Context>) {
  bot.use((ctx, next) => {
    if (!ctx.message?.text) {
      next();
      return;
    }

    const text = ctx.message.text;
    if (!settings.enableCustomizedCommandFromMessage) {
      for (let prefix in commandTypes) {
        if (text.startsWith(prefix)) {
          log(`command is not allowed in message: ${text}`);
          ctx.reply("Command is not allowed in message");
          return;
        }
      }
    }

    if (text.startsWith("/")) {
      let handled = false;
      commands.forEach((_, type) => {
        if (handled) {
          return;
        }

        const h = handleArgs(type, text.substring(1));
        if (!h) {
          return;
        }

        handled = true;
        handleCommand(h.command, h.argv, ctx);
      });

      if (handled) {
        return;
      }
    }

    next();
  });
}

let unsubscribe: IUserOffHook = () => { };

function setupCommandHandlers(bot: Telegraf<Context>) {
  for (let handler of commandHandlers) {
    bot.command(handler.type, (ctx) => {
      if (ctx.message
        && isMessageAuthorized(ctx.message as Message.ServiceMessage)) {
        handler.handler(ctx);
      }
    });
  }

  setupCommandMiddleware(bot);
  setupSlashCommands();
  setupDebug();
}

function enableCustomizedCommands() {
  unsubscribe();
  unsubscribe = logseq.DB.onChanged((e) => {
    updateCommands();
  });
  updateCommands();
  log("customized commands are enabled");
}

function disableCustomizedCommands() {
  unsubscribe();
  commands.clear();
  log("customized commands are disabled");
}