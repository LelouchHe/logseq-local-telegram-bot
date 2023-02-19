import { Telegraf, Context } from "telegraf";
import { Message } from "typegram";

import { isMessageAuthorized } from "./utils";

export { setupCommandHandlers };

type CommandHandler = (ctx: Context) => Promise<void>;

const commandHandlers: { type: string, handler: CommandHandler }[] = [
  registerHandlerGenerator(),
  helpHandlerGenerator()
];

function registerHandlerGenerator() {
  return {
    type: "register",
    handler: async (ctx: Context) => {
      ctx.reply(`${ctx.message?.from!.username} has been successfully registered. You are eligible to receive messages from now`);
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