import "@logseq/libs";

import stringArgv from "string-argv";
import minimist from "minimist";

// json-view doesn't have types
// @ts-ignore
import jsonview from '@pgrabovets/json-view';
import "@pgrabovets/json-view/src/jsonview.scss"

import { parseCommand, runCommand, COMMAND_PAGE_NAME, QUERY_COMMAND, RUN_COMMAND, DEBUG_CMD_RENDERER } from "./command-utils";
import { log } from "./utils";

export { setupCommandPlayground };

function createDebugResultView(result: any, logs: any[]) {
  const logsDiv = document.createElement("div") as HTMLDivElement;
  logsDiv.className = "debugCmd-logs";
  const logsView = jsonview.create(logs);
  jsonview.render(logsView, logsDiv);

  // json-view assume string as json in string, instead of simple string
  // https://github.com/pgrabovets/json-view/blob/f37382acb982ffd5e43c4df335b3eaa45f8f2c48/src/json-view.js#L187
  if (typeof result === "string" && !result.startsWith("\"") && !result.endsWith("\"")) {
    result = `"${result}"`;
  }
  const resultView = jsonview.create(result);
  const resultDiv = document.createElement("div") as HTMLDivElement;
  resultDiv.className = "debugCmd-result";

  const closeDebug = (e: Event) => {
    const target = e.target as HTMLElement;

    // close resultDiv when outside is clicked
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

function setupCommandPlayground() {
  logseq.provideStyle(`
    .command-playground-open {
      color: green;
      margin: 0 5px 0;
      cursor: pointer;
    }
    `);
  
  const closeButton = document.querySelector("#playground .close") as HTMLElement;
  const blockSpan = document.querySelector("#playground .block") as HTMLSpanElement;
  const signatureInput = document.querySelector("#playground .signature") as HTMLInputElement;
  const argsInput = document.querySelector("#playground .args") as HTMLInputElement;
  const codeContent = document.querySelector("#playground .code .content pre code") as HTMLElement;
  const resultContent = document.querySelector("#playground .result .content") as HTMLDivElement;
  const logsContent = document.querySelector("#playground .logs .content") as HTMLDivElement;

  closeButton.addEventListener("click", () => {
    logseq.hideMainUI();
  });

  logseq.provideModel({
    async cmdpg_open(e: any) {
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

      logseq.showMainUI();
    }
  });

  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    let [type] = payload.arguments;
    if (type !== ':local_telegram_bot-debugCmd') {
      return;
    }

    logseq.provideUI({
      key: payload.uuid,
      slot,
      template: `
        <span class="command-playground-open"
              data-blockid="${payload.uuid}"
              data-on-click="cmdpg_open">▶</span>
        `,
    });
  });
}