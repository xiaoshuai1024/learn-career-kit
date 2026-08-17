/**
 * get-job-detail.mjs — MCP 工具 get_job_detail(多平台,平台从 URL 自动识别)
 *
 * 流程:域名白名单 → 识别平台 → 节流 → 导航 → 熔断检测 → 等 JD → 抽详情 → 拟人阅读停留。
 */
import { ensurePage } from '../browser.mjs';
import { acquireTurn } from '../safety/throttle.mjs';
import { checkPageGuard } from '../safety/circuit-breaker.mjs';
import { assertAllowedUrl } from '../safety/guard.mjs';
import { humanRead } from '../safety/humanize.mjs';
import { extractDetail } from '../extractors.mjs';
import { getAdapterByUrl } from '../platforms/index.mjs';
import { audit } from '../safety/audit-log.mjs';

export const definition = {
  name: 'get_job_detail',
  description: '抓取单个岗位详情页(JD 全文/公司全称/技能标签)。平台自动从 URL 识别。内置拟人阅读停留,防秒开秒关。',
  inputSchema: {
    type: 'object',
    properties: {
      jobUrl: { type: 'string', description: '岗位详情页 URL(域名须在白名单内)' },
    },
    required: ['jobUrl'],
  },
};

export async function run(args) {
  const { jobUrl } = args;
  try {
    await assertAllowedUrl(jobUrl, 'get_job_detail');
    const adapter = getAdapterByUrl(jobUrl);
    if (!adapter) {
      // 理论上 assertAllowedUrl 已拦,双重保险
      return { ok: false, error: `无法识别 URL 所属平台:${jobUrl}`, code: 'BAD_INPUT' };
    }
    await acquireTurn('get_job_detail', adapter.id);
    const page = await ensurePage();
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const guard = await checkPageGuard(page, adapter);
    if (!guard.safe) {
      return { ok: false, error: `页面异常:${guard.reason}`, code: guard.reason };
    }

    for (const sel of adapter.selectors.detail.jd) {
      try {
        await page.waitForSelector(sel, { timeout: 10000 });
        break;
      } catch {}
    }

    const detail = await extractDetail(page, adapter);
    await humanRead(detail.jd); // 按字数停留,防秒开秒关

    await audit({ tool: 'get_job_detail', platform: adapter.id, url: jobUrl, result: 'ok', jdLen: (detail.jd || '').length });
    return { ok: true, jobUrl, platform: adapter.label, detail };
  } catch (e) {
    await audit({ tool: 'get_job_detail', result: 'error', error: e.message });
    return { ok: false, error: e.message, code: e.code };
  }
}
