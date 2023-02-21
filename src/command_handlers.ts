import { BlockEntity, IUserOffHook, PageEntity } from "@logseq/libs/dist/LSPlugin.user";

import { Telegraf, Context } from "telegraf";
import { Message } from "typegram";
import stringArgv from "string-argv";
import minimist from "minimist";
import { marked } from "marked";

import { runFunction, isMessageAuthorized, log } from "./utils";

export { setupCommandHandlers, commandTypes, enableCustomizedCommands, disableCustomizedCommands };

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

  const names = parts[0].trim().split(" ");
  command.name = names[0];
  command.params = names.slice(1);

  command.script = parts[1].substring(parts[1].indexOf("\n"));
  command.description = parts.length == 3 ? parts[2].trim() : "";

  return command;
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

function handleArgs(key: string, text: string): { command: Command, argv: string[] } | null {
  if (!commands.has(key)) {
    return null;
  }

  const argv = minimist(stringArgv(text))._;
  if (!commands.get(key)![argv[1]]) {
    return null;
  }

  return {
    command: commands.get(key)![argv[1]],
    argv: argv.slice(1)
  }
}

async function handleResult(ctx: Context, result: any) {
  if (result === undefined || result === null) {
    ctx.reply("no results");
  } else {
    // maximum size of message is 4k
    // how to enable users to copy uuid?
    const msg = JSON.stringify(result);
    const html = marked.parseInline(msg);

    try {
      await ctx.reply(html, { parse_mode: "HTML" });
    } catch (e) {
      ctx.reply((<Error>e).message);
    }
  }
}

function runHandlerGenerator() {
  return {
    type: RUN_COMMAND,
    description: "Customized js/ts script",
    handler: async (ctx: Context) => {
      const h = handleArgs(RUN_COMMAND, ctx.message!.text);
      if (!h) {
        ctx.reply("not a valid command");
        return;
      }

      const { command, argv } = h;
      if (!command.script) {
        ctx.reply("not a valid command");
        return;
      }

      const result = await runFunction(command.script, argv.slice(1), command.params);

      handleResult(ctx, result);
    }
  }
}

function queryHandlerGenerator() {
  return {
    type: QUERY_COMMAND,
    description: "Customized datascript query",
    handler: async (ctx: Context) => {
      const h = handleArgs(QUERY_COMMAND, ctx.message!.text);
      if (!h) {
        ctx.reply("not a valid command");
        return;
      }

      const { command, argv } = h;
      const result = await logseq.DB.datascriptQuery(command.script, ...argv.slice(1));
      handleResult(ctx, result);
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
            msg += `/${type} ${subType} ${cmd.params.join(" ")}: ${cmd.description}\n`
          }
        });
      }

      ctx.reply(msg);
    }
  }
}

function slashTemplate(name: string, language: string) {
  let template = `[[${COMMAND_PAGE_NAME}/${name}]] name param0 param1\n`;
  template += `\`\`\`${language}\n\`\`\`\n`;
  template += "description";
  return template;
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

  // FIXME: unable to un-register?
  logseq.Editor.registerSlashCommand("Local Telegram Bot: Define Customized Query", async (e) => {
    logseq.Editor.updateBlock(e.uuid, slashTemplate(QUERY_COMMAND, "clojure"));
  });

  logseq.Editor.registerSlashCommand("Local Telegram Bot: Define Customized Run", async (e) => {
    logseq.Editor.updateBlock(e.uuid, slashTemplate(RUN_COMMAND, "ts"));
  });
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