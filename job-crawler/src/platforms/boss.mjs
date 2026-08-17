/**
 * boss.mjs — BOSS 直聘 platform adapter
 *
 * 从原 search-jobs.mjs / selectors.json / defaults.json / circuit-breaker.mjs 抽取的
 * BOSS 专属配置。多平台扩展时,新增同构 adapter(见 job51/zhilian/liepin)即可。
 *
 * 接口契约(所有 adapter 必须提供):
 *   id / label / sectionTitle / directionSection / domains / loginRequired
 *   cityCodes / salaryCodes / selectors / buildSearchUrl / extractJobId / riskSignals
 */
export default {
  id: 'boss',
  label: 'BOSS直聘',
  // 岗位列表.md 顶级段定位
  sectionTitle: '## 一、BOSS直聘',
  // 方向 → 段内子分区标题(各平台子分区不同)
  directionSection: {
    前端: '### 前端开发',
    后端: '### 后端开发',
    全栈: '### 全栈开发',
    AI: '### 前端开发', // BOSS 段无 AI 子表,降级前端
  },
  domains: ['zhipin.com'],
  loginRequired: true, // BOSS 必须登录才有列表

  // BOSS 9 位城市码(查询参数 city)
  cityCodes: {
    全国: '100010000',
    北京: '101010100',
    上海: '101020100',
    青岛: '101120200',
    济南: '101120100',
    深圳: '101280600',
    杭州: '101210100',
  },
  // BOSS 薪资码(查询参数 salary)
  salaryCodes: {
    '10-20K': '405',
    '15-25K': '406',
    '20-30K': '407',
    '30-50K': '408',
  },

  // DOM 选择器(主+备选,改版只改这里)。原 config/selectors.json 整表搬入。
  selectors: {
    list: {
      container: ['.rec-job-list', '[class*=job-list]', '.job-list-box', '.search-job-result'],
      card: ['.job-card-box', '.job-card-wrapper', '[class*=job-card]'],
    },
    card: {
      company: ['.boss-name', '.company-name a', '.company-name', '[class*=company-name]'],
      title: ['.job-name', '.job-title', '[class*=job-name]'],
      salary: ['.job-salary', '.salary', '.red', '[class*=salary]'],
      area: ['.company-location', '[class*=company-location]', '.job-area', '[class*=job-area]'],
      jobUrl: ["a.job-name", "a[href*='/job_detail/']", "a[href*='zhipin.com']", "a"], // 末位兜底:非 .rec-job-list 容器变体下卡片无 job-name 锚点,取任意 a(与 _boss-deep.mjs extractList 一致,2026-07-04 修 boss/架构师 jobUrl 全 null)
      skills: [],
      companyTag: ['.boss-name', '.company-info', '[class*=company-info]'],
      experience: ['.tag-list li:first-child', '.tag-list li:nth-child(1)'],
      education: ['.tag-list li:nth-child(2)'],
      lastActive: ['[class*=active-tag]', '[class*=boss-active]', '.boss-online-icon'],
    },
    detail: {
      jd: ['.job-sec-text', '.job-detail', '[class*=job-sec-text]'],
      companyFull: ['.company-info .name', '.sensitive-company-name', '[class*=company-name]'],
      bossActive: ['.boss-active-tag', '[class*=boss-active]'],
      skills: ['.job-tags .tag-list li', '.job-detail-section .tag-list span'],
    },
  },

  /** 构造 BOSS 搜索列表 URL(支持 page 分页) */
  buildSearchUrl({ keyword, cityCode, salaryCode, page }) {
    const u = new URL('https://www.zhipin.com/web/geek/job');
    u.searchParams.set('query', keyword);
    if (cityCode) u.searchParams.set('city', cityCode);
    if (salaryCode) u.searchParams.set('salary', salaryCode);
    if (page && page > 1) u.searchParams.set('page', String(page));
    return u.toString();
  },

  /**
   * 清洗 BOSS 薪资 PUA 字符(Unicode 私有区 ee80b0-ee80b9 → 0-9)
   * BOSS 用私有区字符渲染数字防爬,形如 -K → 31-36K
   */
  cleanSalary(salary) {
    if (!salary) return salary;
    const pua = '';
    const digits = '0123456789';
    let out = '';
    for (const ch of salary) {
      const idx = pua.indexOf(ch);
      out += idx >= 0 ? digits[idx] : ch;
    }
    return out;
  },

  /** 从详情页 URL 抽 jobId(去重键) */
  extractJobId(url) {
    if (!url) return null;
    const m = url.match(/\/(?:job_detail|zhaopin)\/([A-Za-z0-9~_]+)/);
    return m ? m[1] : null;
  },

  // 风控信号(喂 circuit-breaker.checkPageGuard)
  riskSignals: {
    captchaUrlRe: /\/safe\b|\/captcha|sec-zhipin/i,
    loginUrlRe: /\/login|\/wap\/login/i,
    captchaSelectors: '.captcha, [class*=captcha], #captcha, .nc_iconfont',
  },
};
