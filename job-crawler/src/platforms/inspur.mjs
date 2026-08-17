/**
 * inspur.mjs — 浪潮集团官方招聘 adapter (HCM Cloud API 模式, 与 teld.mjs 同架构)
 *
 * 平台: inspur.hcmcloud.cn (AngularJS SPA, HCM Cloud 系统)
 * 济南总部 + 青岛, IT 岗密度高(60%+ 技术研发)
 */
export default {
  id: 'inspur',
  label: '浪潮集团(官方)',
  sectionTitle: '## 九、浪潮集团(官方)',
  directionSection: { 后端: '### 浪潮·后端', 前端: '### 浪潮·前端', 全栈: '### 浪潮·架构', AI: '### 浪潮·AI', 管理: '### 浪潮·管理' },
  domains: ['hcmcloud.cn'],
  loginRequired: false,
  cityCodes: { 济南: '济南市', 青岛: '青岛市', 全国: '' },

  mode: 'api',
  api: {
    baseUrl: 'https://inspur.hcmcloud.cn',
    listPath: '/api/hcm.model.list?model=ReleaseJobMgr',
    listMethod: 'POST',
    buildRequestBody({ cityCode, page }) {
      const filterDict = { job_class: '社会招聘', status: '1', delivery: 1, contract_unit: null };
      if (cityCode) filterDict.work_city = cityCode;
      return {
        model: 'ReleaseJobMgr',
        filter_dict: filterDict,
        page_index: page,
        page_size: 50,
        extra_property: { only_list: true },
      };
    },
    parseList(json, ctx) {
      const list = (json?.result?.list) || [];
      const jobs = list.map((j) => ({
        company: '浪潮集团',
        companyFull: '浪潮集团有限公司',
        title: j.name || '',
        salary: (j.low_salary && j.high_salary) ? `${Math.round(j.low_salary / 1000)}-${Math.round(j.high_salary / 1000)}K` : '面议',
        salaryMin: j.low_salary ? j.low_salary / 1000 : null,
        salaryMax: j.high_salary ? j.high_salary / 1000 : null,
        area: j.work_city || '',
        city: (j.work_city || ctx.city || '济南').replace(/市$/, ''),
        experience: j.work_exp >= 0 ? String(j.work_exp) : '',
        education: '',
        skills: Array.isArray(j.job_label) ? j.job_label : [],
        jobUrl: `${ctx.baseUrl}/recruit#/job_detail?id=${j.id}`,
        jobId: String(j.id),
        jd: j.job_desc || '',
        lastActive: (j.release_date || '').slice(0, 10),
      }));
      return { jobs, hasMore: list.length >= 50 };
    },
  },

  selectors: { list: { container: [], card: [] }, card: {}, detail: { jd: [], companyFull: [], skills: [] } },
  buildSearchUrl() { return 'https://inspur.hcmcloud.cn/recruit'; },
  extractJobId(url) { const m = String(url || '').match(/id=(\d+)/); return m?.[1] || null; },
  riskSignals: { captchaUrlRe: '', loginUrlRe: /login/i, captchaSelectors: '' },
};
