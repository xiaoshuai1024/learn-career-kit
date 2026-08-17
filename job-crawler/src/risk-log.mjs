/**
 * risk-log.mjs — 风控事件记录(各平台抓取脚本共用)
 *
 * 检测到风控信号时调用 riskLog() 追加到 data/风控日志.json,
 * 含 平台/时间/关键词/类型/表现/推测原因。
 * 推测原因随验证迭代 — 拿到真因后同步到 memory: platform-anti-crawl-strategies.md。
 *
 * 风控类型:
 *   search-empty    搜索0卡(被重定向首页/软封禁/无referer/CDP痕迹)
 *   login-redirect  跳登录页(登录态失效/强制重登)
 *   captcha         验证码/滑块(频率触发)
 *   detail-blank    详情JD空(session限流,前N次正常后静默空白)
 *   rate-limit      频率限制(请求过快)
 *   safe-block      安全拦截页(WAF/safe路径,反爬升级)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, '..', 'data', '风控日志.json');

// 类型 → 推测原因(运行时快速归因, 真因验证后更新这里 + memory)
const GUESS = {
  'search-empty': '搜索0卡: 可能无结果, 或被软封禁重定向首页(查URL是否回首页/缺referer/CDP痕迹累积)',
  'login-redirect': '跳登录页: 登录态失效或被强制重登(检查cookie)',
  'captcha': '验证码/滑块: 频率触发风控, 需手动过或降速',
  'detail-blank': '详情JD空: session限流(前N次正常后静默空白), 加大间隔或换session',
  'rate-limit': '频率限制: 请求过快, 加大详情/关键词间隔',
  'safe-block': '安全拦截页(WAF/safe路径): 反爬升级, 需新绕过策略',
};

export async function riskLog({ platform, keyword = '', type, evidence = '' }) {
  const entry = {
    time: new Date().toISOString(),
    platform, keyword, type,
    evidence: String(evidence).slice(0, 300),
    guess: GUESS[type] || '未知风控类型(待人工归因)',
  };
  let arr = [];
  try { arr = JSON.parse(await readFile(LOG_FILE, 'utf8')); } catch {}
  arr.push(entry);
  arr = arr.slice(-300); // 保留最近300条, 防无限增长
  try {
    await writeFile(LOG_FILE, JSON.stringify(arr, null, 2));
    console.error(`⚡[RISK][${platform}][${type}] ${entry.guess}${keyword ? ` <${keyword}>` : ''}`);
  } catch (e) { console.error(`[RISK] 写日志失败: ${e.message}`); }
  return entry;
}
