/**
 * circuit-breaker.mjs — 熔断(防风控止损层)
 *
 * 触发即写 cooldown-<platform>.json,该平台后续操作被 throttle.acquireTurn 拦截。
 * 按平台独立熔断:一个平台触发验证码,不影响其他平台继续抓。
 * 检测信号(由 adapter.riskSignals 提供):验证码页 / 登录失效 / 疑似限流 / DOM 大面积失败。
 * 红线:验证码只暂停等人手动过,绝不破解、不绕过。
 */
import { readJson, writeJson } from './state-io.mjs';
import { audit } from './audit-log.mjs';

const COOLDOWNS = {
  captcha: 60 * 60 * 1000, // 验证码:冷却 1h
  loginExpired: 30 * 60 * 1000, // 登录失效:30min(等人重登)
  rateLimited: 2 * 60 * 60 * 1000, // 疑似限流:2h
  domAnomaly: 30 * 60 * 1000, // DOM 大面积失败:30min
};

function cooldownFile(platform) {
  return `cooldown-${platform}.json`;
}

export async function trip(reason, customMs, platform = 'boss') {
  const ms = customMs ?? COOLDOWNS[reason] ?? 30 * 60 * 1000;
  const until = Date.now() + ms;
  await writeJson(cooldownFile(platform), { reason, until, trippedAt: Date.now(), platform });
  await audit({ tool: 'circuit-breaker', result: 'tripped', reason, untilMs: ms, platform });
  console.error(`🧊 熔断触发[${platform}]: ${reason},冷却 ${Math.round(ms / 60000)}min`);
  return ms;
}

export async function checkCooldown(platform = 'boss') {
  const cd = await readJson(cooldownFile(platform), null);
  if (!cd) return { in: false, platform };
  if (Date.now() >= cd.until) {
    await writeJson(cooldownFile(platform), null).catch(() => {});
    return { in: false, platform };
  }
  return {
    in: true,
    reason: cd.reason,
    untilMs: cd.until,
    untilIso: new Date(cd.until).toISOString(),
    platform,
  };
}

/** 检查当前页面是否有危险信号(验证码/登录失效),有则 trip(用 adapter.id 落到对应平台) */
export async function checkPageGuard(page, adapter) {
  try {
    const url = page.url();
    const rs = adapter.riskSignals;
    if (rs.captchaUrlRe.test(url)) {
      await trip('captcha', undefined, adapter.id);
      return { safe: false, reason: 'captcha-url' };
    }
    if (rs.loginUrlRe.test(url)) {
      await trip('loginExpired', undefined, adapter.id);
      return { safe: false, reason: 'login-expired' };
    }
    const hasCaptcha = await page
      .evaluate((s) => !!document.querySelector(s), rs.captchaSelectors)
      .catch(() => false);
    if (hasCaptcha) {
      await trip('captcha', undefined, adapter.id);
      return { safe: false, reason: 'captcha-element' };
    }
    return { safe: true };
  } catch (e) {
    return { safe: false, reason: 'check-error', error: e.message };
  }
}
