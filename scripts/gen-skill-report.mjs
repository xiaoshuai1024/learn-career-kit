#!/usr/bin/env node
/**
 * 能力评估报告生成器
 * 读取 docs/能力评估数据.json（单一真相源），生成：
 *   1. docs/个人能力评分表.md     —— 人类可读评分表（重算小计/总分/岗位匹配）
 *   2. docs/能力评估报告.html      —— ECharts 可视化（雷达图 + 趋势折线 + 技能进度条 + 历史记录）
 *   3. docs/能力评估趋势.csv       —— 时间序列，给 Excel/Numbers 看进步趋势
 *
 * 用法： node scripts/gen-skill-report.mjs
 * 数据文件里 snapshots 数组每追加一条，重跑本脚本即可刷新全部产物。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'docs', '能力评估数据.json');
const MD_FILE = path.join(ROOT, 'docs', '个人能力评分表.md');
const HTML_FILE = path.join(ROOT, 'docs', '能力评估报告.html');
const CSV_FILE = path.join(ROOT, 'docs', '能力评估趋势.csv');

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const MAX = data.meta.max;
const PASS = data.meta.thresholds.pass;
const COMPETE = data.meta.thresholds.compete;

const SOURCE_LABEL = { init: '初始化', 'skill-test': '/skill-test', study: '/study', manual: '手动' };

// ---------- 计算 ----------
/** 截止第 upTo（含）个 snapshot 的全量当前评分 map: key -> {score,date,note} */
function currentAt(upTo) {
  const cur = {};
  for (let i = 0; i <= upTo; i++) {
    const snap = data.snapshots[i];
    for (const [key, val] of Object.entries(snap.scores || {})) {
      const score = typeof val === 'number' ? val : val.score;
      const prev = cur[key];
      cur[key] = {
        score,
        date: snap.date,
        note: (typeof val === 'object' && val.note !== undefined) ? val.note : (prev ? prev.note : '待评估'),
      };
    }
  }
  return cur;
}
const current = currentAt(data.snapshots.length - 1);

function dimStats(cur) {
  return data.dimensions.map((d) => {
    const skills = d.groups.flatMap((g) => g.skills.map((s) => {
      const k = `${d.id}.${s.id}`;
      const v = cur[k] || { score: 0, date: '—', note: '待评估' };
      return { key: k, name: s.name, groupName: g.name, ...v };
    }));
    const score = skills.reduce((a, s) => a + s.score, 0);
    const full = skills.length * MAX;
    return { id: d.id, name: d.name, skills, score, full, pct: full ? score / full : 0 };
  });
}
const stats = dimStats(current);
const totalScore = stats.reduce((a, d) => a + d.score, 0);
const totalFull = stats.reduce((a, d) => a + d.full, 0);
const totalPct = totalFull ? totalScore / totalFull : 0;

/** 每个时间点的总分 + 各维度得分（百分比），用于趋势折线 */
function trendSeries() {
  return data.snapshots.map((snap, i) => {
    const cur = currentAt(i);
    const ds = dimStats(cur);
    const row = { date: snap.date, 总分: ds.reduce((a, d) => a + d.score, 0) };
    const totalF = ds.reduce((a, d) => a + d.full, 0);
    row['总分%'] = +(totalF ? (row.总分 / totalF) * 100 : 0).toFixed(1);
    for (const d of ds) row[`${d.name}%`] = +(d.pct * 100).toFixed(1);
    return row;
  });
}
const trend = trendSeries();

/** 岗位匹配度 */
function jobMatch() {
  return data.jobs.map((job) => {
    const checks = Object.entries(job.req).map(([dimId, pct]) => {
      const d = stats.find((x) => x.id === dimId);
      const line = Math.round(d.full * pct);
      const ok = d.score >= line;
      return { dim: d.name, line, score: d.score, ok, gap: line - d.score };
    });
    const allOk = checks.every((c) => c.ok);
    const worst = checks.filter((c) => !c.ok).sort((a, b) => b.gap - a.gap)[0];
    return {
      name: job.name,
      checks,
      status: allOk ? '✅ 达标' : '❌ 未达标',
      detail: allOk ? '所有维度达标' : (worst ? `${worst.dim} 差 ${worst.gap} 分` : ''),
    };
  });
}
const jobs = jobMatch();

// ---------- 生成 Markdown ----------
function genMarkdown() {
  const L = [];
  L.push('# 个人能力评分表');
  L.push('');
  L.push('> 基于青岛/济南研发岗位能力图谱，覆盖前端/后端/AI工程化/全栈架构/Python/管理 六大方向（管理维度支撑技术总监岗）。');
  L.push('> 评分标准（百分制）：0=待评估 | 20=不了解 | 40=了解概念 | 60=能使用 | 80=熟练掌握 | 100=精通/能教别人');
  L.push('> **数据源**：`docs/能力评估数据.json`（每次评估追加 snapshot）。本表由 `scripts/gen-skill-report.mjs` 自动生成，请勿手改。');
  L.push(`> 用户偏好：${data.meta.direction}`);
  L.push('');
  L.push('---');
  L.push('');

  const cnNum = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  stats.forEach((d, di) => {
    L.push(`## ${cnNum[di]}、${d.name}`);
    L.push('');
    // 按 group 分块
    const byGroup = {};
    d.skills.forEach((s) => { (byGroup[s.groupName] ||= []).push(s); });
    for (const [gname, skills] of Object.entries(byGroup)) {
      L.push(`### ${gname}`);
      L.push('');
      L.push('| 技能 | 评分 | 更新日期 | 备注 |');
      L.push('|------|:----:|----------|------|');
      for (const s of skills) {
        L.push(`| ${s.name} | ${s.score} | ${s.date} | ${s.note} |`);
      }
      L.push('');
    }
    L.push(`**${d.name}小计：** ${d.score}/${d.full}（${d.skills.length}项 × ${MAX}分，${(d.pct * 100).toFixed(0)}%）`);
    L.push('');
    L.push('---');
    L.push('');
  });

  // 总分汇总
  L.push('## 总分汇总');
  L.push('');
  L.push('| 方向 | 得分 | 满分 | 占比 | 达标线(60%) | 竞争线(80%) |');
  L.push('|------|:----:|:----:|:----:|:-----------:|:-----------:|');
  for (const d of stats) {
    L.push(`| ${d.name} | ${d.score} | ${d.full} | ${(d.pct * 100).toFixed(0)}% | ${Math.round(d.full * PASS)} | ${Math.round(d.full * COMPETE)} |`);
  }
  const passTotal = Math.round(totalFull * PASS);
  const compTotal = Math.round(totalFull * COMPETE);
  const totalStatus = totalPct >= COMPETE ? '🏆 已过竞争线' : totalPct >= PASS ? '✅ 已达标' : '⏳ 未达标';
  L.push(`| **总计** | **${totalScore}** | **${totalFull}** | **${(totalPct * 100).toFixed(0)}%** | ${passTotal} | ${compTotal} |`);
  L.push('');
  L.push(`> 总体状态：**${totalStatus}**（达标 ${PASS * 100}% / 竞争 ${COMPETE * 100}%）`);
  L.push('');

  // 岗位匹配
  L.push('### 岗位匹配度评估');
  L.push('');
  L.push('> 各岗位要求按维度满分百分比存储，满分变化时自动重算（见 `能力评估数据.json` 的 jobs）。');
  L.push('');
  L.push('| 目标岗位 | 维度要求 | 当前状态 |');
  L.push('|----------|----------|----------|');
  for (const j of jobs) {
    const req = j.checks.map((c) => `${c.dim}≥${c.line}`).join(' + ');
    L.push(`| ${j.name} | ${req} | ${j.status}（${j.detail}） |`);
  }
  L.push('');
  L.push('---');
  L.push('');

  // 更新日志（来自 snapshots）
  L.push('## 评估历史（每次评估自动追加）');
  L.push('');
  L.push('| 日期 | 来源 | 范围 | 内容 | 涉及技能数 |');
  L.push('|------|------|------|------|:----------:|');
  for (const snap of data.snapshots) {
    const n = Object.keys(snap.scores || {}).length;
    L.push(`| ${snap.date} | ${SOURCE_LABEL[snap.source] || snap.source} | ${snap.scope} | ${snap.note} | ${n} |`);
  }
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 可视化');
  L.push('');
  L.push('- **HTML 报告（雷达图 + 趋势折线 + 技能进度条）**：`docs/能力评估报告.html`（浏览器打开）');
  L.push('- **趋势 CSV（Excel 看进步）**：`docs/能力评估趋势.csv`');
  L.push('');

  return L.join('\n');
}

// ---------- 生成 CSV ----------
function genCSV() {
  const dimCols = data.dimensions.map((d) => `${d.name}%`);
  const header = ['日期', '总分', '总分%', ...dimCols];
  const rows = trend.map((r) => [r.date, r.总分, r['总分%'], ...data.dimensions.map((d) => r[`${d.name}%`])]);
  return [header, ...rows].map((row) => row.join(',')).join('\n');
}

// ---------- 生成 HTML ----------
function genHTML() {
  const radarData = stats.map((d) => +(d.pct * 100).toFixed(1));
  const radarIndicator = stats.map((d) => ({ name: d.name.replace(/能力（.*$/, '').replace('能力', '').replace('/架构', ''), max: 100 }));

  // 趋势折线
  const dates = trend.map((t) => t.date);
  const seriesNames = ['总分', ...stats.map((d) => d.name)];
  const trendSeriesData = seriesNames.map((nm) => {
    const key = nm === '总分' ? '总分%' : `${nm}%`;
    return { name: nm, type: 'line', smooth: true, data: trend.map((t) => t[key]), markLine: nm === '总分' ? { silent: true, data: [{ yAxis: 60, lineStyle: { color: '#f59e0b' }, label: { formatter: '达标60' } }, { yAxis: 80, lineStyle: { color: '#10b981' }, label: { formatter: '竞争80' } }] } : {} };
  });

  // 技能进度条数据
  const skillBars = stats.map((d) => ({
    name: d.name,
    items: d.skills.map((s) => ({ name: s.name.replace(/（.*$/, ''), score: s.score, note: s.note, date: s.date })),
  }));

  // 历史记录
  const history = data.snapshots.map((s) => ({ date: s.date, source: SOURCE_LABEL[s.source] || s.source, scope: s.scope, note: s.note, count: Object.keys(s.scores || {}).length }));

  const payload = JSON.stringify({ meta: data.meta, stats, totalScore, totalFull, totalPct, radarData, radarIndicator, dates, trendSeriesData, skillBars, history, jobs });

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>能力评估报告 — ${data.meta.owner}</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
<style>
  :root { --bg:#0f172a; --card:#1e293b; --txt:#e2e8f0; --muted:#94a3b8; --accent:#38bdf8; --ok:#10b981; --warn:#f59e0b; --bad:#ef4444; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--txt); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap { max-width:1100px; margin:0 auto; padding:24px 16px 64px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:20px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:24px; }
  .card { background:var(--card); border-radius:12px; padding:16px; }
  .card .k { color:var(--muted); font-size:12px; }
  .card .v { font-size:24px; font-weight:700; margin-top:4px; }
  .card .v small { font-size:13px; color:var(--muted); font-weight:400; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:820px){ .grid2{ grid-template-columns:1fr; } }
  .panel { background:var(--card); border-radius:12px; padding:16px; margin-bottom:16px; }
  .panel h2 { font-size:15px; margin:0 0 12px; color:var(--accent); }
  .chart { width:100%; height:340px; }
  .dim-block { margin-bottom:18px; }
  .dim-block > h3 { font-size:14px; margin:0 0 10px; display:flex; justify-content:space-between; }
  .bar-row { display:grid; grid-template-columns:230px 1fr 90px; gap:8px; align-items:center; margin:5px 0; font-size:12px; }
  .bar-row .lbl { color:var(--txt); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bar { background:#334155; border-radius:6px; height:14px; position:relative; }
  .bar > i { display:block; height:100%; border-radius:6px; }
  .bar-row .val { text-align:right; color:var(--muted); font-variant-numeric:tabular-nums; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid #334155; }
  th { color:var(--muted); font-weight:600; }
  .tag { padding:2px 8px; border-radius:6px; font-size:12px; }
  .tag.ok { background:rgba(16,185,129,.15); color:var(--ok); }
  .tag.bad { background:rgba(239,68,68,.15); color:var(--bad); }
  .tag.warn { background:rgba(245,158,11,.15); color:var(--warn); }
  .foot { color:var(--muted); font-size:12px; margin-top:24px; text-align:center; }
  #loading { color:var(--muted); text-align:center; padding:40px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>能力评估报告</h1>
  <div class="sub">${data.meta.owner} · 方向：${data.meta.direction} · 更新：${data.meta.updated} · 图表库走 CDN（首次加载需联网）</div>
  <div id="loading">加载中…如果一直停留说明 CDN 被墙，请挂代理或改用 markdown/csv 版本。</div>
  <div id="app" style="display:none"></div>
</div>
<script>
const P = ${payload};
function scoreColor(v){ return v>=80?'#10b981':v>=60?'#eab308':v>=40?'#f59e0b':v<=20?'#ef4444':'#64748b'; }
function totalTag(p){ return p>=.8?'<span class="tag ok">🏆 过竞争线</span>':p>=.6?'<span class="tag warn">✅ 达标</span>':'<span class="tag bad">⏳ 未达标</span>'; }
const app = document.getElementById('app');
app.innerHTML = \`
  <div class="cards">
    <div class="card"><div class="k">总分</div><div class="v">\${P.totalScore}<small>/\${P.totalFull}</small></div></div>
    <div class="card"><div class="k">总占比</div><div class="v">\${(P.totalPct*100).toFixed(0)}%</div><div style="margin-top:6px">\${totalTag(P.totalPct)}</div></div>
    \${P.stats.map(d=>'<div class="card"><div class="k">'+d.name+'</div><div class="v">'+d.score+'<small>/'+d.full+'</small></div><div style="font-size:12px;color:var(--muted);margin-top:4px">'+(d.pct*100).toFixed(0)+'%</div></div>').join('')}
  </div>
  <div class="grid2">
    <div class="panel"><h2>能力雷达（各维度占比%）</h2><div id="radar" class="chart"></div></div>
    <div class="panel"><h2>进步趋势（%）</h2><div id="trend" class="chart"></div></div>
  </div>
  <div class="panel"><h2>技能明细（0-100）</h2>\${P.skillBars.map(db=>'<div class="dim-block"><h3>'+db.name+'</h3>'+db.items.map(s=>'<div class="bar-row"><span class="lbl" title="'+s.note+'">'+s.name+'</span><span class="bar"><i style="width:'+(s.score)+'%;background:'+scoreColor(s.score)+'"></i></span><span class="val">'+s.score+'/100</span></div>').join('')+'</div>').join('')}</div>
  <div class="grid2">
    <div class="panel"><h2>岗位匹配度</h2><table><tr><th>岗位</th><th>状态</th></tr>\${P.jobs.map(j=>'<tr><td>'+j.name+'</td><td>'+ (j.status.includes('达标')&&!j.status.includes('未')?'<span class="tag ok">':'<span class="tag bad">') + j.status + '</span> <span style="color:var(--muted);font-size:12px">'+j.detail+'</span></td></tr>').join('')}</table></div>
    <div class="panel"><h2>评估历史</h2><table><tr><th>日期</th><th>来源</th><th>范围</th><th>技能数</th></tr>\${P.history.map(h=>'<tr><td>'+h.date+'</td><td>'+h.source+'</td><td>'+h.scope+'</td><td>'+h.count+'</td></tr>').join('')}</table></div>
  </div>
  <div class="foot">数据源 docs/能力评估数据.json · 由 scripts/gen-skill-report.mjs 生成 · 每次评估后重跑刷新</div>
\`;
document.getElementById('loading').style.display='none';
app.style.display='block';

const radar = echarts.init(document.getElementById('radar'));
radar.setOption({
  tooltip:{},
  radar:{ indicator:P.radarIndicator, radius:'65%',
    axisName:{color:'#cbd5e1',fontSize:12},
    splitArea:{areaStyle:{color:['rgba(255,255,255,.02)','rgba(255,255,255,.05)']}},
    splitLine:{lineStyle:{color:'#334155'}}, axisLine:{lineStyle:{color:'#334155'}} },
  series:[{ type:'radar', data:[{ value:P.radarData, name:'当前',
    areaStyle:{color:'rgba(56,189,248,.25)'}, lineStyle:{color:'#38bdf8'}, itemStyle:{color:'#38bdf8'} },
    { value:P.radarIndicator.map(()=>60), name:'达标60%', lineStyle:{color:'#f59e0b',type:'dashed'}, itemStyle:{color:'#f59e0b'}, areaStyle:{color:'rgba(245,158,11,.05)'} },
    { value:P.radarIndicator.map(()=>80), name:'竞争80%', lineStyle:{color:'#10b981',type:'dashed'}, itemStyle:{color:'#10b981'} }],
    symbolSize:5 }],
  legend:{ data:['当前','达标60%','竞争80%'], bottom:0, textStyle:{color:'#94a3b8'} }
});

const tr = echarts.init(document.getElementById('trend'));
tr.setOption({
  tooltip:{trigger:'axis'},
  legend:{ data:P.trendSeriesData.map(s=>s.name), bottom:0, textStyle:{color:'#94a3b8'}, type:'scroll' },
  grid:{ left:40, right:20, top:20, bottom:50 },
  xAxis:{ type:'category', data:P.dates, axisLabel:{color:'#94a3b8'} },
  yAxis:{ type:'value', max:100, axisLabel:{color:'#94a3b8',formatter:'{value}%'}, splitLine:{lineStyle:{color:'#334155'}} },
  series:P.trendSeriesData.map(s=>({ ...s, lineStyle:{width:2}, itemStyle:{}, emphasis:{focus:'series'} })),
  color:['#38bdf8','#f472b6','#a78bfa','#fbbf24','#34d399','#60a5fa']
});
window.addEventListener('resize',()=>{ radar.resize(); tr.resize(); });
</script>
</body>
</html>`;
}

// ---------- 写出 ----------
fs.writeFileSync(MD_FILE, genMarkdown(), 'utf8');
fs.writeFileSync(HTML_FILE, genHTML(), 'utf8');
fs.writeFileSync(CSV_FILE, '﻿' + genCSV(), 'utf8'); // BOM 便于 Excel 识别中文

const changedSkills = Object.keys(current).filter((k) => current[k].score > 0).length;
console.log('✅ 能力评估报告已生成');
console.log(`   技能总数：${stats.reduce((a, d) => a + d.skills.length, 0)} 项（满分 ${totalFull}）`);
console.log(`   当前总分：${totalScore}/${totalFull}（${(totalPct * 100).toFixed(0)}%）`);
console.log(`   已评估：${changedSkills} 项`);
console.log(`   评估次数（快照）：${data.snapshots.length} 次`);
console.log('   产物：');
console.log(`     • ${path.relative(ROOT, MD_FILE)}`);
console.log(`     • ${path.relative(ROOT, HTML_FILE)}（浏览器打开看图表）`);
console.log(`     • ${path.relative(ROOT, CSV_FILE)}（Excel 看趋势）`);
