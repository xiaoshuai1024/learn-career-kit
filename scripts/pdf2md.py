#!/usr/bin/env python3
"""
pdf2md — PDF → Markdown 转换
依赖：PyMuPDF (pip3 install pymupdf)

用法：
  python3 scripts/pdf2md.py cv/input.pdf         # 在 cv/ 下生成同名的 .md
  python3 scripts/pdf2md.py cv/input.pdf -o output.md   # 指定输出路径
"""

import sys
import os
import re
import argparse

try:
    import fitz  # PyMuPDF
except ImportError:
    print("❌ 需要 PyMuPDF：pip3 install pymupdf", file=sys.stderr)
    sys.exit(1)


def extract_text(pdf_path: str) -> str:
    """从 PDF 中提取所有文本"""
    doc = fitz.open(pdf_path)
    pages_text = []
    for page in doc:
        text = page.get_text("text")
        pages_text.append(text.strip())
    doc.close()
    return "\n\n".join(pages_text)


def is_heading(line: str) -> bool:
    """判断是否为标题行（短行、末尾无句号、可能有数字序号）"""
    line = line.strip()
    if not line or len(line) > 60:
        return False
    # 以数字开头（如 "1."、"1）"）或全中文短句
    if re.match(r'^[\d一二三四五六七八九十]+[\.\、\)）]', line):
        return True
    # 公司名 + 职位头衔行
    if re.match(r'^[A-Za-z一-鿿].{1,20} [|｜] ', line):
        return True
    if re.match(r'^【', line):
        return True
    return False


def clean_line(line: str) -> str:
    """清理单行文本"""
    line = line.strip()
    # 去掉多余空格
    line = re.sub(r' {2,}', ' ', line)
    # 修复常见 OCR 错误
    line = line.replace('｀', "'").replace('＇', "'")
    return line


def pdf_to_markdown(pdf_path: str) -> str:
    """将 PDF 文本转换为 Markdown 格式"""
    raw_text = extract_text(pdf_path)

    lines = raw_text.split('\n')
    md_lines = []
    in_code_block = False

    for i, line in enumerate(lines):
        line = clean_line(line)
        if not line:
            if md_lines and md_lines[-1] != '':
                md_lines.append('')
            continue

        # 检测标题
        if is_heading(line):
            md_lines.append(f'\n## {line}\n')
            continue

        # 检测列表项
        if re.match(r'^[•·\-]\s', line):
            md_lines.append(f'- {line[1:].strip()}')
            continue

        if re.match(r'^\d+[\.\、\)]\s', line):
            md_lines.append(f'- {line}')
            continue

        # 检测技能标签 [xxx / yyy]
        if re.match(r'^\[.+\]', line):
            md_lines.append(f'`{line.strip()}`')
            continue

        # 普通段落
        md_lines.append(line)

    # 合并短行（中文段落修复）
    merged = merge_paragraphs(md_lines)
    return merged


def merge_paragraphs(lines: list) -> str:
    """合并被错误拆分的段落（中文文本换行修复）"""
    result = []
    for line in lines:
        if not line:
            result.append('')
            continue
        if line.startswith('## ') or line.startswith('- ') or line.startswith('>'):
            result.append(line)
        elif result and result[-1] and not result[-1].endswith(('。', '？', '！', '）', '"', "'")):
            result[-1] += line
        else:
            result.append(line)
    return '\n'.join(result)


def main():
    parser = argparse.ArgumentParser(description='PDF → Markdown 转换')
    parser.add_argument('input', help='输入 PDF 文件路径')
    parser.add_argument('-o', '--output', help='输出 Markdown 文件路径（默认同目录同名）')
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f'❌ 文件不存在：{args.input}', file=sys.stderr)
        sys.exit(1)

    if not args.input.lower().endswith('.pdf'):
        print(f'❌ 不是 PDF 文件：{args.input}', file=sys.stderr)
        sys.exit(1)

    # 确定输出路径
    if args.output:
        out_path = args.output
    else:
        out_path = os.path.splitext(args.input)[0] + '.md'

    print(f'📄 正在解析：{args.input}')
    md_content = pdf_to_markdown(args.input)

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(md_content)

    print(f'✅ 已导出：{out_path}')
    print(f'📊 共 {len(md_content)} 字符')


if __name__ == '__main__':
    main()
