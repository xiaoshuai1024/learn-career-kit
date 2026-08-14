#!/usr/bin/env node
/**
 * md2pdf-batch.mjs — 批量导出一个目录下全部 Markdown 为 PDF
 *
 * 单浏览器实例多 page（比逐文件起进程快），输出到 <目录>/pdf/<同名>.pdf。
 *
 * 用法：
 *   node scripts/md2pdf-batch.mjs --dir docs            # docs/*.md → docs/pdf/*.pdf
 *   node scripts/md2pdf-batch.mjs --dir docs --watch    # 监听变更自动重导
 *   node scripts/md2pdf-batch.mjs --dir docs --no-header
 *   node scripts/md2pdf-batch.mjs --dir docs --style my.css
 */

import { readdirSync, watch, mkdirSync } from 'fs';
import { resolve, basename, extname } from 'path';
import { spawn } from 'child_process';

// ─── 参数解析 ──────────────────────────────
const args = process.argv.slice(2);
const getOpt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const hasFlag = (name) => args.includes(`--${name}`);

const dir = getOpt('dir');
const watchMode = hasFlag('watch');

if (!dir) {
  console.error('❌ 请指定目录：node scripts/md2pdf-batch.mjs --dir docs');
  process.exit(1);
}

const targetDir = resolve(process.cwd(), dir);
const files = readdirSync(targetDir)
  .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
  .sort();
const passThrough = args.filter((a) => !a.startsWith('--dir') || a !== dir);

if (files.length === 0) {
  console.error(`❌ ${dir} 下没有 .md 文件`);
  process.exit(1);
}

console.log(`📄 待导出 ${files.length} 个文件：`);
files.forEach((f) => console.log(`   - ${f}`));

// ─── 逐文件调用 md2pdf.mjs（串行，避免并发起多个 Chromium）───
const md2pdf = resolve(process.cwd(), 'scripts', 'md2pdf.mjs');
mkdirSync(resolve(targetDir, 'pdf'), { recursive: true });

let failed = 0;
const convert = async (file) => {
  const input = resolve(targetDir, file);
  const out = resolve(targetDir, 'pdf', `${basename(file, '.md')}.pdf`);
  const extra = passThrough.filter((a) => a !== '--watch' && a !== '--dir' && a !== dir);
  const nodeArgs = [md2pdf, input, '-o', out, ...extra];
  console.log(`\n→ ${file}`);
  await new Promise((done) => {
    const child = spawn(process.execPath, nodeArgs, { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code !== 0) failed += 1;
      done();
    });
  });
};

const runAll = async (only) => {
  failed = 0;
  for (const f of only ? [only] : files) {
    await convert(f);
  }
  console.log(failed === 0 ? '\n✅ 全部导出完成' : `\n⚠️ ${failed} 个文件导出失败`);
};

await runAll();

// ─── watch 模式：变更哪个就重导哪个 ──────────
if (watchMode) {
  console.log('\n👀 watch 模式已开启（Ctrl+C 退出）...');
  let timer = null;
  watch(targetDir, (_evt, filename) => {
    if (!filename?.endsWith('.md')) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      console.log(`\n🔁 检测到变更：${filename}`);
      await runAll(filename);
    }, 300);
  });
}
