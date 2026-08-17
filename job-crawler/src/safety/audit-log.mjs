/**
 * audit-log.mjs — 审计日志(防风控可观测层)
 *
 * 每次操作写一行 jsonl 到 LOG_DIR/audit-YYYY-MM-DD.jsonl:
 *   { ts, tool, url, gapMs, result, detail... }
 * 用途:事后核查行为是否像人、排查熔断、统计间隔分布。本地,gitignore,不外传。
 */
import { mkdir, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

function resolveDir(envVal, def) {
  if (!envVal) return join(ROOT, def);
  return envVal.startsWith('.') ? join(ROOT, envVal) : envVal;
}

const LOG_DIR = resolveDir(process.env.LOG_DIR, 'logs');

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function audit(event) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    await appendFile(join(LOG_DIR, `audit-${todayStr()}.jsonl`), line, 'utf8');
  } catch (e) {
    // 审计失败不阻断主流程
    console.error('[audit] 写日志失败:', e.message);
  }
}

export function getLogDir() {
  return LOG_DIR;
}
