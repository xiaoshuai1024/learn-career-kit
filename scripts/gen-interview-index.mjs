#!/usr/bin/env node
/**
 * gen-interview-index.mjs
 * 生成「面试题/高频刷题清单.md」—— 按 方向 → 子分类 → 热度 排序的刷题索引
 *
 * 数据来源：
 *   - 题目：抽取 4 份保留面试题（架构师/技术总监/AI全栈/前端架构师）的 ### Q 题
 *   - 子分类：章节名直接映射（架构师/技术总监/前端架构师）+ AI全栈按题号区间
 *   - 热度：大厂面试通用经验 + 文件内「高频考点 TOP5 / 王牌 / 🔥」标注，分 3 档
 *     · 🔥🔥🔥 必刷高频  · 🔥🔥 中频常考  · 🔥 低频加分
 *   ⚠️ 热度为经验估计，非精确统计（面试题无公开出现频率数据）
 *
 * 用法：node scripts/gen-interview-index.mjs
 */
import fs from 'fs';

const FILES = {
  '架构师': '面试题/md/架构师-全面面试题集.md',
  '技术总监': '面试题/md/技术总监-面试题.md',
  'AI应用开发': '面试题/md/AI应用开发-全面面试题集.md',
  'AI全栈': '面试题/md/全栈技术总监-AI应用开发-综合面试题.md',
  '前端架构师': '面试题/md/前端架构师-面试题.md',
};

// ── 抽取题目 ──────────────────────────────────────────
function extract() {
  const out = [];
  for (const [dir, f] of Object.entries(FILES)) {
    const lines = fs.readFileSync(f, 'utf-8').split('\n');
    let ch = '';
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].replace(/\r$/, '');
      const m = raw.match(/^## (.+)/);
      if (m && !/[📋🎯🧠]/.test(m[1])) ch = m[1].trim();
      const q = raw.match(/^#{2,3} Q(\d+)\.\s*(.+)/);
      if (q) out.push({ dir, ch, qn: 'Q' + q[1], title: q[2].trim(), line: i + 1, file: f });
    }
  }
  return out;
}

// ── 子分类映射 ────────────────────────────────────────
// 架构师 / 技术总监 / 前端架构师：章节名 → 子分类
const CH_MAP = {
  // 架构师
  '第 1 章 分布式系统原理': '分布式基础',
  '第 2 章 微服务架构': '微服务架构',
  '第3章 高可用高并发': '高可用高并发',
  '第4章 数据架构与技术决策': '数据架构与技术决策',
  '第5章 系统设计': '系统设计',
  '第6章 项目深挖（王牌）': '项目深挖（个人王牌）',
  '第 6 章 项目深挖': '项目深挖（个人王牌）',
  '第7章 HR 与软技能': 'HR 与软技能',
  '复审': '架构方法论',
  // 技术总监
  '一、团队管理与人才建设（7 题）': '团队管理',
  '二、技术战略与决策（5 题）': '技术战略与决策',
  '三、研发体系与工程文化（4 题）': '研发体系',
  '四、跨部门协作与沟通（4 题）': '协作与沟通',
  '五、业务理解与商业思维（3 题）': '业务与商业思维',
  '六、危机与复杂决策（3 题）': '危机与 AI 决策',
  '八、高管面 / 老板面高频题（8 题）': '高管面 / HR',
  // 前端架构师
  '一、前端架构基础与设计原则（4 题）': '架构基础与原则',
  '二、前端工程化（5 题）': '前端工程化',
  '三、前端性能架构（5 题）': '前端性能',
  '四、前端架构模式（4 题）': '前端架构模式',
  '五、跨端与多端（3 题）': '跨端',
  '六、前端基建与研发效能（3 题）': '前端基建',
  '七、项目深挖（架构视角，3 题）': '项目深挖（个人王牌）',
  '八、技术引领与 HR（3 题）': '技术引领 / HR',
};

// AI全栈（综合卷，章节缺失）按题号区间 + 标题细分
function catAI(qn, title) {
  const n = parseInt(qn.slice(1));
  if (n <= 8) {
    if (/自我介绍|失败|复盘/.test(title)) return 'HR 与软技能';
    if (/技术选型|ADR/.test(title)) return '技术战略与决策';
    if (/协作|冲突/.test(title)) return '协作与沟通';
    return '团队管理';
  }
  if (n <= 16) {
    if (/系统设计|方法论|4S/.test(title)) return '系统设计';
    if (/高可用|多活|限流|熔断|降级|SLA|99\./.test(title)) return '高可用高并发';
    if (/DDD/.test(title)) return '微服务架构';
    if (/缓存/.test(title)) return '数据架构与技术决策';
    if (/分布式事务/.test(title)) return '分布式基础';
    if (/微服务|模块化单体/.test(title)) return '微服务架构';
    return '系统设计';
  }
  if (n <= 23) return '前端基础与框架';
  if (n <= 33) {
    if (/Redis|缓存|穿透|分布式锁|Redisson/.test(title)) return '缓存与消息队列';
    if (/消息队列/.test(title)) return '缓存与消息队列';
    if (/MySQL|索引|B\+|MVCC|事务隔离/.test(title)) return '数据库';
    return 'Java 并发与 Spring';
  }
  if (n <= 40) return /Transformer|Attention|Token|温度|top-p/.test(title) ? 'AI 原理' : 'AI 工程化';
  if (n <= 49) return 'AI 工程化';
  if (n <= 56) return '项目深挖（个人王牌）';
  return 'HR 与软技能';
}

function catOf(q) {
  if (q.dir === 'AI全栈') return catAI(q.qn, q.title);
  if (q.dir === 'AI应用开发') return catAIApp(q.title);
  return CH_MAP[q.ch] || '其他';
}

// AI应用开发（纯 AI 卷，题目用 ## Q 格式，无显式章节标题，按标题关键词分类）
function catAIApp(t) {
  if (/为什么选 AI|AI 项目.*4 人|能力边界|期望薪资|职业规划/.test(t)) return 'AI-HR';
  if (/AI 助手项目|85% 准确率|28 命令|项目最大的|整体架构讲|踩过的坑/.test(t)) return 'AI 项目深挖';
  if (/设计一个|^设计/.test(t)) return 'AI 系统设计';
  if (/RAGAS|LLM-as-Judge|Prompt 注入|数据安全|内容审核|越狱|PII/.test(t)) return 'AI 评测与安全';
  if (/前端|SSE.*接收|流式 Markdown|多轮对话|Tool Calling UI|交互.*性能/.test(t)) return 'AI 前端交互';
  if (/国内主流|Failover|故障切换|版本升级|A\/B 灰度|评估一个新模型/.test(t)) return '模型选型运维';
  if (/三道防线|熔断|Circuit|限流|令牌桶|降级|多租户|可观测|LangFuse|成本控制|工程保障|为什么 AI 应用需要/.test(t)) return 'AI 工程保障';
  if (/^Agent|ReAct|记忆|Memory|多 Agent|LangGraph|MCP|Deep Agent|Context Engineering|Compaction|Agent.*失败/.test(t)) return 'Agent';
  if (/向量数据库|Milvus|Pgvector|HNSW|Chroma|ES.*向量|向量库运维|过滤.*更新.*分片/.test(t)) return '向量数据库';
  if (/RAG|文档加载|切片|Chunking|向量检索|混合检索|Rerank|MMR|Token 预算|召回/.test(t)) return 'RAG 检索增强';
  if (/API.*接入|Spring AI|ChatClient|多供应商|抽象层|模型路由|Function Calling|Tool Calling|Token 计量|Prompt 模板|SSE.*流式/.test(t)) return 'AI 工程化接入';
  if (/Transformer|LLM 生成|Token.*上下文|解码|Temperature|Top-|Beam|幻觉|RLHF|DPO|SFT|Instruct|对齐|LoRA|QLoRA|PEFT|微调|Embedding.*原理|Prompt Engineering/.test(t)) return 'AI/LLM 原理';
  return 'AI 其他';
}

// ── 热度规则（经验 + 标注）────────────────────────────
// 🔥🔥🔥 高频：个人王牌项目 / 必考硬核 / HR 必问
const HIGH = [
  // HR 必问
  /自我介绍|离职|看机会|为什么来|为什么应聘|期望薪资|薪资|为什么是你|能胜任|有什么不同|为什么转管理/,
  // 个人王牌项目（简历核心项目）
  /王牌|🔥|AI.*(分润|助手|RAG)|低代码.*架构|电商.*架构/,
  // 架构硬核必考
  /^CAP|PACELC|一致性模型/, /分布式锁|Redlock/, /分布式事务.*(选型|Seata|TCC|Saga)/,
  /缓存.*(一致|穿透|击穿|雪崩)/, /秒杀/, /微服务怎么拆/, /限流.*算法|Sentinel|熔断.*降级/,
  /MySQL.*(千万|大表|优化|索引|B\+)/, /系统设计.*(框架|方法论|4S)/,
  /高可用系统|多活.*限流.*熔断/, /高可用 7 大手段/,
  // AI 高频
  /RAG.*(链路|完整)/, /Function Calling|Tool Use/, /Agent.*编排|ReAct/, /MCP 协议/,
  /SSE.*流式/, /多模型.*路由/, /AI 网关.*熔断/, /向量数据库.*选型|向量库.*选型/,
  // 管理必问
  /绩效.*KPI|KPI.*OKR/, /招聘|面试和招聘/, /技术路线图|年度技术规划|技术战略/,
  /研发效能.*体系|研发效能.*王牌|AI 协同.*28/,
  // 前端必考
  /Vue3.*响应式|事件循环|宏任务|微任务/, /前端性能优化.*方向|首屏.*LCP/,
  /微前端|qiankun|Module Federation/, /SSR.*SSG|SSR\+CDN/,
];
// 🔥 低频：深挖原理 / 加分项 / 敏感题
const LOW = [
  /Paxos/, /Service Mesh|Istio|Envoy/, /混沌工程|ChaosBlade/, /全链路压测.*(影子|染色|队列)/,
  /容量规划/, /Canal.*binlog|伪装.*Slave/, /ShardingSphere.*原理|分库分表四大/, /MHA|MGR/,
  /数据架构演进|TiDB/, /Snowflake.*时钟回拨|Leaf|UidGenerator/, /一致性哈希.*虚拟节点/,
  /幂等四层|全局幂等/, /通知推送|统计中台/, /模块化单体.*怎么选|单体到微服务.*中间/,
  /技术债.*(分类|量化|20%)/, /技术文化|知识沉淀/, /向上管理|向下沟通|团队.*冲突/,
  /商业模式/, /裁员|扩张.*技术|方向突变/, /AI 时代.*转型|砍人/, /AI.*ROI.*度量|ROI.*证明/,
  /依赖管理|版本治理/, /脚手架|项目模板/, /研发效能平台/, /多端统一|Taro|同构|Isomorphic|小程序架构/,
  /SOLID.*前端/, /组件库.*治理/, /多数据源.*实时.*兜底/, /99\.9.*99\.99.*(差异|差别)/,
  /长上下文|Prompt Cache/, /LLM-as-Judge|RAGAS|Prompt Injection/, /微调.*vs.*RAG|LoRA|QLoRA/,
  /top-p|温度.*解码|Token.*上下文/, /Transformer.*Attention/, /设计模式.*前端/,
  /Nacos.*(配置|注册)/, /Raft.*Paxos/, /本地消息表/, /可观测性三支柱|trace_id/,
  /SLA.*SLO.*SLI|错误预算|43 分钟/, /多活容灾/, /降级预案.*P0/, /SOLID/,
  /技术引领|架构师.*区别/, /组织结构|组织设计/, /技术预算|技术.*价值/,
];
function heatOf(t) {
  if (HIGH.some(r => r.test(t))) return 3;
  if (LOW.some(r => r.test(t))) return 1;
  return 2;
}

// ── 子分类显示顺序（同方向内）────────────────────────
const CAT_ORDER = [
  '分布式基础', '微服务架构', '高可用高并发', '数据架构与技术决策', '缓存与消息队列',
  '数据库', 'Java 并发与 Spring', '系统设计', '架构方法论', '技术战略与决策',
  '前端基础与框架', '前端架构模式', '前端工程化', '前端性能', '架构基础与原则',
  '跨端', '前端基建',
  'AI/LLM 原理', 'AI 工程化接入', 'RAG 检索增强', '向量数据库', 'Agent',
  'AI 工程保障', '模型选型运维', 'AI 系统设计', 'AI 前端交互', 'AI 评测与安全',
  'AI 原理', 'AI 工程化', 'AI 其他',
  '团队管理', '研发体系', '协作与沟通', '业务与商业思维', '危机与 AI 决策',
  '项目深挖（个人王牌）', 'AI 项目深挖', '技术引领 / HR', '高管面 / HR', 'AI-HR', 'HR 与软技能',
];

// ── 生成 ─────────────────────────────────────────────
const qs = extract().map(q => ({ ...q, cat: catOf(q), heat: heatOf(q.title) }));

const unclassified = qs.filter(q => q.cat === '其他');
if (unclassified.length) {
  console.error('⚠️ 未分类题目：');
  unclassified.forEach(q => console.error(`  [${q.dir}] ${q.qn} ${q.title} (ch="${q.ch}")`));
}

// 锚点：GitHub markdown 中文标题锚点规则（小写、空格转-、去标点）
function anchor(dir, q) {
  return `${dir}-${q.qn}-${q.line}`;
}

const heatMark = { 3: '🔥🔥🔥', 2: '🔥🔥', 1: '🔥' };
const heatLabel = { 3: '必刷高频', 2: '中频常考', 1: '低频加分' };

function shortFile(f) {
  return f.replace('面试题/md/', '').replace('.md', '');
}

let md = `# 📋 高频刷题清单（按 方向 → 子分类 → 热度 排序）

> **用途**：先刷高频热门题。每个方向内按**子分类**聚合（微服务/数据库/技术选型…），同类内按**热度**降序。
>
> **热度分级**（经验估计，非精确统计；来源：大厂面试通用经验 + 各文件「高频考点 TOP5 / 王牌 / 🔥」标注）：
> - 🔥🔥🔥 **必刷高频**：个人王牌项目 + 大厂必考硬核 + HR 必问题（优先刷）
> - 🔥🔥 **中频常考**：常规高频，需准备标准答案
> - 🔥 **低频加分**：深度原理 / 加分项 / 敏感题，时间够再刷
>
> **使用方式**：点击题目跳转原文件查看详细答案；建议按 🔥🔥🔥 → 🔥🔥 → 🔥 顺序，每个子分类刷完再下一个。
>
> **数据统计**：共 ${qs.length} 题 ｜ 🔥🔥🔥 ${qs.filter(q=>q.heat===3).length} 题 ｜ 🔥🔥 ${qs.filter(q=>q.heat===2).length} 题 ｜ 🔥 ${qs.filter(q=>q.heat===1).length} 题

---

`;

// 统计快览表
md += `## 📊 各方向热度概览\n\n`;
md += `| 方向 | 总题 | 🔥🔥🔥 | 🔥🔥 | 🔥 | 覆盖子分类 |\n|------|:---:|:---:|:---:|:---:|------|\n`;
for (const dir of Object.keys(FILES)) {
  const sub = qs.filter(q => q.dir === dir);
  const h3 = sub.filter(q => q.heat === 3).length;
  const h2 = sub.filter(q => q.heat === 2).length;
  const h1 = sub.filter(q => q.heat === 1).length;
  const cats = [...new Set(sub.map(q => q.cat))];
  md += `| ${dir} | ${sub.length} | ${h3} | ${h2} | ${h1} | ${cats.join('、')} |\n`;
}
md += `\n---\n\n`;

// 各方向详细清单
for (const dir of Object.keys(FILES)) {
  const sub = qs.filter(q => q.dir === dir);
  md += `## ${dir}\n\n`;
  // 按 CAT_ORDER 排序子分类
  const cats = [...new Set(sub.map(q => q.cat))].sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  for (const cat of cats) {
    const items = sub.filter(q => q.cat === cat).sort((a, b) => b.heat - a.heat);
    md += `### ${cat}（${items.length} 题）\n\n`;
    items.forEach((q, idx) => {
      const f = shortFile(q.file);
      md += `${idx + 1}. ${heatMark[q.heat]} \`${q.qn}\` [${q.title}](./${f}.md#L${q.line}) <sub>${heatLabel[q.heat]}</sub>\n`;
    });
    md += `\n`;
  }
  md += `---\n\n`;
}

fs.writeFileSync('面试题/高频刷题清单.md', md, 'utf-8');
console.log('✅ 已生成 面试题/高频刷题清单.md');
console.log(`   共 ${qs.length} 题 | 🔥🔥🔥 ${qs.filter(q=>q.heat===3).length} | 🔥🔥 ${qs.filter(q=>q.heat===2).length} | 🔥 ${qs.filter(q=>q.heat===1).length}`);
if (unclassified.length) console.error(`   ⚠️ ${unclassified.length} 题未分类，请检查`);
