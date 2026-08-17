/**
 * liepin.mjs — 猎聘 platform adapter
 *
 * 反爬中等、详情需登录、技术总监/架构师/AI 岗最对口(用户目标)。⚠️ 初版待实测校准(同 job51)。
 * 猎聘用 dqs 城市码(数字),搜索 www.liepin.com/zhaopin/。校准流程同 job51.mjs 顶部注释。
 * 注意:详情页需登录,使用前在 9222 浏览器登录猎聘(与 BOSS 同 profile,cookie 独立)。
 */
export default {
  id: 'liepin',
  label: '猎聘',
  sectionTitle: '## 二、猎聘',
  directionSection: {
    // 猎聘段有完整 4 子分区(见 docs/岗位列表.md)
    前端: '### 前端开发',
    后端: '### Java 后端',
    全栈: '### 全栈开发',
    AI: '### AI 应用开发',
  },
  domains: ['liepin.com'],
  loginRequired: true, // 详情需登录;列表部分可看,但登录后更全

  // 猎聘 city/dq 城市码(实测:250020=济南, 180=长沙)。青岛=250070 待确认
  cityCodes: {
    全国: '',
    青岛: '250070', // 待确认
    济南: '250020', // 2026-06-28 实测
    // 北京/上海/深圳/杭州 待补
  },
  salaryCodes: {}, // 待实测

  // DOM 选择器(2026-06-28 实测校准:猎聘用 hash class _40108xxx 不稳定,改用 data-nick 稳定钩子)
  // 卡片:.job-card-pc-container;字段用 [data-nick=job-detail-job-info]/[...company-info] 区块定位
  selectors: {
    list: {
      container: ['.job-list-box', '[class*=job-list-box]'],
      card: ['.job-card-pc-container', '[class*=job-card]'],
    },
    card: {
      company: ['[data-nick=job-detail-company-info] .ellipsis-1', '.company-name'],
      title: ['[data-nick=job-detail-job-info] .ellipsis-1', '.job-detail-box .ellipsis-1'],
      salary: ['[data-nick=job-detail-job-info] [class*=E8PWS]', '[data-nick=job-detail-job-info] div + span'],
      area: ['[data-nick=job-detail-job-info] span.ellipsis-1'],
      jobUrl: ['a[data-nick=job-detail-job-info]', 'a[href*="liepin.com/job"]'],
      skills: [],
      companyTag: ['[data-nick=job-detail-company-info]'],
      experience: ['[data-nick=job-detail-job-info] > div:last-child > span:first-child'],
      education: ['[data-nick=job-detail-job-info] > div:last-child > span:last-child'],
      lastActive: ['[class*=time]', '[class*=active]', '.recruiter-info-box [class*=ellipsis-1]'],
    },
    detail: {
      jd: ['.job-intro-container', '.job-description', '[class*=job-detail]', '[class*=job-desc]'],
      companyFull: ['[data-nick=job-detail-company-info] .ellipsis-1', '.company-name'],
      skills: ['.job-tags span', '.labels span', '[class*=tag]'],
    },
  },

  /** 构造猎聘搜索 URL(实测格式:city + dq 城市码 + key) */
  buildSearchUrl({ keyword, cityCode, salaryCode }) {
    const u = new URL('https://www.liepin.com/zhaopin/');
    u.searchParams.set('city', cityCode || '');
    u.searchParams.set('dq', cityCode || '');
    u.searchParams.set('key', keyword);
    u.searchParams.set('currentPage', '0');
    u.searchParams.set('pageSize', '40');
    if (salaryCode) u.searchParams.set('salaryCode', salaryCode);
    return u.toString();
  },

  /** 从猎聘详情 URL 抽 jobId(详情形如 liepin.com/job/123456.shtml) */
  extractJobId(url) {
    if (!url) return null;
    const m = url.match(/liepin\.com\/job\/(\d+)/);
    return m ? m[1] : null;
  },

  // ⚠️ 风控信号 — 注意 [class*=verify] 在猎聘会误匹配非风控元素,不用它
  riskSignals: {
    captchaUrlRe: /\/safe|\/captcha|security/i,
    loginUrlRe: /\/login/i,
    captchaSelectors: '[class*=slider], [class*=captcha], .nc_iconfont, [id*=captcha], [class*=geetest]',
  },
};
