/**
 * platforms/index.mjs — platform adapter 注册表
 *
 * 加新平台:在此 import 并加入 REGISTRY 即可。guard/throttle/check_status 通过
 * allDomains()/allAdapters() 自动跟随,无需改它们。
 *
 * 阶段1 只注册 boss;阶段2-4 加 job51/zhilian/liepin。
 */
import boss from './boss.mjs';
import job51 from './job51.mjs';
import zhilian from './zhilian.mjs';
import liepin from './liepin.mjs';
import teld from './teld.mjs';
import inspur from './inspur.mjs';
import hisense from './hisense.mjs';
import haier from './haier.mjs';

const REGISTRY = {
  boss,
  job51,
  zhilian,
  liepin,
  teld,
  inspur,
  hisense,
  haier,
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
