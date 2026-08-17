/**
 * humanize.mjs — 拟人行为(防风控指纹层)
 *
 * 核心:用真实鼠标/键盘事件,不用 JS 直接操控 DOM。
 *   - humanScroll:wheel 随机幅度渐进,等加载稳定(连续2次子节点数不变=到底)
 *   - humanDelay/humanRead:随机停顿 / 按字数估阅读时长
 *   - 偶发"犹豫":模拟人分心多停几秒
 * 禁止:window.scrollTo、evaluate 改 DOM、秒开秒关详情页。
 */
import { loadConfig } from '../config-loader.mjs';

function rand([min, max]) {
  return min + Math.random() * (max - min);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function humanDelay(range) {
  const cfg = await loadConfig('safety.json');
  const r = range || cfg.scrollSettleMs;
  await sleep(rand(r));
}

/** 按文本长度估算阅读时长(防秒开秒关详情页) */
export async function humanRead(text = '') {
  const cfg = await loadConfig('safety.json');
  const cps = cfg.readSpeedCps; // 字/秒
  const len = (text || '').length;
  const baseMs = Math.min(8000, (len / cps) * 1000); // 上限 8s
  await sleep(baseMs + rand(cfg.detailMinStayMs));
  if (Math.random() < cfg.hesitationChance) {
    await sleep(rand(cfg.hesitationMs));
  }
}

/**
 * 拟人滚动:渐进 wheel,直到子节点数连续两次不变(到底)或达到 maxRounds。
 * @returns {number} 滚动轮数
 */
export async function humanScroll(page, childSelector, { maxRounds = 20, onRound } = {}) {
  const cfg = await loadConfig('safety.json');
  let prevCount = -1;
  let stable = 0;
  for (let i = 0; i < maxRounds; i++) {
    await page.mouse.wheel({ deltaY: Math.round(rand(cfg.scrollDeltaY)) });
    await sleep(rand(cfg.scrollSettleMs));
    const count = await page
      .evaluate((sel) => document.querySelectorAll(sel).length, childSelector)
      .catch(() => prevCount);
    if (typeof onRound === 'function') await onRound(i, count);
    if (count === prevCount) {
      stable++;
      if (stable >= 2) return i + 1;
    } else {
      stable = 0;
    }
    prevCount = count;
  }
  return maxRounds;
}

/** 点击前 hover 一会(真实交互) */
export async function humanClick(page, selector) {
  const cfg = await loadConfig('safety.json');
  await page.hover(selector).catch(() => {});
  await sleep(rand(cfg.detailMinStayMs));
  await page.click(selector).catch(() => {});
}
