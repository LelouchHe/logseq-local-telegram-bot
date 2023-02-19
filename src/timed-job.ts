import { log } from "./utils";

export { runAtInterval, runAt, cancelJob };

const MINIMUM_GAP_IN_SECONDS = 10;
const jobIds: { [key: string]: number } = {};

function getNextTargetTime(time: Date, seconds: number) {
  let target = time.getTime();
  const now = Date.now();
  if (target < now) {
    target += (1 + Math.floor((now - target) / seconds / 1000)) * seconds * 1000;
  }

  return target;
}

function runAtInterval(name: string, time: Date, seconds: number, cb: () => void) {
  let target = getNextTargetTime(time, seconds);
  let delay = target - Date.now();
  if (delay < MINIMUM_GAP_IN_SECONDS * 1000) {
    log(`delay gap is too small(${delay} ms), go to next interval`)
    delay += seconds * 1000;
    target += seconds * 1000;
  }

  jobIds[name] = setTimeout(() => {
    log(`job(${name}: ${jobIds[name]}) is running at ${new Date().toLocaleString()}`);
    cb();
    runAtInterval(name, time, seconds, cb);
  }, delay);

  const next = new Date(target);

  log(`job(${name}: ${jobIds[name]}) will run at ${next.toLocaleString()}`);
}

function runAt(name: string, time: Date, cb: () => void) {
  const delay = time.getTime() - Date.now();
  if (delay < 0) {
    log(`can't run at past time: ${time.toLocaleString()}`);
    return;
  }

  jobIds[name] = setTimeout(() => {
    log(`job(${name}: ${jobIds[name]}) is running at ${new Date().toLocaleString()}`);
    cb();
  }, delay);

  log(`job(${name}: ${jobIds[name]}) will run at ${time.toLocaleString()}`);
}

function cancelJob(name: string) {
  log(`job(${name}: ${jobIds[name]}) is cancelled`);
  clearTimeout(jobIds[name]);
  delete jobIds[name];
}