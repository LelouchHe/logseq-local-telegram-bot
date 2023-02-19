import { log } from "./utils";

export { runAtInterval, runAt, cancelJob };

const MINIMUM_GAP_IN_SECONDS = 10;
const MS_PER_SECOND = 1000;
const jobIds: { [key: string]: number } = {};

function getNextTargetTime(time: Date, seconds: number) {
  let target = time.getTime();
  const now = Date.now();
  if (target < now) {
    target += (1 + Math.floor((now - target) / seconds / MS_PER_SECOND)) * seconds * MS_PER_SECOND;
  }

  return new Date(target);
}

function runAtInterval(name: string, time: Date, seconds: number, cb: () => void) {
  let target = getNextTargetTime(time, seconds);
  if (target.getTime() - Date.now() < MINIMUM_GAP_IN_SECONDS * MS_PER_SECOND) {
    log(`next running time(${target.toLocaleString()}) is too close, go to next interval`);
    target.setTime(target.getTime() + seconds * MS_PER_SECOND);
  }

  jobIds[name] = setTimeout(() => {
    log(`job(${name}: ${jobIds[name]}) is running at ${new Date().toLocaleString()}`);
    cb();
    runAtInterval(name, time, seconds, cb);
  }, target.getTime() - Date.now());

  log(`job(${name}: ${jobIds[name]}) will run at ${target.toLocaleString()}`);
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