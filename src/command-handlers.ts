import { IUserOffHook } from "@logseq/libs/dist/LSPlugin.user";

import { Telegraf, Context } from "telegraf";
import { Message } from "typegram";
import stringArgv from "string-argv";
import minimist from "minimist";
import { marked } from "marked";

import { settings } from "./settings";
import { Command, parseCommand, runCommand, setupSlashCommands, commandInfos, COMMAND_PAGE_NAME } from "./command-utils";
import { isMessageAuthorized, log, error, stringifyBlocks } from "./utils";

export { setupCommandHandlers, enableCustomizedCommands, disableCustomizedCommands };

interface CommandHandler {
  type: string;
  description: string;
  handler: (ctx: Context) => Promise<void>;
};

const builtinCommandHandlers: CommandHandler[] = [
  // getHandlerGenerator(),
  // updateTaskHandlerGenerator(),
  helpHandlerGenerator()
];

const customizedCommandHandlers: CommandHandler[] = [];

const commands = new Map<string, { [key: string]: Command }>;

async function updateCustomizedCommands() {
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

function setupCustomizedCommandHandlers() {
  for (let info of commandInfos) {
    customizedCommandHandlers.push({
      type: info.type,
      description: info.description,
      handler: (ctx: Context) => {
        return processCommand(info.type, ctx);
      }
    });
  }
}

function getHandlerGenerator() {
  const type = "get";
  return {
    type: type,
    description: "uuid. Get block content from uuid",
    handler: async (ctx: Context) => {
      const text = ctx.message!.text;
      const parts = text.split(" ");
      if (parts.length < 2) {
        ctx.reply("invalid command");
        return;
      }

      const block = await logseq.Editor.getBlock(parts[1], { includeChildren: true });
      if (!block) {
        ctx.reply("Block is not available");
        return;
      }

      const html = marked.parseInline(stringifyBlocks(block, true));
      await ctx.reply(html, { parse_mode: "HTML" });
    }
  }
}

function updateTaskHandlerGenerator() {
  const type = "updateTask";
  return {
    type: type,
    description: "uuid status. Update task status",
    handler: async (ctx: Context) => {
      const text = ctx.message!.text;
      const parts = text.split(" ");
      if (parts.length < 3) {
        ctx.reply("invalid command");
        return;
      }

      const status = parts[2].toUpperCase();
      if (!["TODO", "DOING", "DONE", "NOW", "LATER", "WAITING"].includes(status)) {
        ctx.reply("invalid status");
        return;
      }

      const block = await logseq.Editor.getBlock(parts[1]);
      if (!block || !block["marker"]) {
        ctx.reply("invalid task");
        return;
      }

      const content = status + block.content.substring(block.content.indexOf(" "));
      await logseq.Editor.updateBlock(block.uuid, content);
      const html = marked.parseInline(content);
      await ctx.reply(html, { parse_mode: "HTML" });
    }
  }
}

function helpHandlerGenerator() {
  return {
    type: "help",
    description: "List all available commands",
    handler: async (ctx: Context) => {
      let msg = "Available commands:\n";
      for (let { type, description, handler } of builtinCommandHandlers) {
        msg += `/${type}: ${description}\n`;
      }

      if (settings.enableCustomizedCommand) {
        for (let { type, description, handler } of customizedCommandHandlers) {
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
      }

      ctx.reply(msg);
    }
  }
}

function setupCommandMiddleware(bot: Telegraf<Context>) {
  bot.use((ctx, next) => {
    if (!ctx.message?.text) {
      next();
      return;
    }

    const text = ctx.message.text;
    if (!settings.enableCustomizedCommandFromMessage) {
      for (let info of commandInfos) {
        if (text.startsWith(info.pageName)) {
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
  setupCustomizedCommandHandlers();

  for (let handler of [...builtinCommandHandlers, ...customizedCommandHandlers]) {
    bot.command(handler.type, (ctx) => {
      if (ctx.message
        && isMessageAuthorized(ctx.message as Message.ServiceMessage)) {
        handler.handler(ctx);
      }
    });
  }

  setupCommandMiddleware(bot);
  setupSlashCommands();
}

function enableCustomizedCommands() {
  unsubscribe();
  unsubscribe = logseq.DB.onChanged((e) => {
    updateCustomizedCommands();
  });
  updateCustomizedCommands();
  log("customized commands are enabled");
}

function disableCustomizedCommands() {
  unsubscribe();
  commands.clear();
  log("customized commands are disabled");
}