/**
 * search-jobs.mjs — MCP 工具 search_jobs(多平台)
 *
 * 流程:识别平台 → 节流 → 域名校验 → 导航 → 熔断检测 → 等容器 → 拟人滚动 → 抽取 → 去重 → 快照 → 记数。
 * 内部强制穿过 safety/ 层。只读,不投递。
 */
import { ensurePage } from '../browser.mjs';
import { acquireTurn, recordFetch, getDailyStats } from '../safety/throttle.mjs';
import { checkPageGuard, trip } from '../safety/circuit-breaker.mjs';
import { assertAllowedUrl } from '../safety/guard.mjs';
import { humanScroll, humanDelay } from '../safety/humanize.mjs';
import { extractVisibleCards, assessFail } from '../extractors.mjs';
import { snapshotJobs } from '../writer.mjs';
import { loadConfig } from '../config-loader.mjs';
import { writeJson } from '../safety/state-io.mjs';
import { audit } from '../safety/audit-log.mjs';
import { getAdapter, listPlatforms } from '../platforms/index.mjs';

export const definition = {
  name: 'search_jobs',
  description:
    '搜索岗位(只读,多平台)。在已登录浏览器中按 平台/关键词/城市/薪资 抓取列表,内置节流防风控。结果暂存,用 export_to_md 写回岗位列表。',
  inputSchema: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        enum: ['boss', 'job51', 'zhilian', 'liepin'],
        description: '平台,默认 boss:boss=BOSS直聘 / job51=前程无忧 / zhilian=智联招聘 / liepin=猎聘',
      },
      keyword: { type: 'string', description: '职位关键词,如 前端 / Java / 全栈 / 技术总监' },
      city: { type: 'string', description: '城市名(中文),默认青岛' },
      salary: { type: 'string', description: '薪资区间(可选),如 15-25K' },
      limit: { type: 'number', description: '抓取上限(1-50)。灰度模式默认 5' },
      direction: {
        type: 'string',
        enum: ['前端', '后端', '全栈', 'AI'],
        description: '方向(决定 export 写回哪个子分区)',
      },
    },
    required: ['keyword'],
  },
};

export async function run(args) {
  const { keyword, city = '青岛', salary, limit, direction = '前端', platform = 'boss' } = args;
  const adapter = getAdapter(platform);
  if (!adapter) {
    return { ok: false, error: `未知平台 ${platform},可用:${listPlatforms().join('/')}`, code: 'BAD_INPUT' };
  }
  try {
    await acquireTurn('search_jobs', platform);
    const defaults = await loadConfig('defaults.json');
    const safety = await loadConfig('safety.json');

    const cityCode = adapter.cityCodes[city];
    if (!cityCode) {
      return {
        ok: false,
        error: `${adapter.label}不支持城市 ${city},可用:${Object.keys(adapter.cityCodes).join('/')}`,
        code: 'BAD_INPUT',
      };
    }
    const salaryCode = salary ? adapter.salaryCodes[salary] || '' : '';
    const url = adapter.buildSearchUrl({ keyword, cityCode, salaryCode });
    await assertAllowedUrl(url, 'search_jobs');

    const reqLimit = typeof limit === 'number' ? limit : defaults.grayMode ? safety.firstRunLimit : 20;
    const effectiveLimit = Math.min(Math.max(1, reqLimit), safety.sessionLimit);

    const page = await ensurePage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const _t_hd = Date.now(); await humanDelay(); const _dt_hd = Date.now() - _t_hd;
    if (_dt_hd > 3000) console.error(`[timing] humanDelay=${_dt_hd}ms (range ${JSON.stringify(safety.scrollSettleMs)})`);

    const guard = await checkPageGuard(page, adapter);
    if (!guard.safe) {
      return {
        ok: false,
        error: `页面异常:${guard.reason}。请在浏览器手动处理(过验证码 / 重新登录)后重试`,
        code: guard.reason,
      };
    }

    const cfg = adapter.selectors;
    let containerFound = false;
    for (const sel of cfg.list.container) {
      try {
        await page.waitForSelector(sel, { timeout: 15000 });
        containerFound = true;
        break;
      } catch {}
    }
    if (!containerFound) {
      await audit({ tool: 'search_jobs', platform, url, result: 'no-container' });
      return { ok: false, error: '未找到职位列表容器(页面改版或被拦截)', code: 'NO_CONTAINER' };
    }

    // 先抽首屏,够 limit 则跳过滚动(避免 humanScroll 的 mouse.wheel 在重页超时)
    let all = await extractVisibleCards(page, adapter);
    let rounds = 0;
    if (all.length < effectiveLimit) {
      rounds = await humanScroll(page, cfg.list.card[0], {
        maxRounds: Math.ceil(effectiveLimit / 5) + 3,
      });
      all = await extractVisibleCards(page, adapter);
    }
    const seen = new Map();
    for (const j of all) {
      const key = j.jobId || `${j.company}|${j.title}`;
      if (!seen.has(key)) seen.set(key, j);
    }
    const unique = [...seen.values()];
    const out = unique.slice(0, effectiveLimit);

    const failRate = out.length ? out.filter((j) => assessFail(j) > safety.extractFailThreshold).length / out.length : 1;
    if (out.length && failRate > safety.extractFailThreshold) {
      await trip('domAnomaly', undefined, platform);
    }

    await recordFetch(out.length, platform);
    await snapshotJobs(out);
    await writeJson('last-search.json', {
      jobs: out,
      query: { keyword, city, salary, platform },
      direction,
      platform,
      ts: new Date().toISOString(),
    });
    await audit({
      tool: 'search_jobs',
      platform,
      url,
      result: 'ok',
      fetched: out.length,
      total: unique.length,
      rounds,
      failRate: Math.round(failRate * 100) / 100,
    });

    return {
      ok: true,
      jobs: out,
      total: unique.length,
      truncated: unique.length > effectiveLimit,
      query: { platform: adapter.label, keyword, city, salary },
      direction,
      rounds,
      failRate: Math.round(failRate * 100) / 100,
      dailyCount: (await getDailyStats(platform)).count,
      hint: '抓取完成。调用 export_to_md({direction}) 写回岗位列表,或 get_job_detail 查看详情。',
    };
  } catch (e) {
    await audit({ tool: 'search_jobs', platform, result: 'error', error: e.message });
    return { ok: false, error: e.message, code: e.code };
  }
}
