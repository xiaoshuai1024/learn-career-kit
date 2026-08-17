/**
 * browser.mjs — puppeteer.connect 接管已启动的 Chrome/Edge(调试端口 9222)
 *
 * 设计要点(安全优先):
 * - 只 connect 不 launch:用户手动启动浏览器并登录,爬虫只读接管
 * - browser.disconnect() 只断开连接,不杀进程(区别于 close)
 * - ensureBrowser 每次探活,失败重连 3 次
 * - 单 page 串行(并发是 BOSS 风控强触发)
 * - 锁 127.0.0.1:避免 Windows 下 localhost→::1 导致 ws 握手失败
 *
 * 复用根目录 puppeteer(^24),workspace hoist,本子包不重复声明。
 */
import puppeteer from 'puppeteer';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9222';

let browser = null;
let page = null;

/** 探测 CDP 端点是否存活(/json/version) */
export async function isBrowserAlive() {
  try {
    const res = await fetch(`${BROWSER_URL}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 连接浏览器(不启动新进程);已连且存活则复用 */
export async function connectBrowser() {
  if (browser && (await isBrowserAlive())) return browser;
  // 旧引用已失效,清理
  if (browser) {
    try { await browser.disconnect(); } catch {}
    browser = null;
    page = null;
  }

  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      browser = await puppeteer.connect({
        browserURL: BROWSER_URL,
        defaultViewport: null, // 用浏览器实际窗口尺寸
      });
      return browser;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`❌ 无法连接浏览器 ${BROWSER_URL}(重试3次): ${lastErr?.message || lastErr}`);
}

/** 确保拿到一个可用 page(复用首个标签或新建),探活失败则重建 */
export async function ensurePage() {
  await connectBrowser();
  if (page && !page.isClosed?.()) {
    try {
      await page.evaluate(() => true);
      return page;
    } catch {
      page = null;
    }
  }
  const pages = await browser.pages();
  page = pages[0] || (await browser.newPage());
  return page;
}

/** 断开连接(不杀浏览器进程,用户可继续使用) */
export async function disconnect() {
  if (browser) {
    try { await browser.disconnect(); } catch {}
  }
  browser = null;
  page = null;
}

export function getBrowserUrl() {
  return BROWSER_URL;
}

export function getBrowser() {
  return browser;
}
