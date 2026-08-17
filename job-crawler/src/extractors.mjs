/**
 * extractors.mjs — DOM 抽取(容错优先,高效批量)— 平台无关
 *
 * 全部用单次 page.evaluate 批量抽,避免逐字段 $eval 的跨进程开销。
 * 每个字段独立取值,失败返回 null(上层标"待补充"),不崩整卡。
 *
 * 选择器与 jobId 抽取由调用方传入的 adapter 提供,本模块不知道目标站是谁。
 */
/** 判断 evaluate 失败是否因 frame 导航可重试 */
function isDetachedError(err) {
  const m = (err.message || '').toLowerCase();
  return m.includes('detached') || m.includes('execution context was destroyed') ||
         m.includes('frame was detached') || m.includes('target closed');
}

/** 带重试的 page.evaluate(防 detached frame) */
async function safeEvaluate(page, fn, ...args) {
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      return await page.evaluate(fn, ...args);
    } catch (err) {
      lastErr = err;
      if (isDetachedError(err)) {
        // page 导航了导致 frame 失效,等一会再试
        if (i < MAX_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 600 + Math.random() * 1200));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** 抽取当前可视区所有岗位卡片(单次 evaluate,带 detached 重试) */
export async function extractVisibleCards(page, adapter) {
  const cfg = adapter.selectors;
  const c = cfg.card;
  const raw = await safeEvaluate(page,
    (cardSel, listCardSelectors) => {
      const q = (root, sels) => {
        for (const s of sels) {
          const n = root.querySelector(s);
          if (n) return (n.innerText || n.textContent || '').trim() || null;
        }
        return null;
      };
      const qa = (root, sels) => {
        for (const s of sels) {
          const n = root.querySelector(s);
          if (n) return n.href || null;
        }
        return null;
      };
      const qsList = (root, sels) => {
        for (const s of sels) {
          const ns = root.querySelectorAll(s);
          if (ns && ns.length)
            return [...ns].slice(0, 8).map((n) => (n.innerText || n.textContent || '').trim()).filter(Boolean);
        }
        return [];
      };
      const findCards = () => {
        for (const s of listCardSelectors) {
          const cs = document.querySelectorAll(s);
          if (cs && cs.length) return [...cs];
        }
        return [];
      };
      return findCards().map((el) => ({
        company: q(el, cardSel.company),
        title: q(el, cardSel.title),
        salary: q(el, cardSel.salary),
        area: q(el, cardSel.area),
        jobUrl: qa(el, cardSel.jobUrl),
        skills: qsList(el, cardSel.skills),
        companyTag: q(el, cardSel.companyTag),
        experience: q(el, cardSel.experience),
        education: q(el, cardSel.education),
        lastActive: q(el, cardSel.lastActive),
      }));
    },
    c,
    cfg.list.card
  );
  const ts = new Date().toISOString();
  return raw.map((j) => ({
    ...j,
    salary: adapter.cleanSalary ? adapter.cleanSalary(j.salary) : j.salary,
    jobId: adapter.extractJobId(j.jobUrl),
    _extractedAt: ts,
  }));
}

/** 抽取详情页(JD/公司全称/技能) — 带 detached 重试 */
export async function extractDetail(page, adapter) {
  const d = adapter.selectors.detail;
  return safeEvaluate(page,(detailSel) => {
    const q = (sels) => {
      for (const s of sels) {
        const n = document.querySelector(s);
        if (n) return (n.textContent || '').trim() || null;
      }
      return null;
    };
    const qsList = (sels) => {
      for (const s of sels) {
        const ns = document.querySelectorAll(s);
        if (ns && ns.length)
          return [...ns].slice(0, 10).map((n) => (n.innerText || n.textContent || '').trim()).filter(Boolean);
      }
      return [];
    };
    return { jd: q(detailSel.jd), companyFull: q(detailSel.companyFull), skills: qsList(detailSel.skills) };
  }, d);
}

/** 评估单条抽取失败率(关键字段 null 占比) */
export function assessFail(job) {
  const fields = [job.company, job.title, job.salary, job.jobUrl];
  const nulls = fields.filter((v) => !v).length;
  return fields.length ? nulls / fields.length : 1;
}

/**
 * API 模式抽取(adapter.mode==='api')—— 在 page 同源上下文 fetch JSON
 * 复用浏览器登录态 cookie、绕 CORS。返回 adapter.api.parseList 的结果。
 * DOM 站(mode 缺省)不走这里,仍用 extractVisibleCards(向后兼容)。
 */
export async function fetchListViaApi(page, adapter, { keyword, cityCode, page: pageNum }) {
  const api = adapter.api;
  if (!api) throw new Error(`adapter ${adapter.id} 无 api 配置`);
  let url = api.baseUrl + api.listPath;
  const body = api.buildRequestBody({ keyword, cityCode, page: pageNum });
  let bodyStr = null;
  if (api.listMethod === 'GET' && body) {
    // GET 模式: requestBody 转 query string
    const qs = new URLSearchParams(body).toString();
    url += (url.includes('?') ? '&' : '?') + qs;
  } else if (body) {
    bodyStr = JSON.stringify(body);
  }
  const json = await safeEvaluate(
    page,
    async (url, method, bodyStr) => {
      const opt = { method, headers: { 'Content-Type': 'application/json' } };
      if (bodyStr) opt.body = bodyStr;
      const r = await fetch(url, opt);
      if (!r.ok) return { __error: `HTTP ${r.status}` };
      return r.json();
    },
    url, api.listMethod, bodyStr
  );
  if (json?.__error) throw new Error(`${adapter.id} API ${json.__error} @ ${url.slice(0, 80)}`);
  return api.parseList(json, { baseUrl: api.baseUrl, city: cityCode, keyword });
}
