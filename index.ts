import "@logseq/libs";
import { BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
import axios from "axios";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";
import { Telegraf } from "telegraf";

const settings: SettingSchemaDesc[] = [
  {
    key: "botToken",
    description: "Telegram Bot token. In order to start you need to create Telegram bot: https://core.telegram.org/bots#3-how-do-i-create-a-bot. Create a bot with BotFather, which is essentially a bot used to create other bots. The command you need is /newbot. After you choose title, BotFaher give you the token",
    type: "string",
    default: "",
    title: "Bot token",
  }
];
logseq.useSettingsSchema(settings);

/**
 * main entry
 */
async function main() {
  console.log("[Local Telegram Bot] Start")
  const bot = new Telegraf(logseq.settings!.botToken);
  bot.command("echo", async (ctx) => {
    await ctx.reply(ctx.message?.text ?? "");
  });

  bot.launch();
}



// bootstrap
logseq.ready(main).catch(console.error);
