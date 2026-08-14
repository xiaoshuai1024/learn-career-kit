## Purpose

Markdown/PDF 文档转换工具链：面向中文学习资料的精美排版导出（md→PDF）、目录批量导出与反向转换（PDF→md），供简历、教材、面试题等文档使用。

## ADDED Requirements

### Requirement: 单文件 md 转 PDF
`scripts/md2pdf.mjs` 接收一个 Markdown 文件，按 `assets/style.css` 样式渲染并导出 PDF，默认在文件名后附加日期；支持 `-o` 指定输出路径与 `--no-header` 去页眉；支持 `--style` 覆盖样式表。

#### Scenario: 默认导出
- **WHEN** 运行 `make md2pdf f=docs/某教材.md`
- **THEN** 生成带日期后缀的 PDF，版式来自 `assets/style.css`

### Requirement: 字体可选回退
内联字体为可选依赖：`assets/fonts/` 下存在指定 TTF 时以 base64 内联嵌入 PDF；缺失时自动回退系统字体（PingFang SC / 微软雅黑），转换不失败且日志明示回退原因。

#### Scenario: 无字体环境
- **WHEN** `assets/fonts/` 目录为空时执行转换
- **THEN** PDF 生成成功，使用系统字体，日志输出「未找到 assets/fonts/*.ttf，回退系统字体」

### Requirement: 目录批量导出
`scripts/md2pdf-batch.mjs --dir <目录>` 把目录下全部 `.md`（不含 `pdf/` 子目录）串行导出到 `<目录>/pdf/<同名>.pdf`，结束输出成功/失败统计；`--watch` 模式监听变更（300ms 防抖）自动重导出。

#### Scenario: 批量导出
- **WHEN** 运行 `make md-pdf-dir d=面试题/md`
- **THEN** `面试题/md/pdf/` 下生成全部对应 PDF，任一失败不中断其余文件并在汇总中计数

### Requirement: PDF 转 Markdown
`scripts/pdf2md.py` 接收一个 PDF 文件，输出同名 `.md`（需 Python + PyMuPDF 环境）；文件不存在或参数缺失时给出明确错误提示并不产生产物。

#### Scenario: 反向转换
- **WHEN** 运行 `make pdf2md f=资料.pdf`
- **THEN** 同目录生成 `资料.md`，文本与结构按 PyMuPDF 提取保真
