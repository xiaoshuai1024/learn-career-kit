/**
 * check-status.mjs — MCP 工具 check_status(体检,免节流)
 *
 * 报告:浏览器连接、各平台熔断冷却/今日计数、安全参数、可用平台列表。不抓数据,零风险。
 */
import { isBrowserAlive, getBrowserUrl } from '../browser.mjs';
import { getDailyStats } from '../safety/throttle.mjs';
import { checkCooldown } from '../safety/circuit-breaker.mjs';
import { getAllowedDomains } from '../safety/guard.mjs';
import { loadConfig } from '../config-loader.mjs';
import { allAdapters } from '../platforms/index.mjs';

export const definition = {
  name: 'check_status',
  description: '体检:浏览器是否连接、各平台熔断冷却/今日抓取计数、安全参数、可用平台。无副作用,可随时调用。',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function run() {
  const alive = await isBrowserAlive();
  const cfg = await loadConfig('safety.json');
  const defaults = await loadConfig('defaults.json');
  const allowedDomains = await getAllowedDomains();

  // 各平台计数 + 冷却(按平台独立)
  const platforms = [];
  for (const adapter of allAdapters()) {
    const daily = await getDailyStats(adapter.id);
    const cool = await checkCooldown(adapter.id);
    platforms.push({
      id: adapter.id,
      label: adapter.label,
      loginRequired: adapter.loginRequired,
      dailyCount: daily.count,
      dailyCap: daily.cap,
      dailyRemaining: daily.remaining,
      cooldown: cool,
    });
  }

  return {
    ok: true,
    browser: alive ? 'connected' : 'disconnected',
    browserUrl: getBrowserUrl(),
    platforms,
    grayMode: defaults.grayMode,
    firstRunLimit: cfg.firstRunLimit,
    activeHours: cfg.activeHours,
    allowedDomains,
    hint: alive
      ? '可调用 search_jobs({platform, keyword, city}) 抓取。需登录的平台(boss/liepin)先在浏览器登录'
      : '请先运行 launch-chrome.ps1 启动浏览器并登录目标平台',
  };
}
