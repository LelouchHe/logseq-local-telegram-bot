import "@logseq/libs";

import stringArgv from "string-argv";
import minimist from "minimist";
import { basicSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view"
import { indentWithTab } from "@codemirror/commands"
import { javascript } from "@codemirror/lang-javascript";
import { clojure } from "@nextjournal/lang-clojure";
import { oneDark, color } from "@codemirror/theme-one-dark";

// json-view doesn't have types
// @ts-ignore
import jsonview from '@pgrabovets/json-view';
import "@pgrabovets/json-view/src/jsonview.scss"

import { Command, parseCommand, runCommand, stringifyCommand } from "./command-utils";
import { log } from "./utils";

export { setupCommandPlayground };

function showResult(result: any, logs: any[]) {
  const resultContent = document.querySelector("#playground .result .content") as HTMLDivElement;
  const logsContent = document.querySelector("#playground .logs .content") as HTMLDivElement;

  // json-view assume string as json in string, instead of simple string
  // https://github.com/pgrabovets/json-view/blob/f37382acb982ffd5e43c4df335b3eaa45f8f2c48/src/json-view.js#L187
  if (typeof result === "string" && !result.startsWith("\"") && !result.endsWith("\"")) {
    result = `"${result}"`;
  }
  const resultView = jsonview.create(result);
  jsonview.render(resultView, resultContent);

  const logsView = jsonview.create(logs);
  jsonview.render(logsView, logsContent);
}

function showPlayground(blockId: string, command: Command) {
  const blockSpan = document.querySelector("#playground .block") as HTMLSpanElement;
  const closeButton = document.querySelector("#playground .close") as HTMLElement;
  const signatureInput = document.querySelector("#playground .signature") as HTMLInputElement;
  const argsInput = document.querySelector("#playground .args") as HTMLInputElement;
  const debugButton = document.querySelector("#playground .debug") as HTMLSpanElement;
  const codeContent = document.querySelector("#playground .code .content") as HTMLDivElement;
  const resultContent = document.querySelector("#playground .result .content") as HTMLDivElement;
  const logsContent = document.querySelector("#playground .logs .content") as HTMLDivElement;

  blockSpan.innerText = blockId;
  signatureInput.value = [command.name, ...command.params].join(" ");
  argsInput.value = "";
  argsInput.placeholder = command.params.join(" ");
  codeContent.innerHTML = "";
  codeContent.style.backgroundColor = color.background;
  resultContent.innerHTML = "";
  logsContent.innerHTML = "";

  const languageSupport = command.type == "run" ? javascript() : clojure();

  const codeView = new EditorView({
    doc: command.script,
    extensions: [basicSetup, oneDark, keymap.of([indentWithTab]), languageSupport],
    parent: codeContent
  });

  async function startDebug() {
    resultContent.innerHTML = "";
    logsContent.innerHTML = "";

    const args = argsInput.value;
    const argv = minimist(stringArgv(args))._;
    command.script = codeView.state.doc.toJSON().join("\n");

    let result: any = null;
    let logs: any[] = [];

    try {
      const commandResult = await runCommand(command, argv);
      if (commandResult == null) {
        logs.push("unknow error");
      } else {
        result = commandResult.result;
        logs = commandResult.logs;
      }
    } catch (e) {
      logs.push(e);
    }

    showResult(result, logs);
  }

  function endDebug() {
    command.script = codeView.state.doc.toJSON().join("\n");
    logseq.Editor.updateBlock(blockId, stringifyCommand(command));

    logseq.hideMainUI();
    debugButton.removeEventListener("click", startDebug);
    closeButton.removeEventListener("click", endDebug);
  }

  debugButton.addEventListener("click", startDebug);
  closeButton.addEventListener("click", endDebug);
  logseq.showMainUI();
}

function setupCommandPlayground() {
  logseq.provideStyle(`
    .command-playground-open {
      color: green;
      margin: 0 5px 0;
      cursor: pointer;
    }
    `);

  logseq.provideModel({
    async command_playground_open(e: any) {
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

      showPlayground(blockid, cmd);
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
              data-on-click="command_playground_open">▶</span>
        `,
    });
  });
}