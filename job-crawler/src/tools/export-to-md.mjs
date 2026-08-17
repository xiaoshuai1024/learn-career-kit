/**
 * export-to-md.mjs — MCP 工具 export_to_md(含前端入库筛选)
 *
 * 入库规则:前端岗优先级最低,**非知名大厂 + 高薪 不入库**。
 * 大厂白名单/高薪阈值在下方可调。
 */
import { appendJobs } from '../writer.mjs';
import { readJson } from '../safety/state-io.mjs';
import { audit } from '../safety/audit-log.mjs';

// 知名大厂白名单(前端岗仅这些公司入库,不受高薪阈值约束)
const BIG_COMPANY = [
  '海尔', '海信', '歌尔', '京东', '阿里', '淘宝', '腾讯', '字节', '抖音', '华为',
  '中车', '浪潮', '百度', '美团', '网易', '微软', '小米', '滴滴', '拼多多', '哔哩',
  '招商银行', '平安', '中科', '中科院', '北大', '清华',
];
const HIGH_SALARY_WAN = 25; // 高薪阈值(万/月,取薪资上限)。前端岗薪资上限≥此值才入库

// 排除规则(用户 2026-08-07 定):985/硕士硬要求、硬件相关岗位、明显非软件垃圾岗一律不入库。
const EDU_EXCLUDE_RE = /硕士|985|双一流/;
const HARDWARE_EXCLUDE_RE =
  /硬件|嵌入式|固件|驱动|内核|RTOS|芯片|FPGA|半导体|自动化设备|非标自动化|电气|机电|机器人|无人机|光伏|储能|电池|整车|模具|机加工|金属制品|仪器仪表/;
const JUNK_EXCLUDE_RE =
  /销售|司机|催收|会计|普工|美导|美业|机修|汽修|压单|美容|足疗|客服|内勤|铲车|梭织|面料|染整|配方|护肤|蓝莓|种植|化工研发|质量技术|典当|玩具|机械设计|研发Leader|产品技术负责人|医疗技术领军|绿电|电气设计|尾矿|门窗|型材|压缩机/;
const EXP_OK_RE = /5-10年|10年以上|10年\+|5年以上|8年以上/;

/** 命中排除规则(985/硕士/硬件相关/非软件垃圾岗) → 不入库 */
function isExcluded(job) {
  const eduText = [job.title, job.education, (job.skills || []).join('/'), job.companyTag]
    .filter(Boolean)
    .join(' ');
  if (EDU_EXCLUDE_RE.test(eduText)) return true;
  const title = job.title || '';
  if (HARDWARE_EXCLUDE_RE.test(title) || JUNK_EXCLUDE_RE.test(title)) return true;
  return false;
}

/** 解析薪资上限(万/月):"15-30k·14薪"→30, "1-1.5万"→15, "30-35k"→35 */
function parseSalaryMaxWan(s) {
  const str = (s || '').replace(/,/g, '');
  // "1-1.5万" → 上限 1.5*10=15
  const mWan = str.match(/([\d.]+)\s*[-~·]\s*([\d.]+)\s*万/);
  if (mWan) return Math.round(parseFloat(mWan[2]) * 10);
  // "15-30k" / "15-30K"
  const mK = str.match(/([\d.]+)\s*[-~·]\s*([\d.]+)\s*k?/i);
  if (mK) return Math.round(parseFloat(mK[2]));
  const m1 = str.match(/([\d.]+)\s*万/);
  if (m1) return Math.round(parseFloat(m1[1]) * 10);
  const m2 = str.match(/([\d.]+)\s*k?/i);
  return m2 ? Math.round(parseFloat(m2[1])) : 0;
}

/** 解析薪资下限(万/月):"18-25k"→18, "1.8-2.5万"→18, "25-30k·14薪"→25 */
function parseSalaryMinWan(s) {
  const str = (s || '').replace(/,/g, '');
  const mWan = str.match(/([\d.]+)\s*[-~·]\s*([\d.]+)\s*万/);
  if (mWan) return Math.round(parseFloat(mWan[1]) * 10);
  const mK = str.match(/([\d.]+)\s*[-~·]\s*([\d.]+)\s*k?/i);
  if (mK) return Math.round(parseFloat(mK[1]));
  const m1 = str.match(/([\d.]+)\s*万/);
  if (m1) return Math.round(parseFloat(m1[1]) * 10);
  const m2 = str.match(/([\d.]+)\s*k?/i);
  return m2 ? Math.round(parseFloat(m2[1])) : 0;
}

/** 入库筛选:① 城市相关性(只入青岛/济南,挡异地推荐) ② 前端需大厂或高薪 */
function shouldKeep(job) {
  // 城市相关性:area 必须含目标城市(青岛/济南),挡猎聘/51job 异地推荐岗
  if (!/青岛|济南/.test(job.area || '')) return false;
  // 排除规则:985/硕士/硬件相关/非软件垃圾岗
  if (isExcluded(job)) return false;
  // 薪资:起薪不得低于 18K(用户 2026-08-07 定)
  if (parseSalaryMinWan(job.salary) < 18) return false;
  // 经验:≥5 年(5-10 年 / 10 年以上 / 5 年以上 / 8 年以上);经验字段缺失时不拦
  const exp = job.experience || '';
  if (exp && !EXP_OK_RE.test(exp)) return false;
  const title = job.title || '';
  const isFrontend = /前端|front[-_ ]?end|web开发/i.test(title) && !/全栈|后端|架构师|主管|总监|经理/.test(title);
  if (!isFrontend) return true;
  const isBig = BIG_COMPANY.some((c) => (job.company || '').includes(c));
  const salMax = parseSalaryMaxWan(job.salary);
  return isBig || salMax >= HIGH_SALARY_WAN;
}

export const definition = {
  name: 'export_to_md',
  description:
    '把最近一次 search_jobs 抓取的岗位写回 docs/岗位列表.md 的对应平台分区。前端岗仅知名大厂+高薪入库。自动去重,只改该平台段。',
  inputSchema: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        enum: ['前端', '后端', '全栈', 'AI'],
        description: '写回哪个子分区(默认用最近一次 search 的方向)',
      },
      markNew: { type: 'boolean', description: '新增行加 🆕 标记', default: true },
      jobIds: {
        type: 'array',
        items: { type: 'string' },
        description: '可选:只导出指定 jobId',
      },
    },
  },
};

export async function run(args) {
  const { direction, markNew = true, jobIds } = args;
  try {
    const last = await readJson('last-search.json', null);
    if (!last || !last.jobs || !last.jobs.length) {
      return { ok: false, error: '没有可导出的数据,请先调用 search_jobs', code: 'NO_DATA' };
    }
    let jobs = last.jobs;
    if (jobIds && jobIds.length) {
      jobs = jobs.filter((j) => jobIds.includes(j.jobId));
    }
    // 前端入库筛选
    const before = jobs.length;
    jobs = jobs.filter(shouldKeep);
    const filteredFrontend = before - jobs.length;
    if (!jobs.length) {
      return { ok: true, written: 0, filteredFrontend, note: '全部被前端入库筛选过滤(非大厂+非高薪)' };
    }
    const platform = last.platform || 'boss';
    const dir = direction || last.direction || '前端';
    const result = await appendJobs({ jobs, direction: dir, platform, markNew });
    await audit({ tool: 'export_to_md', platform, result: 'ok', ...result, filteredFrontend });
    return { ok: true, ...result, platform, filteredFrontend, target: process.env.TARGET_MD };
  } catch (e) {
    await audit({ tool: 'export_to_md', result: 'error', error: e.message });
    return { ok: false, error: e.message, code: e.code };
  }
}
