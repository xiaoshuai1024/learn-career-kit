# ============================================
# Learn Career Kit — Makefile
# 个人学习 + 职业决策知识库
# 包管理：pnpm（镜像源 registry.npmmirror.com）
# ============================================

SHELL := /bin/bash
.NOTPARALLEL:

GREEN  := \033[0;32m
BLUE   := \033[0;34m
YELLOW := \033[0;33m
RED    := \033[0;31m
NC     := \033[0m

PNPM    := pnpm
NODE    := node
PYTHON  := python3

PDF2MD_SCRIPT       := scripts/pdf2md.py
MD2PDF_SCRIPT       := scripts/md2pdf.mjs
MD2PDF_BATCH_SCRIPT := scripts/md2pdf-batch.mjs
SKILL_REPORT_SCRIPT := scripts/gen-skill-report.mjs
GAP_REPORT_SCRIPT   := scripts/job-gap-report.mjs

.PHONY: help
help:
	@echo ""
	@echo "$(BLUE)════════════════════════════════════════════════$(NC)"
	@echo "$(BLUE)  Learn Career Kit — 学习与职业决策知识库$(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "  $(GREEN)make install$(NC)              安装依赖（pnpm）"
	@echo "  $(GREEN)make report$(NC)               生成能力评估报告（md+html+csv）"
	@echo "  $(GREEN)make gap$(NC)                  生成岗位能力差距矩阵"
	@echo "  $(GREEN)make md2pdf f=docs/xx.md$(NC)  Markdown → PDF（精美样式）"
	@echo "  $(GREEN)make md-pdf-dir d=docs$(NC)    批量导出目录下全部 md → PDF"
	@echo "  $(GREEN)make pdf2md f=xx.pdf$(NC)      PDF → Markdown"
	@echo "  $(GREEN)make clean$(NC)                清理 node_modules"
	@echo "  $(GREEN)make info$(NC)                 查看环境信息"
	@echo ""

.PHONY: install
install:
	@echo "$(BLUE)📦 安装依赖（pnpm + 阿里云镜像）...$(NC)"
	$(PNPM) install
	@echo "$(GREEN)✅ 安装完成$(NC)"

# ─── 能力评估报告 ──────────────────────────
.PHONY: report
report:
	@echo "$(BLUE)📊 生成能力评估报告（评分表 + HTML 可视化 + 趋势 CSV）...$(NC)"
	$(NODE) $(SKILL_REPORT_SCRIPT)
	@echo "$(GREEN)✅ 打开报告：$(NC) open docs/能力评估报告.html"

# ─── 岗位差距矩阵 ──────────────────────────
.PHONY: gap
gap:
	@echo "$(BLUE)📊 生成岗位能力差距矩阵...$(NC)"
	$(NODE) $(GAP_REPORT_SCRIPT)

# ─── PDF → Markdown ──────────────────────
.PHONY: pdf2md
pdf2md:
	@if [ -z "$(f)" ]; then \
		echo "$(RED)❌ 请指定 PDF 文件：make pdf2md f=input.pdf$(NC)"; \
		exit 1; \
	fi
	@if [ ! -f "$(f)" ]; then \
		echo "$(RED)❌ 文件不存在：$(f)$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)📄 转换 PDF → Markdown...$(NC)"
	$(PYTHON) $(PDF2MD_SCRIPT) "$(f)"
	@echo "$(GREEN)✅ 转换完成$(NC)"

# ─── Markdown → PDF（精美样式）───────────
.PHONY: md2pdf
md2pdf:
	@if [ -z "$(f)" ]; then \
		echo "$(RED)❌ 请指定 Markdown 文件：make md2pdf f=docs/教材.md$(NC)"; \
		exit 1; \
	fi
	@if [ ! -f "$(f)" ]; then \
		echo "$(RED)❌ 文件不存在：$(f)$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)📄 转换 Markdown → PDF...$(NC)"
	$(NODE) $(MD2PDF_SCRIPT) "$(f)" $(if $(o),-o "$(o)")
	@echo "$(GREEN)✅ 转换完成$(NC)"

.PHONY: md2pdf-noheader
md2pdf-noheader:
	@if [ -z "$(f)" ]; then \
		echo "$(RED)❌ 请指定 Markdown 文件：make md2pdf-noheader f=docs/教材.md$(NC)"; \
		exit 1; \
	fi
	$(NODE) $(MD2PDF_SCRIPT) "$(f)" --no-header $(if $(o),-o "$(o)")
	@echo "$(GREEN)✅ 转换完成$(NC)"

# ─── 批量导出：目录下全部 md → PDF ────────
# 用法：make md-pdf-dir d=docs  输出到 <目录>/pdf/
.PHONY: md-pdf-dir
md-pdf-dir:
	@if [ -z "$(d)" ]; then \
		echo "$(RED)❌ 请指定目录：make md-pdf-dir d=docs$(NC)"; \
		exit 1; \
	fi
	@if [ ! -d "$(d)" ]; then \
		echo "$(RED)❌ 目录不存在：$(d)$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)📄 批量导出 $(d) 下全部 Markdown → PDF...$(NC)"
	$(NODE) $(MD2PDF_BATCH_SCRIPT) --dir "$(d)" $(if $(w),--watch)
	@echo "$(GREEN)✅ 导出完成$(NC)"

.PHONY: clean
clean:
	@echo "$(BLUE)🧹 清理 node_modules...$(NC)"
	rm -rf node_modules node_modules/.cache
	@echo "$(GREEN)✅ 清理完成$(NC)"

.PHONY: info
info:
	@echo "$(BLUE)📊 环境信息：$(NC)"
	@echo "  Node.js : $$($(NODE) --version 2>/dev/null || echo '未安装')"
	@echo "  Python  : $$($(PYTHON) --version 2>&1)"
	@echo "  pnpm    : $$($(PNPM) --version 2>/dev/null)"
	@echo "  PyMuPDF : $$($(PYTHON) -c 'import fitz; print(fitz.version)' 2>/dev/null || echo '未安装')"
	@echo "  Puppeteer: $$(test -d node_modules/puppeteer && echo '已安装' || echo '未安装，请 make install')"
