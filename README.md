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

## 目录导航

| 内容 | 位置 |
|------|------|
| 产品设计文档 | `docs/SPEC.md` |
| 岗位能力标准（主骨架） | `docs/岗位能力图谱-严格版.md` |
| 前端/后端深度教材 | `docs/前端架构师知识图谱.md`、`docs/后端高级架构师能力图谱.md` |
| 系统设计/微服务/八股教材 | `docs/系统设计教材*.md`、`docs/微服务面试题集.md` 等 |
| 面试题库 | `面试题/` |
| 学习命令 | `.claude/commands/study.md`、`skill-test.md` |
| 工作文件模板 | `docs/templates/` |
| 报告/转换脚本 | `scripts/` |

## 工具链

```bash
make md2pdf f=docs/后端缩写速查表.md   # Markdown → PDF（默认样式 assets/style.css）
make md-pdf-dir d=面试题/md            # 批量导出目录 → <目录>/pdf/
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
