/**
 * state-io.mjs — state 目录 json 读写(运行时状态,gitignore)
 *
 * 存:daily-counter.json(日计数)、seen-jobs.json(去重)、cooldown.json(熔断)
 * STATE_DIR 可由环境变量覆盖(默认 job-crawler/state)。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url)); // src/safety/
const ROOT = join(__dirname, '..', '..'); // job-crawler/

function resolveDir(envVal, def) {
  if (!envVal) return join(ROOT, def);
  return envVal.startsWith('.') ? join(ROOT, envVal) : envVal;
}

export const STATE_DIR = resolveDir(process.env.STATE_DIR, 'state');

export async function readJson(name, fallback) {
  try {
    const raw = await readFile(join(STATE_DIR, name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return typeof fallback === 'function' ? await fallback() : fallback;
  }
}

export async function writeJson(name, data) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(join(STATE_DIR, name), JSON.stringify(data, null, 2), 'utf8');
}
