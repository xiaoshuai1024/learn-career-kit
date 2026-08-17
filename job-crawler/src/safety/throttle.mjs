/**
 * throttle.mjs — 流量节流(防风控第一层,Agent 无法绕过)
 *
 * 机制(全部 server 层强制):
 *   1. 最小间隔:minGap~maxGap 随机抖动(全局,跨平台也节流——更保守)
 *   2. 批量冷却:每 batchSize 次操作,强制 batchCooldown 长冷却(全局)
 *   3. 单日上限:dailyCap,按平台落盘 daily-counter-<platform>.json,各平台独立配额
 *   4. 时段限制:activeHours 外(如凌晨)拒绝
 *   5. 熔断冷却:与 circuit-breaker 联动,按平台独立(cooldown-<platform>.json)
 *
 * 设计权衡:节流(1/2)全局共享=更保守安全;配额(3)/熔断(5)按平台=互不挤占。
 */
import { loadConfig } from '../config-loader.mjs';
import { readJson, writeJson } from './state-io.mjs';
import { audit } from './audit-log.mjs';
import { checkCooldown } from './circuit-breaker.mjs';

let lastTurnTs = 0; // 全局:跨平台共享,更保守
let turnCounter = 0; // 全局

const rand = ([min, max]) => min + Math.random() * (max - min);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function inActiveHours(activeHours) {
  const h = new Date().getHours();
  return h >= activeHours[0] && h < activeHours[1];
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dailyFile(platform) {
  return `daily-counter-${platform}.json`;
}

async function getDaily(platform) {
  const data = await readJson(dailyFile(platform), { date: todayKey(), count: 0 });
  if (data.date !== todayKey()) return { date: todayKey(), count: 0 };
  return data;
}

/** 获取一次操作许可:节流+冷却+时段+日上限全过才返回;否则抛错(给上层优雅返回) */
export async function acquireTurn(toolName, platform = 'boss') {
  const cfg = await loadConfig('safety.json');

  // 1. 时段
  if (!inActiveHours(cfg.activeHours)) {
    await audit({ tool: toolName, platform, result: 'rejected', reason: 'outside-active-hours' });
    throw Object.assign(new Error(`⏰ 当前不在允许时段 ${cfg.activeHours.join('-')} 点(凌晨操作是机器人强信号)`), { code: 'OUTSIDE_HOURS' });
  }

  // 2. 熔断冷却(按平台)
  const cool = await checkCooldown(platform);
  if (cool.in) {
    await audit({ tool: toolName, platform, result: 'rejected', reason: 'cooldown', until: cool.untilIso });
    throw Object.assign(new Error(`🧊 [${platform}] 熔断冷却中,至 ${cool.untilIso}(原因:${cool.reason})`), { code: 'COOLDOWN' });
  }

  // 3. 日上限(按平台)
  const daily = await getDaily(platform);
  if (daily.count >= cfg.dailyCap) {
    await audit({ tool: toolName, platform, result: 'rejected', reason: 'daily-cap', count: daily.count });
    throw Object.assign(new Error(`📊 [${platform}] 今日已抓 ${daily.count} 条,达上限 ${cfg.dailyCap},明天再试`), { code: 'DAILY_CAP' });
  }

  // 4. 最小间隔(全局)
  const gap = rand([cfg.minGapMs, cfg.maxGapMs]);
  const elapsed = Date.now() - lastTurnTs;
  if (elapsed < gap) {
    const wait = gap - elapsed;
    await audit({ tool: toolName, platform, result: 'throttled', waitMs: Math.round(wait) });
    await sleep(wait);
  }

  // 5. 批量冷却(全局):每 batchSize 次操作冷却一次
  if (turnCounter > 0 && turnCounter % cfg.batchSize === 0) {
    const cd = rand(cfg.batchCooldownMs);
    await audit({ tool: toolName, platform, result: 'batch-cooldown', waitMs: Math.round(cd), batch: turnCounter });
    await sleep(cd);
  }

  lastTurnTs = Date.now();
  turnCounter++;
}

/** 记录已抓取条数(累计到该平台日计数) */
export async function recordFetch(count, platform = 'boss') {
  const daily = await getDaily(platform);
  daily.count += count;
  await writeJson(dailyFile(platform), daily);
}

export async function getDailyStats(platform = 'boss') {
  const cfg = await loadConfig('safety.json');
  const daily = await getDaily(platform);
  return { platform, count: daily.count, cap: cfg.dailyCap, remaining: Math.max(0, cfg.dailyCap - daily.count) };
}
