## 1. 基线核对（spec ↔ 实现）

- [x] 1.1 对照 `specs/skill-assessment/spec.md` 核验：`docs/能力评估数据.json` snapshots 结构、`make report` 三产物、`make gap` 输出与 spec 场景一致
- [x] 1.2 对照 `specs/study-workflow/spec.md` 核验：`.claude/commands/study.md`、`skill-test.md` 的流程步骤与 5 类唯一写入地规则一致；`docs/templates/` 存在同名模板
- [x] 1.3 对照 `specs/md-pdf-toolchain/spec.md` 核验：`make md2pdf f=<示例>` 出带日期 PDF、无字体时回退不失败、`make md-pdf-dir d=<示例目录>` 批量出 `<目录>/pdf/`

## 2. 验证与归档

- [x] 2.1 `openspec validate init-baseline-specs` 通过（strict 如可用）
- [x] 2.2 `openspec sync`（或 archive 流程）把 3 个 delta spec 落盘到 `openspec/specs/{skill-assessment,study-workflow,md-pdf-toolchain}/spec.md`
- [x] 2.3 归档变更：`openspec archive init-baseline-specs`，确认 `openspec/specs/` 主规格完整
- [x] 2.4 README「OpenSpec 变更管理」小节与最终目录结构一致，提交 git commit
