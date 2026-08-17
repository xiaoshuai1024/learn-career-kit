/**
 * platforms/index.mjs — platform adapter 注册表
 *
 * 加新平台:在此 import 并加入 REGISTRY 即可。guard/throttle/check_status 通过
 * allDomains()/allAdapters() 自动跟随,无需改它们。
 *
 * 支持 BOSS直聘/猎聘/智联/51Job 四大平台。
 */
import boss from './boss.mjs';
import job51 from './job51.mjs';
import zhilian from './zhilian.mjs';
import liepin from './liepin.mjs';

const REGISTRY = {
  boss,
  job51,
  zhilian,
  liepin,
};

/** 取 adapter(未知 id 返回 undefined) */
export function getAdapter(id) {
  return REGISTRY[id];
}

/** 全部平台 id 列表 */
export function listPlatforms() {
  return Object.keys(REGISTRY);
}

/** 全部 adapter 对象 */
export function allAdapters() {
  return Object.values(REGISTRY);
}

/** 所有平台域名汇总(贡献给 guard 白名单) */
export function allDomains() {
  return [...new Set(allAdapters().flatMap((a) => a.domains))];
}

/** 从 URL 反查平台(get_job_detail 只传 jobUrl 时自动识别) */
export function getAdapterByUrl(url) {
  try {
    const host = new URL(url).hostname;
    return allAdapters().find((a) => a.domains.some((d) => host === d || host.endsWith('.' + d))) || null;
  } catch {
    return null;
  }
}
