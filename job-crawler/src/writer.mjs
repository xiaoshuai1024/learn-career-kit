/**
 * writer.mjs — 写回 docs/岗位列表.md 的指定平台分区(支持跨平台去重)
 *
 * 关键:只改目标平台段(adapter.sectionTitle)内对应 ### 子分区,其他分区字节级不动。
 * 去重两层:
 *   1. 段内去重:同公司同岗在当前段已有 → 合并链接(merged)
 *   2. 跨平台去重:同公司同岗在任意平台段已入库 → 跳过(crossDeduped,最先入库为准)
 * 机制:按 `---` 切段 → 定位平台段 → 定位子分区 → 解析已有行去重 → 追加。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAdapter } from './platforms/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url)); // src/
const ROOT = join(__dirname, '..'); // job-crawler/

function resolveTarget() {
  const t = process.env.TARGET_MD;
  if (!t) return join(ROOT, '..', 'docs', '岗位列表.md');
  return t.startsWith('.') ? join(ROOT, t) : t;
}

function normalize(s) {
  return (s || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}

function dedupKey(job) {
  return `${normalize(job.company)}|${normalize(job.title)}`;
}

function parseRow(line) {
  const cells = line.split('|').map((s) => s.trim());
  if (cells.length < 9) return null; // '' + 7列 + ''(日志/分隔行 cells<9 自动过滤)
  cells.shift();
  cells.pop();
  const [company, title, salary, area, linkCell, skills, tag] = cells;
  const m = (linkCell || '').match(/\(([^)]+)\)/);
  return { company, title, salary, area, url: m ? m[1] : '', skills, tag };
}

function replaceLinkCell(rowLine, newCell) {
  const cells = rowLine.split('|');
  if (cells[5] !== undefined) cells[5] = ` ${newCell} `;
  return cells.join('|');
}

/** 判断是否为有效岗位数据行(排除分隔/表头/日志) */
function isJobRow(l) {
  return l.startsWith('|') && !/^\|\s*[-:|]+\s*\|/.test(l) && !/^\|\s*公司/.test(l);
}

/**
 * 主入口:把 jobs 追加到岗位列表.md 的指定平台子分区
 * @returns { ok, written, deduped, merged, crossDeduped, section, platform }
 */
export async function appendJobs({ jobs, direction = '前端', platform = 'boss', markNew = true }) {
  const adapter = getAdapter(platform);
  if (!adapter) throw new Error(`❌ 未知平台 ${platform}`);
  const target = resolveTarget();
  let content;
  try {
    content = await readFile(target, 'utf8');
  } catch {
    // 目标文件不存在 → 用仓库自带示例模板初始化（首次使用开箱即用）
    const template = join(ROOT, '..', 'docs', 'templates', '岗位列表.example.md');
    content = await readFile(template, 'utf8');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  const lines = content.split(/\r?\n/);
  const sepRe = /^---\s*$/;

  // 定位平台段
  let segStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(adapter.sectionTitle)) {
      segStart = i;
      break;
    }
  }
  if (segStart < 0) throw new Error(`❌ 未找到"${adapter.sectionTitle}"分区`);
  let segEnd = lines.length;
  for (let i = segStart + 1; i < lines.length; i++) {
    if (sepRe.test(lines[i])) {
      segEnd = i;
      break;
    }
  }

  // 定位子分区
  const sectionHeader = adapter.directionSection[direction] || adapter.directionSection['前端'];
  let secStart = -1;
  for (let i = segStart; i < segEnd; i++) {
    if (lines[i].trim() === sectionHeader) {
      secStart = i;
      break;
    }
  }
  if (secStart < 0) throw new Error(`❌ ${adapter.label}段内未找到子分区 ${sectionHeader}`);

  let tableEnd = segEnd;
  for (let i = secStart + 1; i < segEnd; i++) {
    const l = lines[i].trim();
    if (l.startsWith('### ') || l.startsWith('**搜索入口链接')) {
      tableEnd = i;
      break;
    }
  }

  // 段内已有行(用于合并链接)
  const existing = new Map();
  let lastTableRowIdx = -1;
  for (let i = secStart; i < tableEnd; i++) {
    const l = lines[i];
    if (isJobRow(l)) {
      const parsed = parseRow(l);
      if (parsed) {
        const k = `${normalize(parsed.company)}|${normalize(parsed.title)}`;
        existing.set(k, { idx: i, url: parsed.url });
        lastTableRowIdx = i;
      }
    }
  }

  // 跨平台去重:扫描整个 md,任何平台段已有同岗位(最先入库为准)
  const globalExisting = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (isJobRow(lines[i])) {
      const parsed = parseRow(lines[i]);
      if (parsed && parsed.company && parsed.title) {
        globalExisting.add(`${normalize(parsed.company)}|${normalize(parsed.title)}`);
      }
    }
  }

  // 构造新行 + 去重
  let written = 0,
    deduped = 0,
    merged = 0,
    crossDeduped = 0;
  const newRows = [];
  const jobDedup = new Set();
  for (const job of jobs) {
    if (!job.title && !job.company) continue;
    const k = dedupKey(job);
    if (jobDedup.has(k)) {
      deduped++;
      continue;
    }
    jobDedup.add(k);
    if (existing.has(k)) {
      // 段内已有 → 合并链接
      const ex = existing.get(k);
      if (job.jobUrl && ex.url && !ex.url.includes(job.jobUrl)) {
        lines[ex.idx] = replaceLinkCell(lines[ex.idx], `[${adapter.label}](${ex.url} · ${job.jobUrl})`);
        merged++;
      } else {
        deduped++;
      }
      continue;
    }
    if (globalExisting.has(k)) {
      // 跨平台已有(最先入库为准) → 跳过不建行
      crossDeduped++;
      continue;
    }
    const skills = (job.skills || []).slice(0, 5).join('、') || '待补充';
    const company = job.company || '待补充';
    const title = job.title || '待补充';
    const salary = job.salary || '待定';
    const area = (job.area || '青岛').split('·')[0].trim() || '青岛';
    const link = job.jobUrl ? `[${adapter.label}](${job.jobUrl})` : '待补充链接';
    const tag = job.companyTag || '待背调';
    const prefix = markNew ? '🆕 ' : '';
    newRows.push(`| ${prefix}${company} | ${title} | ${salary} | ${area} | ${link} | ${skills} | ${tag} |`);
    written++;
  }

  const insertAt = lastTableRowIdx >= 0 ? lastTableRowIdx + 1 : tableEnd;
  if (newRows.length) lines.splice(insertAt, 0, ...newRows);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('> 更新时间：')) {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      lines[i] = `> 更新时间：${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      break;
    }
  }

  appendUpdateLog(lines, adapter, direction, written, deduped, merged, crossDeduped);

  await writeFile(target, lines.join('\n'), 'utf8');
  return { ok: true, written, deduped, merged, crossDeduped, section: sectionHeader, platform: adapter.id };
}

function appendUpdateLog(lines, adapter, direction, written, deduped, merged, crossDeduped) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const row = `| ${date} | 🕷️ job-crawler 抓取 ${adapter.label} ${direction} 方向:新增 ${written}、去重 ${deduped}、合并 ${merged}、跨平台去重 ${crossDeduped} 条 |`;
  let logStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('## 更新日志')) {
      logStart = i;
      break;
    }
  }
  if (logStart < 0) return;
  let lastTableRow = logStart;
  for (let i = logStart + 1; i < lines.length; i++) {
    if (lines[i].startsWith('|')) lastTableRow = i;
  }
  lines.splice(lastTableRow + 1, 0, row);
}

/** 存原始快照到 data/raw-<ts>.json,供回放/调试 */
export async function snapshotJobs(jobs) {
  const dir = join(ROOT, 'data');
  await mkdir(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(dir, `raw-${ts}.json`);
  await writeFile(path, JSON.stringify(jobs, null, 2), 'utf8');
  return path;
}
