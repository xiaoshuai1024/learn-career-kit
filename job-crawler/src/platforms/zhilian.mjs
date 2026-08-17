/**
 * zhilian.mjs — 智联招聘 platform adapter
 *
 * 反爬中等、列表免登录。⚠️ 初版待实测校准(同 job51):URL/城市码(jl)/选择器 系初版。
 * 智联现主域 zhaopin.com,搜索可能在 sou.zhaopin.com / jobs.zhaopin.com / fe-api 接口,待实测确认。
 * 校准流程同 job51.mjs 顶部注释。
 */
export default {
  id: 'zhilian',
  label: '智联招聘',
  sectionTitle: '## 四、智联招聘',
  directionSection: {
    // 智联段当前只有一个合并子分区
    前端: '### 前端/全栈开发',
    后端: '### 前端/全栈开发',
    全栈: '### 前端/全栈开发',
    AI: '### 前端/全栈开发',
  },
  domains: ['zhaopin.com'],
  loginRequired: false, // 列表免登录可看

  // 智联 jl 城市码(数字) — 2026-06-28 实测校准(从真实 URL 提取)
  cityCodes: {
    全国: '',
    青岛: '703',
    济南: '702',
    北京: '530',
    上海: '538',
    深圳: '765',
    杭州: '639',
  },
  salaryCodes: {}, // 待实测

  // DOM 选择器(2026-06-28 实测校准:www.zhaopin.com/sou/jl{code}/kw{keyword}/p1)
  selectors: {
    list: {
      container: ['.joblist-box', '.positionlist', '#listContent', '[class*=job-list]', '[class*=result-list]'],
      card: ['.joblist-box__item', '.jobcard', '.positionlist .joblist-box__item', '[class*=jobcard]', '[class*=job-item]'],
    },
    card: {
      company: ['.companyinfo__name', '.company-name a', '.company_name a', '[class*=company-name] a', '[class*=companyInfo]'],
      title: ['.jobinfo__name', '.job-name a', '.iteminfo__line1__jobname a', '[class*=job-name]'],
      salary: ['.jobinfo__salary', '.iteminfo__line2__jobdesc__salary', '.salary', '[class*=salary]'],
      area: ['.jobinfo__other-info-item:nth-child(1)', '[class*=other-info] span', '.iteminfo__line2__jobdesc__demand', '.job-area', '[class*=area]'],
      jobUrl: ['.jobinfo__name a', '.job-name a', 'a[href*="zhaopin.com"]', 'a[href*="/jobs/"]'],
      skills: ['.joblist-box__item-tag', '.jobinfo__welfare span', '.welfare span', '[class*=welfare] span', '[class*=tag]'],
      companyTag: ['.companyinfo__tag', '.company__info', '.company-text', '[class*=company-info]', '[class*=company-size]'],
      experience: ['.jobinfo__other-info-item:nth-child(2)'],
      education: ['.jobinfo__other-info-item:nth-child(3)'],
      lastActive: ['[class*=time]', '[class*=update]', '[class*=publish]', '[class*=active]'],
    },
    detail: {
      jd: ['.describtion-card__detail-content', '.describtion__detail', '.job-detail', '.responsibility', '[class*=job-detail]', '[class*=job-desc]'],
      companyFull: ['.company__name a', '.company-name a', '[class*=company-name]', '[class*=company-title]'],
      skills: ['.welfare span', '.job-tags span', '[class*=welfare] span', '[class*=tag]'],
    },
  },

  /** 构造智联搜索 URL。⚠️ 初版:sou.zhaopin.com + jl 城市码,待实测确认接口 */
  buildSearchUrl({ keyword, cityCode, salaryCode }) {
    const u = new URL('https://sou.zhaopin.com/');
    u.searchParams.set('kw', keyword);
    if (cityCode) u.searchParams.set('jl', cityCode);
    if (salaryCode) u.searchParams.set('sf', salaryCode);
    return u.toString();
  },

  /** 从智联详情 URL 抽 jobId(详情形如 jobs.zhaopin.com/CC123.htm) */
  extractJobId(url) {
    if (!url) return null;
    const m = url.match(/zhaopin\.com\/(?:[\w-]+\/)?(CC\w+|\d+)\.?(?:htm|html)?/);
    return m ? m[1] : null;
  },

  // ⚠️ 风控信号初版,待实测
  riskSignals: {
    captchaUrlRe: /\/safe|\/captcha|\/verify|security/i,
    loginUrlRe: /\/login/i,
    captchaSelectors: '[class*=slider], [class*=captcha], [class*=verify], .nc_iconfont',
  },
};
