# Learn Career Kit — 个人学习 + 职业决策知识库框架

一个用 AI Agent 驱动的个人成长闭环框架：**能力评估 → 目标岗位差距 → 系统学习 → 知识沉淀 → 再评估**。

内置一套面向技术人（前端/后端/全栈/AI 应用/技术管理）的能力评估体系、学习命令（`/study` `/skill-test`）、知识库教材和 md/pdf 工具链。配合 Claude Code / Codex 等支持 `AGENTS.md` 的 Agent 工具使用。

> 仓库内所有个人数据均为虚构示例人物「张三」，仅演示体例——fork 后替换为你自己的数据即可。

## 核心闭环

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ 能力评估  │ →  │ 目标岗位  │ →  │ 系统学习  │ →  │ 知识沉淀  │
  │ /skill-test│    │ 差距矩阵  │    │  /study  │    │ 错题本等  │
  └────▲─────┘    └──────────┘    └──────────┘    └────┬─────┘
       │                                                  │
       └────────────────── 再评估，形成趋势 ──────────────┘
```

1. **能力评估**：`docs/能力评估数据.json` 是唯一真相源，6 维度 126 技能，每次测试追加 snapshot
2. **岗位差距**：`job-gap-report` 用悲观计分模型算出你与目标岗位每项能力的差距
3. **系统学习**：`/study` 命令产出完整学习材料（讲解→检测→模拟面试→自动归档）
4. **知识沉淀**：生词本 / 错题本 / 学习记录 / 每日日志 / 技术清单，各有唯一职责边界
5. **再评估**：评分快照累积成趋势，HTML 雷达图 + CSV 看进步

## 快速上手

```bash
git clone <你的 fork>
cd learn-career-kit
pnpm install          # 安装依赖（puppeteer）

# 1. 初始化自己的工作文件
cp docs/templates/*.md docs/

# 2. 把 docs/能力评估数据.json 里的张三示例数据换成自己的
#    （owner、jobs 目标岗位、snapshots 清空重新积累）

# 3. 生成能力报告
make report           # → docs/个人能力评分表.md + 能力评估报告.html + 能力评估趋势.csv
make gap              # → 与目标岗位的差距矩阵

# 4. 用 AI Agent 学习（Claude Code / Codex 等）
#    /study            自动从薄弱项选题学习
#    /study MCP协议     学习指定主题
#    /study review     间隔重复复习
#    /skill-test 后端   测试某方向能力并追加快照
```

浏览器打开 `docs/能力评估报告.html` 查看雷达图 + 进步趋势折线。

## 一句话让 Agent 初始化本项目

把仓库 clone 到本地后，在你的 Agent（Claude Code / Codex 等，支持 `AGENTS.md` 的工具）里发这一句话即可：

```text
我已经把 learn-career-kit 这个学习闭环框架 clone 到本地了，请先读根目录的 AGENTS.md 和 docs/SPEC.md 理解项目结构，
然后帮我完成初始化：把 docs/templates/ 下的示例工作文件复制到 docs/，把 docs/能力评估数据.json 中的张三示例数据
替换为我的信息（待会儿我会口述），配置好岗位爬虫 MCP（job-crawler/，含免责声明确认），最后跑一遍 make report
验证闭环可用，并告诉我接下来该说什么来启动第一次能力评估。
```

> 也可以直接引用仓库根目录的 [`INIT_PROMPT.md`](INIT_PROMPT.md)（内容相同，便于复制）。

## 核心命令

| 命令 | 说明 |
|------|------|
| `/study` | 自动从薄弱项选题（优先评分 0-1 的技能），完整学习材料 + 知识检测 + 模拟面试 |
| `/study <主题>` | 学习指定主题（如 `/study MCP协议`），按学习材料粒度规范输出 |
| `/study review` | 间隔重复复习最近学过的知识点 |
| `/study log` | 查看学习历史和统计 |
| `/skill-test <方向>` | 测试某方向全部技能（前端/后端/AI工程化/全栈架构/Python/管理） |
| `/skill-test <技能点>` | 测试具体技能（如 `/skill-test React原理`），2-3 题由浅入深 |

两个命令完成后都会自动：追加快照 → 重跑报告脚本 → 归档错题（score ≤ 40 强制归档）→ 更新学习记录/清单/生词本。

## 自然语言用法（不用记命令）

Agent 会根据意图自动加载对应的命令或 skill，直接说人话就行：

| 你说 | Agent 会做什么 |
|------|----------------|
| 「我后端比较薄弱，帮我学一个最需要补的点」 | 等价 `/study`：读评分数据找薄弱项 → 输出完整学习材料 → 测验 → 模拟面试 → 更新评分 |
| 「给我讲讲分布式事务，讲到位一点」 | 等价 `/study 分布式事务`：按 AGENTS.md 的学习材料粒度规范（先讲解→后追问、ASCII 图、真实业务场景）输出 |
| 「测一下我的前端水平怎么样」 | 等价 `/skill-test 前端`：2-3 题/技能由浅入深 → 打分 → 追加快照 → 刷新雷达图 |
| 「复习一下最近学的东西」 | 等价 `/study review`：间隔重复，从错题本/学习记录取最近薄弱点 |
| 「我准备投架构师岗，帮我看看差距」 | 跑 `make gap` 输出岗位差距矩阵，给出补齐优先级 |
| 「帮我改改这段自我介绍，AI 味太重了」 | 自动触发 `writing-style-zh` / `avoid-ai-writing` skill |
| 「帮我审一下这个技术方案，往死里问」 | 自动触发 `grill-me` skill |
| 「搜一下青岛的前端岗位，抓 5 条看看」 | 调 job-crawler MCP：`search_jobs` → 汇报结果 → 确认后 `export_to_md` 写回岗位列表 |

> Agent 工具需启用 skill 自动发现（如 Claude Code 的 skills 目录加载）。命令注册在 `.claude/commands/`，skills 在 `.agents/skills/`。

## Skills

`.agents/skills/` 内置通用写作与思辨技能（均可被 Agent 自动触发）：

| Skill | 用途 |
|-------|------|
| `grill-me` | 对方案/设计进行高强度连环追问，检验思考漏洞 |
| `avoid-ai-writing` | 审计并改写内容，去除 AI 写作痕迹 |
| `writing-style-zh` | 中文叙事场景（简历/面试话术/技术博客）去 AI 味 |
| `detect-ai` | 检测文本是否为 AI 生成，给出评分与指标 |

## 岗位爬虫（job-crawler）

`job-crawler/` 是只读的多平台岗位采集 MCP server（BOSS直聘/猎聘/智联/51Job + 海尔/海信/浪潮/特来电官网），CDP 接管你手动登录的浏览器，内置七层防风控，抓取结果自动写回 `docs/岗位列表.md`（两层去重）。它补全了闭环的输入端：**市场岗位 → 能力差距 → 学习选题**。

> ⚠️ **免责声明**：仅供个人学习与求职研究，严禁商业用途/数据倒卖/批量爬取；遵守各平台服务条款与当地法律；只读不投递、验证码绝不破解；账号风控与法律风险由使用者自行承担。完整条款见 [`job-crawler/README.md`](job-crawler/README.md)。使用前请务必阅读。

快速接入：

```bash
cd job-crawler && pnpm install
bash scripts/launch-chrome.sh     # 启动调试浏览器，手动登录目标平台（建议小号）
# 然后在 Agent 的 MCP 配置注册 node job-crawler/src/index.mjs
```

## OpenSpec 变更管理

项目使用 [OpenSpec](https://openspec.dev) 管理规格与变更：三大核心能力（`skill-assessment` 能力评估 / `study-workflow` 学习与沉淀 / `md-pdf-toolchain` 转换工具链）的行为契约登记在 `openspec/specs/`，改动走 `/opsx:propose → apply → archive` 流程（见 `.claude/commands/opsx/`）。

## 目录导航

| 内容 | 位置 |
|------|------|
| 产品设计文档 | `docs/SPEC.md` |
| 岗位能力标准（主骨架） | `docs/岗位能力图谱-严格版.md` |
| 前端/后端深度教材 | `docs/前端架构师知识图谱.md`、`docs/后端高级架构师能力图谱.md` |
| 系统设计/微服务/八股教材 | `docs/系统设计教材*.md`、`docs/微服务面试题集.md` 等 |
| 面试题库 | `interview-questions/` |
| 学习命令 | `.claude/commands/study.md`、`skill-test.md` |
| 工作文件模板 | `docs/templates/` |
| 报告/转换脚本 | `scripts/` |
| 岗位爬虫 MCP（含免责声明） | `job-crawler/` |

## 工具链

```bash
make md2pdf f=docs/后端缩写速查表.md   # Markdown → PDF（默认样式 assets/style.css）
make md-pdf-dir d=interview-questions/md            # 批量导出目录 → <目录>/pdf/
make pdf2md f=输入.pdf                 # PDF → Markdown（需 Python + PyMuPDF）
```

字体为可选：将阿里巴巴普惠体 TTF 放入 `assets/fonts/` 可内联嵌入；缺失时自动回退系统字体（PingFang SC / 微软雅黑）。

## 为什么用「唯一真相源 + 脚本转写」

评分数字只存在于 `能力评估数据.json` 的 `snapshots` 数组；评分表/HTML/CSV 全部由脚本生成。好处：

- 每次评估是一条历史快照，进步趋势可量化
- 手改生成物没有意义，杜绝多处数据打架
- 换工具（换报告脚本/换可视化库）不丢数据

详细的数据流向和文档职责矩阵见 `AGENTS.md`。

## License

MIT
