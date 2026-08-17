/**
 * guard.mjs — 域名隔离(堵住 CDP 能控整个浏览器的弱点)
 *
 * 白名单 = 所有已注册 adapter 的 domains 汇总(platforms/index.allDomains)。
 * 加新平台只需在 adapter 声明 domains,guard 自动跟上,无需改本文件。
 * 任何 navigate/goto 前必须过 assertAllowedUrl。即便 Agent 越权要求导航他处,server 层拒绝并记审计。
 */
import { audit } from './audit-log.mjs';
import { allDomains } from '../platforms/index.mjs';

export async function isAllowedUrl(rawUrl) {
  const allowed = allDomains();
  try {
    const u = new URL(rawUrl);
    return allowed.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

export async function assertAllowedUrl(rawUrl, toolName = 'unknown') {
  if (!(await isAllowedUrl(rawUrl))) {
    const allowed = allDomains();
    await audit({ tool: toolName, result: 'blocked', reason: 'domain-not-allowed', url: rawUrl });
    throw new Error(`🛡️ 域名白名单拒绝:仅允许 ${allowed.join(' / ')},收到 ${rawUrl}`);
  }
}

export async function getAllowedDomains() {
  return allDomains();
}
