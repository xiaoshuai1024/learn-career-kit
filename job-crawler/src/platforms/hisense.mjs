/**
 * hisense.mjs — 海信集团官方招聘 adapter (自建 API 模式)
 *
 * 平台: jobs.hisense.com (SPA, 岗位走 /api/JobAd/GetJobAdPageList)
 * 特性: list API 一次返回完整 JD(Duty+Require), 不需详情页; 全国696岗,青岛327
 * 城市过滤: LocNames 文本匹配(青岛/济南), 不依赖内部 LocId 编码
 */
export default {
  id: 'hisense',
  label: '海信集团(官方)',
  sectionTitle: '## 十、海信集团(官方)',
  directionSection: { 后端: '### 海信·后端', 前端: '### 海信·前端', 全栈: '### 海信·技术', AI: '### 海信·AI', 管理: '### 海信·管理' },
  domains: ['hisense.com'],
  loginRequired: false,
  cityCodes: { 青岛: '青岛', 济南: '济南', 全国: '' }, // LocNames 文本匹配

  mode: 'api',
  api: {
    baseUrl: 'https://jobs.hisense.com',
    listPath: '/api/JobAd/GetJobAdPageList',
    listMethod: 'POST',
    pageSize: 20,
    buildRequestBody({ page }) {
      return {
        Category: ['1'],            // 1=社会招聘
        PageIndex: page - 1,        // 0-based
        PageSize: 20,
        KeyWords: '',
        SpecialType: 0,
        PortalId: '',
        DisplayFields: ['Category', 'LocId', 'LocNames', 'PostDate', 'ClassificationOne', 'ClassificationTwo', 'JobAdName', 'Salary', 'Duty', 'Require', 'Degree', 'YearsOfWorking'],
      };
    },
    parseList(json, ctx) {
      const list = (json?.Data) || [];
      const cityKw = ctx.city || ''; // 青岛/济南/空
      const jobs = list
        .filter((j) => {
          if (!cityKw) return true;
          const locs = (j.LocNames || []).join(',');
          return locs.includes(cityKw);
        })
        .map((j) => {
          const locText = (j.LocNames || [])[0] || '';
          const jd = [j.Duty, j.Require].filter(Boolean).join('\n\n任职要求:\n');
          return {
            company: '海信集团',
            companyFull: '海信集团有限公司',
            title: j.JobAdName || '',
            salary: j.Salary || '面议',
            salaryMin: null,
            salaryMax: null,
            area: locText,
            city: cityKw || locText.replace(/^.*·/, '').replace(/市$/, '') || '青岛',
            experience: j.YearsOfWorking || '',
            education: j.Degree || '',
            skills: [j.ClassificationOne, j.ClassificationTwo].filter(Boolean),
            jobUrl: `${ctx.baseUrl}/social/jobs/${j.JobAdId}`,
            jobId: String(j.JobAdId),
            jd,
            lastActive: (j.PostDate || '').slice(0, 10),
          };
        });
      // hasMore 看全国 list 是否满页(城市过滤后可能少, 但全国还有下一页)
      return { jobs, hasMore: list.length >= 20 };
    },
  },

  selectors: { list: { container: [], card: [] }, card: {}, detail: { jd: [], companyFull: [], skills: [] } },
  buildSearchUrl() { return 'https://jobs.hisense.com/social'; },
  extractJobId(url) { const m = String(url || '').match(/jobs\/(\d+)/); return m?.[1] || null; },
  riskSignals: { captchaUrlRe: '', loginUrlRe: /login/i, captchaSelectors: '' },
};
