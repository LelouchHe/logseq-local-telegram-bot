import { Telegraf, Context } from "telegraf";
import { Message } from "typegram";
import stringArgv from "string-argv";
import minimist from "minimist";

import { isMessageAuthorized } from "./utils";

export { setupCommandHandlers };

type CommandHandler = (ctx: Context) => Promise<void>;

const commandHandlers: { type: string, handler: CommandHandler }[] = [
  runHandlerGenerator(),
  helpHandlerGenerator()
];

function runHandlerGenerator() {
  return {
    type: "run",
    handler: async (ctx: Context) => {
      console.log(minimist(stringArgv(ctx.message!.text)));
      eval(`logseq.UI.showMsg("test");`);
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
}