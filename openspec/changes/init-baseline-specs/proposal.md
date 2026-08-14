# 基线规格登记：init-baseline-specs

## Why

learn-career-kit 刚从私有库整理为开源项目，`openspec/` 已初始化但主规格目录（`openspec/specs/`）为空。项目已有三大能力落地实现但从未以 spec 形式登记，导致后续任何改动都没有可对照的行为契约。需要把已完成且验证过的能力作为**基线规格**固化下来，作为后续演进的起点。

## What Changes

- 新增 3 个能力（capability）的基线规格，全部为**登记既有行为**，不引入新功能：
  - `skill-assessment`：能力评估系统（唯一真相源 JSON + snapshots + 报告脚本 + 岗位差距矩阵）
  - `study-workflow`：学习命令与知识沉淀（`/study`、`/skill-test` 两个命令 + 5 类文档唯一写入地）
  - `md-pdf-toolchain`：Markdown/PDF 转换工具链（md2pdf / md2pdf-batch / pdf2md，字体可选）
- 不修改任何代码；本变更的 "implementation" 仅是把 delta specs 同步进 `openspec/specs/`。

## Capabilities

### New Capabilities

- `skill-assessment`: 能力评估——评分数据唯一真相源（`docs/能力评估数据.json`）、snapshot 追加式历史、脚本生成三产物（评分表 md / HTML 雷达报告 / 趋势 CSV）、悲观计分岗位差距矩阵
- `study-workflow`: 系统学习与知识沉淀——`/study`（材料→检测→模拟面试→归档）与 `/skill-test`（测试→快照→报告）流程，及错题本/学习记录/每日日志/技术清单/生词本 5 类内容的唯一写入地边界
- `md-pdf-toolchain`: 文档转换——单文件 md→PDF（样式可定制、字体可选、文件名带日期）、目录批量导出（`<dir>/pdf/`、watch 模式）、PDF→Markdown

### Modified Capabilities

（无——主规格目录当前为空，全部是新建基线）

## Impact

- 新增文件：`openspec/changes/init-baseline-specs/specs/{skill-assessment,study-workflow,md-pdf-toolchain}/spec.md`；归档后落盘 `openspec/specs/` 同路径
- 不影响运行时行为；脚本与命令零改动
- 后续任何对评估 JSON 结构、命令流程字段、工具链 CLI 参数的改动都需走 OpenSpec 变更流程对照本基线
