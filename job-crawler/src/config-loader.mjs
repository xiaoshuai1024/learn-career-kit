/**
 * config-loader.mjs — 加载 config/*.json(带内存缓存)
 *
 * 用 fs.readFile + JSON.parse,避免 import attributes 的任何兼容问题。
 * CONFIG_DIR 可由环境变量覆盖(默认 job-crawler/config)。
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url)); // src/
const ROOT = join(__dirname, '..'); // job-crawler/

function resolveDir(envVal, def) {
  if (!envVal) return join(ROOT, def);
  return envVal.startsWith('.') ? join(ROOT, envVal) : envVal;
}

export const CONFIG_DIR = resolveDir(process.env.CONFIG_DIR, 'config');

const cache = new Map();

export async function loadConfig(name) {
  if (cache.has(name)) return cache.get(name);
  const raw = await readFile(join(CONFIG_DIR, name), 'utf8');
  const data = JSON.parse(raw);
  cache.set(name, data);
  return data;
}

export function clearConfigCache() {
  cache.clear();
}
