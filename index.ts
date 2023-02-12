import "@logseq/libs";
import { BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
import axios from "axios";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";

/**
 * main entry
 */
async function main() {
  console.log("[Local Telegram Bot] Start")
}

// bootstrap
logseq.ready(main).catch(console.error);
