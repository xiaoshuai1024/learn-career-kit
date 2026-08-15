## Context

见 proposal.md — 本变更是**登记型基线**：三大能力（skill-assessment / study-workflow / md-pdf-toolchain）均已实现并在新仓库验证跑通（`make report`、`make gap`、`make md2pdf`、`make md-pdf-dir` 均通过）。主规格目录 `openspec/specs/` 为空，本设计的任务是决定基线如何切分与落地，而非设计新实现。

## Goals / Non-Goals

**Goals:**
- 把既有行为固化为 3 个互相独立、可单独演进的 capability spec
- 落地方式零风险：不改任何脚本/命令/文档内容，只新增 spec 文件

**Non-Goals:**
- 不重新设计评估 JSON 结构、命令流程或工具链 CLI（属后续变更）
- 不为教材内容、模板文件、skills 写 spec（它们是内容而非行为契约）

## Decisions

1. **按能力而非按文件切分 3 个 capability**
   - 评估（数据+报告）、学习（命令+沉淀）、工具链（转换）三者改动节奏与受众不同
   - 备选：单一 `core` capability——被否，一个 spec 混三类需求会让后续任何变更都触碰同一文件
2. **spec 写行为契约，不写实现细节**
   - 按 openspec 指引：需求描述可观察行为（WHEN/THEN 场景），脚本名仅作为用户可直接调用的接口出现（make target / node 命令），不出现内部函数名
3. **基线用 ADDED Requirements 全量登记，归档时 sync 到 `openspec/specs/`**
   - 走标准 propose → apply → archive 流程，让 delta 机制从第一天就验证可用
4. **tasks 只含验证性步骤**
   - 实现已存在，任务聚焦「核对 spec 与实现一致 + 跑通命令验证 + 归档同步」

## Risks / Trade-offs

- spec 与实现可能随时间漂移：靠「改行为必须走 OpenSpec 变更」的约定缓解，AGENTS.md 已声明
- 基线 spec 粒度偏粗（未到字段级）：刻意为之——字段级契约（如 snapshot 的精确 schema）留给未来需要时再细化，避免基线过早僵化
