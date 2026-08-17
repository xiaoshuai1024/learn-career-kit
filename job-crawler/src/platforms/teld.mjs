/**
 * teld.mjs — 特来电官方招聘 adapter (HCM Cloud API 模式)
 *
 * 平台: hr.teld.cn (AngularJS SPA, 岗位列表走 XHR JSON)
 * 系统: HCM Cloud (浪潮 inspur.hcmcloud.cn 同架构, 可复用本模式)
 *
 * mode='api': 不走 DOM 选择器, 直接 POST hcm.model.list 拿岗位(含完整JD)
 * 消费侧(_crawl-official.mjs) 用 fetchListViaApi() 抽取
 */
export default {
  id: 'teld',
  label: '特来电(官方)',
  sectionTitle: '## 八、特来电新能源(官方)',
  directionSection: { 后端: '### 特来电·后端', 前端: '### 特来电·前端', 全栈: '### 特来电·技术', AI: '### 特来电·AI' },
  domains: ['teld.cn'],
  loginRequired: false,
  cityCodes: { 青岛: '青岛市', 济南: '济南市', 全国: '' }, // API 用城市全名过滤

  mode: 'api',
  api: {
    baseUrl: 'https://hr.teld.cn',
    listPath: '/api/hcm.model.list?model=ReleaseJobMgr',
    listMethod: 'POST',
    pageSize: 50,
    /** 构造请求体: keyword 不支持精确搜(官方站), 用 work_city 过滤;page 从1开始 */
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
    /** 响应 → 统一岗位字段(对齐 save-jobs JobSchema) */
    parseList(json, ctx) {
      const list = (json?.result?.list) || [];
      const jobs = list.map((j) => ({
        company: '特来电新能源股份有限公司',
        companyFull: '特来电新能源股份有限公司',
        title: j.name || '',
        salary: (j.low_salary && j.high_salary) ? `${Math.round(j.low_salary / 1000)}-${Math.round(j.high_salary / 1000)}K` : '面议',
        salaryMin: j.low_salary ? j.low_salary / 1000 : null,
        salaryMax: j.high_salary ? j.high_salary / 1000 : null,
        area: j.work_city || '',
        city: (j.work_city || ctx.city || '青岛').replace(/市$/, ''),
        experience: j.work_exp >= 0 ? String(j.work_exp) : '', // HCM 数字编码,抓取脚本从JD文本二次解析
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

  // DOM 字段(API 模式不用,保留占位满足 adapter 契约)
  selectors: { list: { container: [], card: [] }, card: {}, detail: { jd: [], companyFull: [], skills: [] } },
  buildSearchUrl() { return 'https://hr.teld.cn/recruit'; },
  extractJobId(url) { const m = String(url || '').match(/id=(\d+)/); return m?.[1] || null; },
  riskSignals: { captchaUrlRe: '', loginUrlRe: /login/i, captchaSelectors: '' },
};
