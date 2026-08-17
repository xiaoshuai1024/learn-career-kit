# CLAUDE.md — Learn Career Kit

> 本文件是 Claude Code 的入口说明。完整项目规范见 **`AGENTS.md`**（文档职责矩阵、数据流向、学习材料粒度规范、评分体系），两者冲突时以 `AGENTS.md` 为准。

## 项目概述

「个人学习 + 职业决策知识库」开源框架：能力评估系统 + AI 辅助系统化学习命令 + 知识沉淀体例 + Markdown/PDF 工具链。仓库内个人数据均为虚构示例人物「张三」。

## 核心闭环

```
能力评估（docs/能力评估数据.json 唯一真相源）
   │  node scripts/gen-skill-report.mjs
   ▼
报告产物（评分表 md / HTML 雷达图 / 趋势 CSV）
   │  发现薄弱项
   ▼
系统学习（/study 出完整材料 → 知识检测 → 模拟面试）
   │  错题/新词/评分快照
   ▼
知识沉淀（错题本 / 生词本 / 学习记录 / 每日日志 / 技术学习清单）
   │  快照回写 JSON → 形成进步趋势
   └──► 回到能力评估
```

## 自定义命令

| 命令 | 用途 |
|------|------|
| `/study [主题\|review\|log\|项目]` | 系统化学习：材料 + 测验 + 模拟面试，自动更新全部沉淀文件 |
| `/skill-test [方向\|技能]` | 技能测试评估，追加评分快照并重跑报告脚本 |
| `/opsx:propose` 等 | OpenSpec 变更管理（见 `.claude/commands/opsx/`） |

## 岗位爬虫 MCP（job-crawler/）

只读多平台岗位采集（BOSS/猎聘/智联/51Job + 官网），写回 `docs/岗位列表.md`。**配置前必须让用户确认 `job-crawler/README.md` 的免责声明**。红线：只读不投递、验证码绝不破解、建议小号。

## 硬规则速记（详见 AGENTS.md）

- **评分数字只写 `docs/能力评估数据.json`**（snapshots 数组）；评分表/HTML/CSV 全是脚本生成，勿手改
- **5 类内容唯一写入地**：错题→`docs/错题本.md`、主题档案→`docs/学习记录.md`、过程流水→`docs/每日学习日志.md`、待办→`docs/技术学习清单.md`、评分→JSON
- `/study` `/skill-test` 完成后必须：追加快照 → `node scripts/gen-skill-report.mjs` → 错题归档（score ≤ 40 必须归档）
- 工作文件（生词本/错题本等）不存在时，先从 `docs/templates/` 复制同名模板
- 学习材料粒度按 AGENTS.md「学习材料粒度规范」12 条执行（先讲解后追问、ASCII 图、真实业务场景、缩写全拼等）
- 信息真实性原则：所有内容必须真实可验证，不确定就标注「待验证」
- 包管理：`pnpm` 唯一，镜像源 `https://registry.npmmirror.com/`

## 快速命令

```bash
pnpm install                    # 安装依赖（puppeteer）
make report                     # 生成能力评估报告（评分表+HTML+趋势CSV）
make gap                        # 岗位能力差距矩阵
make md2pdf f=docs/xx.md        # Markdown → PDF（精美样式）
make md-pdf-dir d=docs          # 批量导出目录下全部 md → PDF
make pdf2md f=xx.pdf            # PDF → Markdown
```
