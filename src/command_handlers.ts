import { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";

import { Telegraf, Context } from "telegraf";
import { Message } from "typegram";
import stringArgv from "string-argv";
import minimist from "minimist";
import { marked } from "marked";

import { createFunction, isMessageAuthorized, log } from "./utils";

export { setupCommandHandlers };

type CommandHandler = (ctx: Context) => Promise<void>;

class Command {
  public type: string = "";
  public name: string = "";
  public params: string[] = [];
  public script: string = "";
  public description: string = "";
  public func: Function | null = null;
}

const COMMAND_PAGE_NAME = "local-telegram-bot";

const prefixTypes: { [ key: string ]: string } = {
  [`[[${COMMAND_PAGE_NAME}/query]]`] : "query",
  [`[[${COMMAND_PAGE_NAME}/run]]`]: "run",
};

const commandHandlers: { type: string, handler: CommandHandler }[] = [
  runHandlerGenerator(),
  queryHandlerGenerator(),
  helpHandlerGenerator()
];

const commands = new Map<string, { [key: string]: Command }>;

function parseCommand(content: string): Command | null {
  let prefix = "";
  for (let key in prefixTypes) {
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
  command.type = prefixTypes[prefix];

  const names = parts[0].trim().split(" ");
  command.name = names[0];
  command.params = names.slice(1);

  command.script = parts[1].substring(parts[1].indexOf("\n"));
  command.description = parts.length == 3 ? parts[2].trim() : "";
  if (command.type == "run") {
    command.func = createFunction(command.script, command.params);
  }

  return command;
}

async function setupCommands() {
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

function runHandlerGenerator() {
  const key = "run";
  return {
    type: key,
    handler: async (ctx: Context) => {
      const h = handleArgs(key, ctx.message!.text);
      if (!h) {
        ctx.reply("not a valid command");
        return;
      }

      const { command, argv } = h;
      if (!command.func) {
        ctx.reply("not a valid command");
        return;
      }

      const result = await command.func.apply(null, argv.slice(1));
      if (result === undefined) {
        ctx.reply("command has finished");
      } else {
        const msg = JSON.stringify(result);
        const html = marked.parseInline(msg);
        ctx.reply(html, { parse_mode: "HTML" });
      }
    }
  }
}

function queryHandlerGenerator() {
  const key = "query";
  return {
    type: key,
    handler: async (ctx: Context) => {
      const h = handleArgs(key, ctx.message!.text);
      if (!h) {
        ctx.reply("not a valid command");
        return;
      }

      const { command, argv } = h;
      const result = await logseq.DB.datascriptQuery(command.script, ...argv.slice(1));
      if (!result) {
        ctx.reply("no results");
        return;
      }

      // FIXME: how about other results?
      // better to return json? with uuid in code?
      const rs: BlockEntity[] = result.flat();
      const msg = rs.map(r => `(\`${r.uuid}\`): ${r.content}`).join("\n\n");
      const html = marked.parseInline(msg);
      ctx.reply(html, { parse_mode: "HTML" });
    }
  }
}

function helpHandlerGenerator() {
  return {
    type: "help",
    handler: async (ctx: Context) => {
      ctx.reply(`this is help: ${ctx.message?.text}`);
    }
  }
}

function setupCommandHandlers(bot: Telegraf<Context>) {
  for (let handler of commandHandlers) {
    bot.command(handler.type, (ctx) => {
      if (ctx.message
        && isMessageAuthorized(ctx.message as Message.ServiceMessage)) {
        handler.handler(ctx);
      }
    });
  }

  setupCommands();

  const unsub = logseq.DB.onChanged((e) => {
    setupCommands();
  });
}