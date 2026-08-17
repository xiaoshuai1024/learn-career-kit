/**
 * job51.mjs — 前程无忧(51Job) platform adapter
 *
 * 2026-06-28 实测校准(用户登录后手动搜索提供 ground truth):
 *   ✅ URL = we.51job.com/pc/search?jobArea=<数字码>&keyword=<关键词>&searchType=2&keywordType=
 *   ✅ jobArea 是 6 位数字码(青岛=120500),不是拼音
 *   ✅ loginRequired = true:选城市/搜索需登录(不登录无法选城市,只剩推荐区)
 *   ✅ DOM 选择器已校准(.job-item/.job-name/.salary/.company/.location)
 *
 * 城市码待补:目前只实测了青岛(120500)。其他城市(济南/北京/上海...)需用户登录后手动搜索,
 * 从地址栏 jobArea 取码,补入下方 cityCodes。
 */
export default {
  id: 'job51',
  label: '前程无忧',
  sectionTitle: '## 三、51Job（前程无忧）',
  directionSection: {
    前端: '### 前端/全栈开发',
    后端: '### 前端/全栈开发',
    全栈: '### 前端/全栈开发',
    AI: '### 前端/全栈开发',
  },
  domains: ['51job.com'],
  loginRequired: false, // 2026-07-05 复测:we.51job.com/pc/search 免登录即可搜索(有结果、无登录墙);原 2026-06-28 标 true 已过时

  // 51job jobArea 6 位数字码。实测:青岛=120300(120500 是潍坊)。济南=120200(推测,待验证)
  cityCodes: {
    全国: '',
    青岛: '120300', // 2026-06-28 实测
    济南: '120200', // 推测(山东12:1203青岛/1205潍坊→1202济南),待验证
    // 北京/上海/深圳/杭州 待补:登录后手动搜,从地址栏 jobArea 取码
  },
  salaryCodes: {}, // 待实测

  // DOM 选择器(2026-06-28 实测:we.51job.com/pc/search 真实结构)
  selectors: {
    list: {
      container: ['.job-item', '.joblist', '[class*=joblist]', '[class*=job-list]'], // 首位等卡片而非容器:.joblist 容器先渲染、.job-item 卡片异步后到,只等容器会抽早得 0(2026-07-05 修)
      card: ['.job-item', '[class*=job-item]'],
    },
    card: {
      company: ['.company', '.item-bottom .company', '[class*=company]'],
      title: ['.job-name', 'h3.job-name', '[class*=job-name]'],
      salary: ['.salary', '[class*=salary]'],
      area: ['.location', '.item-bottom .location', '[class*=location]'],
      jobUrl: ['a[href*="jobs.51job.com"]', 'a[href*="51job.com"]', '.job-item a'],
      skills: ['.welfare', '.labels', '[class*=tag]'],
      companyTag: ['.company', '[class*=company-info]'],
      experience: ['[class*=work-year]', '[class*=experience]', '[class*=year]', '[class*=job-year]'],
      education: [], // 卡片 DOM 无学历字段(在 sensorsdata 里),留空防 extractVisibleCards 访问 undefined 报错(2026-07-05 修)
      lastActive: ['[class*=time]', '[class*=update]', '[class*=publish]', '.time', '.updatetime'],
    },
    detail: {
      jd: ['.job_detail', '.bmsg', '.job_txt', '.cn-h2', '[class*=job-detail]', '[class*=job-desc]'],
      companyFull: ['.company a', '.cname a', '[class*=company-name]', '[class*=company-title]'],
      skills: ['.welfare span', '.job-tags span', '.labels span', '[class*=tag]'],
    },
  },

  /** 构造 51Job 搜索 URL(实测格式:keyword + searchType=2 + jobArea + sortType=0) */
  buildSearchUrl({ keyword, cityCode, salaryCode }) {
    const u = new URL('https://we.51job.com/pc/search');
    u.searchParams.set('keyword', keyword);
    u.searchParams.set('searchType', '2');
    u.searchParams.set('jobArea', cityCode || '');
    u.searchParams.set('sortType', '0');
    if (salaryCode) u.searchParams.set('salary', salaryCode);
    return u.toString();
  },

  /** 从 51Job 详情 URL 抽 jobId(详情形如 jobs.51job.com/shenzhen-baq/172707396.html) */
  extractJobId(url) {
    if (!url) return null;
    const m = url.match(/51job\.com\/(?:[\w-]+\/)?(\d+)/);
    return m ? m[1] : null;
  },

  riskSignals: {
    captchaUrlRe: /\/safe|\/captcha|\/verify|security/i,
    loginUrlRe: /\/login/i,
    captchaSelectors: '[class*=slider], [class*=captcha], [class*=verify], .nc_iconfont',
  },
};
