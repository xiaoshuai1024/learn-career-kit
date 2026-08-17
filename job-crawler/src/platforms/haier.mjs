/**
 * haier.mjs — 海尔集团官方招聘 adapter (混合模式: list GET API + detail DOM)
 *
 * 平台: maker.haier.net (AngularJS SPA)
 * - list: GET /client/job/searchdata.html?page=N&pagesize=50 (返回 618 岗摘要, 无JD)
 * - detail: GET /client/job/detail.html?id=X → DOM .detail-main (SSR, 含"职责描述...任职要求")
 * 城市过滤: location 文本(山东省-青岛市)
 */
export default {
  id: 'haier',
  label: '海尔集团(官方)',
  sectionTitle: '## 十一、海尔集团(官方)',
  directionSection: { 后端: '### 海尔·后端', 前端: '### 海尔·前端', 全栈: '### 海尔·架构', AI: '### 海尔·AI', 管理: '### 海尔·管理' },
  domains: ['haier.net'],
  loginRequired: false,
  cityCodes: { 青岛: '青岛', 济南: '济南', 全国: '' },

  mode: 'api',
  api: {
    baseUrl: 'https://maker.haier.net',
    listPath: '/client/job/searchdata.html',
    listMethod: 'GET',
    buildRequestBody({ page }) {
      return { page: String(page), pagesize: '50', key: '', source: '', core_job: '' };
    },
    parseList(json, ctx) {
      const list = (json?.data?.list) || [];
      const cityKw = ctx.city || '';
      const jobs = list
        .filter((j) => !cityKw || (j.location || '').includes(cityKw))
        .map((j) => {
          const cityLoc = (j.location || '').replace(/^.*-/, '').replace(/市$/, '');
          const salaryMin = j.min_yearly_salary ? +(j.min_yearly_salary / 12).toFixed(1) : null;
          const salaryMax = j.yearly_salary ? +(j.yearly_salary / 12).toFixed(1) : null;
          return {
            company: '海尔集团',
            companyFull: '海尔集团',
            title: j.job_name || '',
            salary: j.is_negotiable === '1' ? '面议' : (j.yearly_salary ? `${j.yearly_salary}万/年` : '面议'),
            salaryMin,
            salaryMax,
            area: cityLoc,
            city: cityKw || cityLoc || '青岛',
            experience: j.work_experience_label || '',
            education: j.education_required_label || '',
            skills: [j.bu_name, j.func_desc].filter(Boolean),
            jobUrl: `${ctx.baseUrl}/client/job/detail.html?id=${j.id}`,
            jobId: String(j.id),
            jd: '', // 待详情步骤填充
            lastActive: (j.update_time || '').slice(0, 10),
          };
        });
      return { jobs, hasMore: list.length >= 50 };
    },
    // 混合模式: list 无 JD, 进详情页 DOM 抽
    detailMode: 'dom',
    detailUrl: (job) => `https://maker.haier.net/client/job/detail.html?id=${job.jobId}`,
    detailSelector: '.detail-main',
    detailClean: (text) => {
      // 提取"职责描述"到"工作地点"之间的 JD
      const m = text.match(/职责描述([\s\S]*?)工作地点/);
      return m ? m[1].trim() : text.slice(0, 800);
    },
  },

  selectors: { list: { container: [], card: [] }, card: {}, detail: { jd: ['.detail-main'], companyFull: [], skills: [] } },
  buildSearchUrl() { return 'https://maker.haier.net/client/job/list'; },
  extractJobId(url) { const m = String(url || '').match(/id=(\d+)/); return m?.[1] || null; },
  riskSignals: { captchaUrlRe: '', loginUrlRe: /login/i, captchaSelectors: '' },
};
