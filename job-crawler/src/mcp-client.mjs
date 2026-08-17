/**
 * mcp-client.mjs — 远程 MCP Server 客户端
 *
 * 给现有爬虫使用:抓取结束后把数据推送到远程 MCP Server(MySQL 持久化+版本快照)。
 *
 * 用法:
 *   import { pushCrawlResults, queryJobs, getStats } from './mcp-client.mjs';
 *
 *   // 推送一次抓取结果
 *   await pushCrawlResults({
 *     keyword: '架构师',
 *     city: '青岛',
 *     platform: 'boss',
 *     jobs: [...],
 *     serverUrl: 'http://your-server:3001',
 *   });
 *
 *   // 查询
 *   const result = await queryJobs({ city: '青岛', minSalary: 25 }, 'http://your-server:3001');
 */
import { createHash } from 'node:crypto';

// ====== 配置 ======
// 默认地址 — 可通过环境变量 MCP_SERVER_URL 覆盖
const DEFAULT_SERVER = process.env.MCP_SERVER_URL || 'http://localhost:3001';

// ====== 基础请求 ======
async function apiPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => 'unknown error');
    throw new Error(`MCP API 请求失败 [${r.status}]: ${text.slice(0, 200)}`);
  }
  return r.json();
}

async function apiGet(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text().catch(() => 'unknown error');
    throw new Error(`MCP API 请求失败 [${r.status}]: ${text.slice(0, 200)}`);
  }
  return r.json();
}

// ====== PUA 薪资清洗 ======
const PUA = '';
const DIGITS = '0123456789';

function cleanSalary(salary) {
  if (!salary) return salary;
  let out = '';
  for (const ch of salary) {
    const idx = PUA.indexOf(ch);
    out += idx >= 0 ? DIGITS[idx] : ch;
  }
  return out;
}

/** 从薪资文本解析 min/max 数值(K) */
function parseSalaryRange(salaryStr) {
  if (!salaryStr) return { min: null, max: null };
  const clean = cleanSalary(salaryStr);
  const m = clean.match(/(\d+)[-～~](\d+)[Kk]/);
  if (m) return { min: parseFloat(m[1]), max: parseFloat(m[2]) };
  return { min: null, max: null };
}

// ====== 公开 API ======

/**
 * 推送抓取结果到 MCP Server
 *
 * @param {Object} opts
 * @param {string} opts.keyword - 搜索关键词
 * @param {string} opts.city - 城市
 * @param {string} opts.platform - 平台
 * @param {Array}  opts.jobs - 岗位列表
 * @param {string} [opts.serverUrl] - MCP 服务器地址
 * @param {string} [opts.auth] - Basic auth "user:pass"
 * @returns {Object} { success, versionId, versionTag, stats }
 */
export async function pushCrawlResults({ keyword, city, platform, jobs, serverUrl, auth }) {
  const base = serverUrl || DEFAULT_SERVER;

  // 转换 job 格式:补 salaryMin/Max
  const normalizedJobs = jobs.map(j => {
    const range = parseSalaryRange(j.salary);
    return {
      company: j.company || '',
      title: j.title || '',
      salary: cleanSalary(j.salary) || '',
      salaryMin: range.min,
      salaryMax: range.max,
      area: j.area || '',
      city: j.city || city || '青岛',
      experience: j.experience || '',
      education: j.education || '',
      skills: Array.isArray(j.skills) ? j.skills : (j.skills ? [j.skills] : []),
      jobUrl: j.jobUrl || '',
      jobId: j.jobId || '',
      platform: j.platform || platform || 'boss',
      jd: j.jd || '',
      lastActive: j.lastActive || '',
    };
  });

  // 通过 MCP 协议调用 (SSE POST)
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const encoded = Buffer.from(auth).toString('base64');
    headers['Authorization'] = `Basic ${encoded}`;
  }

  const body = {
    method: 'tools/call',
    params: {
      name: 'save_crawl_results',
      arguments: {
        keyword,
        city,
        platform,
        jobs: normalizedJobs,
      },
    },
  };

  // 使用 REST API 导入(更稳定)
  const r = await fetch(`${base}/api/import-jobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyword, city, platform, jobs: normalizedJobs }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`推送失败 [${r.status}]: ${text.slice(0, 200)}`);
  }

  return r.json();
}

/**
 * 查询岗位(远程数据库)
 *
 * @param {Object} filters - { keyword, city, platform, minSalary, maxSalary, experience, education, limit, offset }
 * @param {string} [serverUrl]
 * @returns {Object} { total, jobs }
 */
export async function queryJobs(filters = {}, serverUrl) {
  const base = serverUrl || DEFAULT_SERVER;
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, v);
  });
  params.set('limit', filters.limit || 100);
  params.set('offset', filters.offset || 0);
  return apiGet(`${base}/api/jobs?${params.toString()}`);
}

/**
 * 获取统计概览
 */
export async function getStats(serverUrl) {
  const base = serverUrl || DEFAULT_SERVER;
  return apiGet(`${base}/api/stats`);
}

/**
 * 获取版本列表
 */
export async function getVersions(serverUrl) {
  const base = serverUrl || DEFAULT_SERVER;
  return apiGet(`${base}/api/versions`);
}

/**
 * 获取单个岗位详情
 */
export async function getJobDetail(jobId, serverUrl) {
  const base = serverUrl || DEFAULT_SERVER;
  return apiGet(`${base}/api/jobs/${encodeURIComponent(jobId)}`);
}

/**
 * 测试连接
 */
export async function ping(serverUrl) {
  const base = serverUrl || DEFAULT_SERVER;
  return apiGet(`${base}/health`);
}
