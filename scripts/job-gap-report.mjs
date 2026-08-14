#!/usr/bin/env node
/**
 * 岗位能力差距报告生成器
 * 读取 docs/能力评估数据.json（当前能力）+ 本文件顶部 JOB_WEIGHTS（岗位要求权重）
 * 算出 4 个岗位在各维度上的差距，输出到终端。
 *
 * 用法： node scripts/job-gap-report.mjs
 *
 * 配套文档： docs/岗位能力模型对比.md
 * 升分流程： /skill-test 或 /study 后，重跑本脚本即可刷新差距矩阵。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'docs', '能力评估数据.json');

// ---------- 岗位权重（基于 docs/后端高级架构师能力图谱.md + docs/青岛AI就业市场调研.md） ----------
// 每个岗位给出 6 个维度的"要求占比"。0 = 不要求（不计入该维度有效满分）。
// 修改这里即可调整岗位要求。权重依据见 docs/岗位能力模型对比.md 第二节。
const JOB_WEIGHTS = {
  '技术总监（30-60K+）': {
    frontend: 0.20,
    backend: 0.66,
    ai: 0.65,
    architecture: 0.80,
    python: 0.50,
    management: 0.85,
  },
  '后端架构师（40K+）': {
    frontend: 0.15,
    backend: 0.85,
    ai: 0.59,
    architecture: 0.85,
    python: 0.50,
    management: 0.54,
  },
  'AI 应用开发（15-30K）': {
    frontend: 0.26,
    backend: 0.59,
    ai: 0.81,
    architecture: 0.56,
    python: 0.78,
    management: 0.0,
  },
  '全栈开发（15-25K）': {
    frontend: 0.68,
    backend: 0.68,
    ai: 0.15,
    architecture: 0.62,
    python: 0.50,
    management: 0.0,
  },
};

const DIM_LABEL = {
  frontend: '前端',
  backend: '后端',
  ai: 'AI 工程化',
  architecture: '架构',
  python: 'Python',
  management: '管理',
};

// ---------- 读取并算当前分 ----------
const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

const cur = {};
for (const snap of data.snapshots) {
  for (const [k, v] of Object.entries(snap.scores || {})) {
    cur[k] = typeof v === 'number' ? v : v.score;
  }
}

const dimStats = data.dimensions.map((d) => {
  const skills = d.groups.flatMap((g) => g.skills);
  const score = skills.reduce((a, s) => a + (cur[`${d.id}.${s.id}`] || 0), 0);
  const evaluated = skills.filter((s) => (cur[`${d.id}.${s.id}`] || 0) > 0).length;
  const full = skills.length * 100;
  return {
    id: d.id,
    name: d.name,
    n: skills.length,
    score,
    full,
    pct: full ? (score / full) * 100 : 0,
    evaluated,
  };
});

// ---------- 算差距 ----------
function gapStatus(gapPct) {
  if (gapPct >= 60) return '📉📉📉 灾难';
  if (gapPct >= 30) return '📉📉 严重';
  if (gapPct >= 15) return '📉 中等';
  if (gapPct >= 0) return '✅ 接近';
  return '✅ 超出';
}

const jobs = Object.entries(JOB_WEIGHTS).map(([jobName, weights]) => {
  const checks = dimStats.map((d) => {
    const w = weights[d.id] ?? 0;
    const reqLine = Math.round(d.full * w);
    const gap = reqLine - d.score;
    const gapPct = d.full ? (gap / d.full) * 100 : 0;
    return {
      dim: d.id,
      dimLabel: DIM_LABEL[d.id],
      reqPct: w * 100,
      reqLine,
      curScore: d.score,
      curPct: d.pct,
      gap,
      gapPct,
      status: gapStatus(gapPct),
    };
  });
  const totalGap = checks.reduce((a, c) => a + Math.max(0, c.gap), 0);
  const hardGaps = checks.filter((c) => c.gapPct >= 30).map((c) => c.dimLabel);
  return { jobName, checks, totalGap, hardGaps };
});

// ---------- 输出 ----------
const lines = [];
const p = (s = '') => lines.push(s);

p('# 岗位能力差距报告（脚本输出）');
p('');
p(`> 数据快照：${data.snapshots[data.snapshots.length - 1].date}（最新 snapshot）`);
p(`> 当前总分：${dimStats.reduce((a, d) => a + d.score, 0)} / ${dimStats.reduce((a, d) => a + d.full, 0)}`);
p('');

// 1. 当前分速览
p('## 1. 当前能力快照');
p('');
p('| 维度 | 满分 | 当前分 | 占比 | 已评估 / 总数 |');
p('|------|:----:|:----:|:----:|:----------:|');
for (const d of dimStats) {
  p(`| ${DIM_LABEL[d.id]} | ${d.full} | ${d.score} | ${d.pct.toFixed(1)}% | ${d.evaluated} / ${d.n} |`);
}
p('');

// 2. 差距矩阵
p('## 2. 差距矩阵（差距 = 岗位要求分 − 当前分）');
p('');
p('| 维度 | 当前分 |' + Object.keys(JOB_WEIGHTS).map((j) => ` ${j.split('（')[0]}差 `).join('|') + '|');
p('|------|:----:|' + Object.keys(JOB_WEIGHTS).map(() => ':----:').join('|') + '|');
for (const d of dimStats) {
  let row = `| ${DIM_LABEL[d.id]} | ${d.score} |`;
  for (const job of jobs) {
    const c = job.checks.find((x) => x.dim === d.id);
    const sign = c.gap > 0 ? '+' : '';
    const mark = c.gapPct >= 30 ? '📉 ' : c.gapPct >= 0 ? '' : '✅ ';
    row += ` ${mark}${sign}${c.gap} |`;
  }
  p(row + '|');
}
p('');

// 3. 逐岗位分析
p('## 3. 逐岗位硬缺口（差距 ≥ 30% 的维度）');
p('');
for (const job of jobs) {
  p(`### ${job.jobName}`);
  p('');
  p('- 总缺口：' + job.totalGap + ' 分');
  p('- 硬缺口维度：' + (job.hardGaps.length ? job.hardGaps.join(' / ') : '✅ 无硬缺口'));
  p('');
  p('| 维度 | 要求分 | 当前分 | 差距 | 差距% | 状态 |');
  p('|------|:----:|:----:|:----:|:----:|:----:|');
  for (const c of job.checks) {
    const sign = c.gap > 0 ? '+' : '';
    p(`| ${c.dimLabel} | ${c.reqLine} | ${c.curScore} | ${sign}${c.gap} | ${c.gapPct.toFixed(0)}% | ${c.status} |`);
  }
  p('');
}

// 4. 综合排名
p('## 4. 综合可达性排名（按总缺口升序）');
p('');
const sorted = [...jobs].sort((a, b) => a.totalGap - b.totalGap);
sorted.forEach((job, i) => {
  const medal = ['🥇', '🥈', '🥉', '4️⃣'][i];
  p(`${medal} **${job.jobName}**：总缺口 ${job.totalGap} 分，硬缺口 ${job.hardGaps.length} 个（${job.hardGaps.join('/') || '无'}）`);
});
p('');

// 输出
const out = lines.join('\n');
console.log(out);

// 同时写一份到 docs/.job-gap-report.txt（不污染 git，方便对照）
fs.writeFileSync(path.join(ROOT, 'docs', '.job-gap-report.txt'), out, 'utf8');
console.log('\n---\n✅ 报告已生成，文本版本写入 docs/.job-gap-report.txt（git 忽略）');
console.log('   主文档 docs/岗位能力模型对比.md 的数字应与本输出一致；如不一致以本脚本输出为准（snapshot 可能已更新）。');
