import "@logseq/libs";

export { log, error, showMsg };

function log(message: string) {
    console.log("[Local Telegram Bot] " + message);
}

function error(message: string) {
    console.error("[Local Telegram Bot] " + message);
}

function showMsg(message: string) {
    logseq.UI.showMsg("[Local Telegram Bot] " + message);
}