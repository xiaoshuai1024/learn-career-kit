#!/usr/bin/env node
/**
 * md2pdf — Markdown → PDF 转换（精美样式）
 *
 * 用法：
 *   node scripts/md2pdf.mjs cv/简历.md                  # 输出同目录同名 .pdf
 *   node scripts/md2pdf.mjs cv/简历.md -o cv/简历.pdf    # 指定输出路径
 *   node scripts/md2pdf.mjs cv/简历.md --style cv/custom.css  # 自定义样式
 *   node scripts/md2pdf.mjs cv/简历.md --no-header      # 不显示页眉
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, basename, extname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { marked } from './marked-wrapper.mjs';

// 解析参数
const args = process.argv.slice(2);
const helpFlags = ['-h', '--help'];
const styleFlag = '--style';
const noHeaderFlag = '--no-header';
const outputFlag = '-o';

let inputFile = null;
let outputFile = null;
let styleFile = null;
let noHeader = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (helpFlags.includes(a)) {
    printHelp();
    process.exit(0);
  } else if (a === styleFlag) {
    styleFile = args[++i];
  } else if (a === noHeaderFlag) {
    noHeader = true;
  } else if (a === outputFlag) {
    outputFile = args[++i];
  } else if (!inputFile) {
    inputFile = a;
  }
}

if (!inputFile) {
  console.error('❌ 用法：node scripts/md2pdf.mjs <输入.md> [-o 输出.pdf] [--style css] [--no-header]');
  process.exit(1);
}

if (!existsSync(inputFile)) {
  console.error(`❌ 文件不存在：${inputFile}`);
  process.exit(1);
}

// 确定输出路径
if (!outputFile) {
  const dir = dirname(inputFile);
  const base = basename(inputFile, extname(inputFile));
  outputFile = resolve(dir, `${base}.pdf`);
}

// 读取样式
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const defaultStyle = readFileSync(resolve(projectRoot, 'assets', 'style.css'), 'utf-8');
const customStyle = styleFile
  ? readFileSync(resolve(process.cwd(), styleFile), 'utf-8')
  : '';

// 读取 Markdown 内容
let mdContent = readFileSync(inputFile, 'utf-8');

// 解析 Markdown frontmatter 获取姓名/联系方式
let name = basename(inputFile, extname(inputFile));
let contactHtml = '';
const fmMatch = mdContent.match(/^---\n([\s\S]*?)\n---\n/);
if (fmMatch) {
  const fm = fmMatch[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const phoneMatch = fm.match(/^phone:\s*(.+)$/m);
  const emailMatch = fm.match(/^email:\s*(.+)$/m);
  if (nameMatch) name = nameMatch[1];
  const parts = [];
  if (phoneMatch) parts.push(`<span>${phoneMatch[1]}</span>`);
  if (emailMatch) parts.push(`<span>${emailMatch[1]}</span>`);
  if (parts.length) contactHtml = parts.join('<span class="sep"> | </span>');
  // 移除 frontmatter
  mdContent = mdContent.replace(fmMatch[0], '');
}

// 解析 Markdown → HTML
const bodyHtml = marked.parse(mdContent);

// 构建完整 HTML
const headerBlock = noHeader ? '' : `
<div class="resume-header">
  <h1>${name}</h1>
  ${contactHtml ? `<div class="contact-info">${contactHtml}</div>` : ''}
</div>`;

// 注入阿里巴巴普惠体（base64 内联，不依赖 file:// 或系统字体）
// 字体为可选依赖：assets/fonts/ 缺失时回退系统字体（PingFang SC / 微软雅黑等）
const fontDir = resolve(projectRoot, 'assets', 'fonts');
const fontRegularPath = resolve(fontDir, 'AlibabaPuHuiTi-3-55-Regular.ttf');
const fontBoldPath = resolve(fontDir, 'AlibabaPuHuiTi-Bold.ttf');
const fontFaceCss = (existsSync(fontRegularPath) && existsSync(fontBoldPath))
  ? `@font-face{font-family:'Alibaba PuHuiTi 3.0';src:url(data:font/truetype;charset=utf-8;base64,${readFileSync(fontRegularPath).toString('base64')}) format('truetype');font-weight:400;font-style:normal;}
@font-face{font-family:'Alibaba PuHuiTi 3.0';src:url(data:font/truetype;charset=utf-8;base64,${readFileSync(fontBoldPath).toString('base64')}) format('truetype');font-weight:700;font-style:normal;}`
  : '';

const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
${fontFaceCss}
${defaultStyle}
${customStyle}
</style>
</head>
<body>
${headerBlock}
<div class="resume-body">
${bodyHtml}
</div>
</body>
</html>`;

console.log(`📄 正在转换为 PDF：${inputFile}`);
console.log(fontFaceCss ? '   (字体 base64 内联: Alibaba PuHuiTi)' : '   (未找到 assets/fonts/*.ttf，回退系统字体)');

// 动态导入 puppeteer 并生成 PDF
import('puppeteer').then(async (puppeteerModule) => {
  const puppeteer = puppeteerModule.default;
  let browser;
  try {
    // 优先使用本地已安装的 Chrome，避免下载 Chromium
    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      process.env.CHROME_PATH,
    ].filter(Boolean);
    const executablePath = chromePaths.find(p => existsSync(p));

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
      ...(executablePath ? { executablePath } : {}),
    });
    const page = await browser.newPage();

    // 监听控制台错误
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`  🔍 Chrome ${msg.type()}: ${msg.text()}`);
      }
    });

    // setContent: HTML 自包含（字体 base64 内联），无需外部文件
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 180000 });

    // 等 @font-face 字体加载完成
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    // 诊断字体加载状态
    const fontStatus = await page.evaluate(() => {
      const fonts = [];
      document.fonts.forEach(f => fonts.push(`${f.family} / ${f.weight} / ${f.style} / status:${f.status}`));
      return {
        size: document.fonts.size,
        ready: document.fonts.status,
        checkRegular: document.fonts.check('12px "Alibaba PuHuiTi 3.0"'),
        checkBold: document.fonts.check('bold 12px "Alibaba PuHuiTi 3.0"'),
        samples: fonts.slice(0, 10),
      };
    });
    console.log(`  🔤 字体诊断: size=${fontStatus.size} ready=${fontStatus.ready} checkRegular=${fontStatus.checkRegular} checkBold=${fontStatus.checkBold}`);
    if (fontStatus.samples.length) fontStatus.samples.forEach(s => console.log(`     ${s}`));

    await page.pdf({
      path: outputFile,
      format: 'A4',
      margin: { top: '20mm', bottom: '25mm', left: '18mm', right: '18mm' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%;text-align:center;font-size:8pt;color:#999;padding:4px 18mm;">
          — 第 <span class="pageNumber"></span> 页，共 <span class="totalPages"></span> 页 —
        </div>
      `,
    });

    console.log(`✅ 已导出：${outputFile}`);
  } catch (err) {
    console.error('❌ 生成 PDF 失败：', err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
});

function printHelp() {
  console.log(`
md2pdf — Markdown → PDF 转换（精美样式）

用法：
  node scripts/md2pdf.mjs <输入.md>                    输出同目录同名 .pdf
  node scripts/md2pdf.mjs <输入.md> -o <输出.pdf>       指定输出路径
  node scripts/md2pdf.mjs <输入.md> --style cv/custom.css  自定义样式
  node scripts/md2pdf.mjs <输入.md> --no-header         不显示页眉头部

示例：
  node scripts/md2pdf.mjs cv/我的简历.md
  node scripts/md2pdf.mjs cv/我的简历.md -o cv/优化版简历.pdf
`);
}
