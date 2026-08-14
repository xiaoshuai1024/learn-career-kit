// 岗位能力差距图生成器：读 docs/能力评估数据.json，生成 docs/岗位能力差距图.html
// 对比「岗位要求 vs 当前能力」，覆盖 技术总监 / 架构师 / 全栈AI研发 三个目标岗位。
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('docs/能力评估数据.json', 'utf8'));

// —— 1. 从 snapshots 计算各维度当前达成度（维度得分和 ÷ 维度满分，未评估按 0 计入，与 gen-skill-report 同口径）——
const scores = {};
data.snapshots.forEach(s => Object.entries(s.scores || {}).forEach(([k, v]) => { scores[k] = v.score; }));
const current = {};
data.dimensions.forEach(d => {
  let total = 0, count = 0, all = 0;
  (d.groups || [{ skills: d.skills }]).forEach(g => g.skills.forEach(s => {
    all++;
    const sc = scores[d.id + '.' + s.id];
    if (sc !== undefined) { total += sc; count++; }
  }));
  current[d.id] = { pct: all ? Math.round(total / (all * 100) * 100) : 0, evaluated: count, all };
});

const shortName = { frontend: '前端', backend: '后端', ai: 'AI工程化', architecture: '全栈架构', python: 'Python', management: '管理' };
const dimOrder = ['frontend', 'backend', 'ai', 'architecture', 'python', 'management'];
const indicators = dimOrder.map(id => ({ name: shortName[id], max: 100 }));

// —— 2. 锁定三个目标岗位 ——
const targets = [
  { label: '技术总监', job: data.jobs.find(j => j.name.includes('技术总监')) },
  { label: '架构师', job: data.jobs.find(j => j.name.includes('架构师')) },
  { label: '全栈AI研发', job: data.jobs.find(j => /AI\s*全栈/.test(j.name)) },
].filter(t => t.job);

// —— 3. 每个岗位算差距明细 + 匹配度 + 建议 ——
const statusMap = {
  pass: ['✅ 达标', '#52c41a'],
  close: ['⚠️ 接近', '#faad14'],
  gap: ['❌ 差距', '#f5222d'],
  unmeasured: ['⏳ 待测评', '#8c8c8c'],
  na: ['— 非核心', '#d9d9d9'],
};

function advise(r) {
  const gaps = r.rows.filter(x => x.status === 'gap').map(x => x.name);
  const unmeasured = r.rows.filter(x => x.status === 'unmeasured').map(x => x.name);
  const passed = r.rows.filter(x => x.status === 'pass').map(x => x.name);
  const parts = [];
  if (passed.length) parts.push('已达标：' + passed.join('、'));
  if (r.rows.some(x => x.status === 'close')) parts.push('接近达标，再补一点即可');
  if (gaps.length) parts.push('需补强：' + gaps.join('、'));
  if (unmeasured.length) parts.push('⚠️ 未测评（有实战但未量化）：' + unmeasured.join('、') + '——补测后差距才准确');
  // 岗位总评：百分比从 r.rows 动态读取，方向性洞察保留（历史短板为事实，不随口径变）
  if (r.label === '技术总监') {
    const m = r.rows.find(x => x.name === '管理');
    parts.push(`管理基本盘 ${m && m.evaluated ? m.cur + '%/要求' + m.req + '%' : '待补测'}，稳住盘；优先补测后端 + 补强历史短板（研发效能/组织设计/危机处理）`);
  }
  if (r.label === '架构师') {
    const be = r.rows.find(x => x.name === '后端');
    parts.push(`架构师要求 80% 高线${be && !be.evaluated ? '、后端核心维度尚未测评' : ''}，差距大属长期目标，建议分阶段补强`);
  }
  if (r.label === '全栈AI研发') {
    const ai = r.rows.find(x => x.name === 'AI工程化');
    parts.push(`AI 维度 ${ai && ai.evaluated ? ai.cur + '%/要求' + ai.req + '%（差' + ai.gap + '%）' : '待补测'}，补到要求线即显著提分，近期最易冲的岗位`);
  }
  return parts.join('；') + '。';
}

const report = targets.map(t => {
  const req = t.job.req;
  const rows = dimOrder.map(id => {
    const reqPct = req[id] !== undefined ? Math.round(req[id] * 100) : null;
    const c = current[id];
    const evaluated = c.evaluated > 0;
    let status, gap;
    if (req[id] === undefined) { status = 'na'; gap = null; }
    else if (!evaluated) { status = 'unmeasured'; gap = reqPct; }
    else { gap = reqPct - c.pct; status = gap <= 0 ? 'pass' : (gap <= 10 ? 'close' : 'gap'); }
    return { name: shortName[id], req: reqPct, cur: c.pct, evaluated, gap, status };
  });
  const evalReq = rows.filter(r => req[dimOrder[rows.indexOf(r)]] !== undefined && r.evaluated);
  const evalReqRows = rows.filter(r => r.req !== null && r.evaluated);
  const match = evalReqRows.length ? Math.round(evalReqRows.reduce((a, r) => a + Math.min(1, r.cur / (r.req || 1)), 0) / evalReqRows.length * 100) : 0;
  return { ...t, rows, match, evalCount: evalReqRows.length, reqCount: Object.keys(req).length, advise: advise({ label: t.label, rows }) };
});

// —— 4. 生成卡片 HTML（差距表 node 端拼好，前端只渲染 ECharts）——
function rowHTML(r) {
  const [label, color] = statusMap[r.status];
  const reqCell = r.req !== null ? r.req + '%' : '—';
  const curCell = r.evaluated ? r.cur + '%' : '<span class="muted">未测评</span>';
  let gapCell;
  if (r.status === 'na') gapCell = '—';
  else if (r.status === 'unmeasured') gapCell = '<span class="muted">需测评</span>';
  else if (r.gap <= 0) gapCell = '<span style="color:#52c41a">已达标</span>';
  else gapCell = '<span style="color:#f5222d">+' + r.gap + '%</span>';
  return '<tr><td>' + r.name + '</td><td>' + reqCell + '</td><td>' + curCell + '</td><td>' + gapCell + '</td><td style="color:' + color + '">' + label + '</td></tr>';
}

const cards = report.map((r, i) => {
  const matchColor = r.match >= 80 ? '#52c41a' : r.match >= 60 ? '#faad14' : '#f5222d';
  return `
  <section class="card">
    <div class="card-head">
      <div>
        <h2>${r.label}</h2>
        <div class="sub">${r.job.name}</div>
      </div>
      <div class="match" style="background:conic-gradient(${matchColor} ${r.match * 3.6}deg,#eee 0)">
        <div class="match-inner"><span style="color:${matchColor}">${r.match}%</span><small>匹配度</small></div>
      </div>
    </div>
    <div class="sub-note">匹配度基于已测评的 ${r.evalCount}/${r.reqCount} 个核心维度计算（未测评维度不拉低分数，但需补测才完整）</div>
    <div class="card-body">
      <div id="chart-${i}" class="chart"></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>维度</th><th>岗位要求</th><th>当前</th><th>差距</th><th>状态</th></tr></thead>
          <tbody>${r.rows.map(rowHTML).join('')}</tbody>
        </table>
        <div class="advise"><b>📌 建议：</b>${r.advise}</div>
      </div>
    </div>
  </section>`;
}).join('\n');

const payload = {
  indicators,
  jobs: report.map((r, i) => ({
    reqArr: dimOrder.map(id => r.job.req[id] ? Math.round(r.job.req[id] * 100) : 0),
    curArr: dimOrder.map(id => current[id].pct),
  })),
};

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>岗位能力差距图</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #f0f2f5; color: #333; padding: 24px; }
  h1 { font-size: 26px; margin-bottom: 4px; }
  .header { max-width: 1100px; margin: 0 auto 8px; }
  .header .meta { color: #8c8c8c; font-size: 13px; margin-bottom: 6px; }
  .legend { max-width: 1100px; margin: 0 auto 20px; background: #fff; border-radius: 8px; padding: 14px 18px; font-size: 13px; color: #595959; line-height: 1.8; }
  .legend b { color: #1890ff; }
  .legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 4px 0 12px; vertical-align: middle; }
  .card { max-width: 1100px; margin: 0 auto 20px; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .card h2 { font-size: 20px; }
  .card .sub { color: #8c8c8c; font-size: 13px; margin-top: 2px; }
  .match { width: 92px; height: 92px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .match-inner { width: 72px; height: 72px; background: #fff; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .match-inner span { font-size: 22px; font-weight: 700; }
  .match-inner small { font-size: 11px; color: #8c8c8c; }
  .sub-note { color: #8c8c8c; font-size: 12px; margin-bottom: 16px; }
  .card-body { display: flex; gap: 24px; flex-wrap: wrap; }
  .chart { flex: 1; min-width: 340px; height: 360px; }
  .table-wrap { flex: 1; min-width: 320px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 9px 8px; text-align: center; border-bottom: 1px solid #f0f0f0; }
  th { background: #fafafa; color: #595959; font-weight: 600; }
  td:first-child { text-align: left; font-weight: 500; }
  .muted { color: #bfbfbf; }
  .advise { margin-top: 14px; background: #e6f7ff; border-left: 3px solid #1890ff; padding: 10px 12px; border-radius: 0 6px 6px 0; font-size: 13px; line-height: 1.7; color: #0050b3; }
  @media (max-width: 760px) { .card-body { flex-direction: column; } .chart { height: 300px; } }
</style>
</head>
<body>
<div class="header">
  <h1>岗位能力差距图</h1>
  <div class="meta">更新 ${data.meta.updated} · 数据源 docs/能力评估数据.json · 维度达成度 = 维度得分和 ÷ 维度满分（未评估按 0 计入，与主报告同口径）</div>
</div>
<div class="legend">
  <b>如何看：</b>蓝色实线 = 当前能力，橙色虚线 = 岗位要求。两条线越接近，差距越小。
  <span class="dot" style="background:#1890ff"></span>当前能力
  <span class="dot" style="background:#fa8c16"></span>岗位要求
  <br>⚠️ <b>后端 / Python 当前未测评（雷达图按 0 分计入），属有实战但未量化——补测后差距才准确。</b>详细评分见 docs/个人能力评分表.md。
</div>
${cards}
<script>
var DATA = ${JSON.stringify(payload)};
DATA.jobs.forEach(function(job, i) {
  var chart = echarts.init(document.getElementById('chart-' + i));
  chart.setOption({
    tooltip: { trigger: 'item' },
    legend: { data: ['岗位要求', '当前能力'], bottom: 0, textStyle: { fontSize: 12 } },
    radar: {
      indicator: DATA.indicators,
      radius: '62%',
      splitNumber: 4,
      axisName: { color: '#595959', fontSize: 12 },
      splitArea: { areaStyle: { color: ['#fafafa', '#fff'] } },
      splitLine: { lineStyle: { color: '#e8e8e8' } },
      axisLine: { lineStyle: { color: '#e8e8e8' } }
    },
    series: [{
      type: 'radar',
      emphasis: { focus: 'series' },
      data: [
        { value: job.reqArr, name: '岗位要求', lineStyle: { color: '#fa8c16', type: 'dashed', width: 2 }, itemStyle: { color: '#fa8c16' }, areaStyle: { color: 'rgba(250,140,22,.12)' } },
        { value: job.curArr, name: '当前能力', lineStyle: { color: '#1890ff', width: 2.5 }, itemStyle: { color: '#1890ff' }, areaStyle: { color: 'rgba(24,144,255,.18)' } }
      ]
    }]
  });
  window.addEventListener('resize', function() { chart.resize(); });
});
</script>
</body>
</html>`;

fs.writeFileSync('docs/岗位能力差距图.html', html, 'utf8');
console.log('✅ 岗位能力差距图已生成 → docs/岗位能力差距图.html');
report.forEach(r => {
  const gaps = r.rows.filter(x => x.status === 'gap').map(x => x.name + '(' + x.gap + '%)').join(' ') || '无';
  const unmeasured = r.rows.filter(x => x.status === 'unmeasured').map(x => x.name).join('、') || '无';
  console.log('  ' + r.label + '：匹配度 ' + r.match + '%（已评 ' + r.evalCount + '/' + r.reqCount + ' 核心维度）| 差距项: ' + gaps + ' | 未测: ' + unmeasured);
});
