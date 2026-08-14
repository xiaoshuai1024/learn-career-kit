/**
 * marked-wrapper.mjs
 * 轻量级 Markdown 解析器（不依赖 npm，纯 JS 实现）
 * 支持：标题/列表/粗体/斜体/代码块/链接/图片/表格/引用
 */
export const marked = {
  parse(md) {
    let html = md;

    // 1. 转义 HTML 特殊字符
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 2. 水平线
    html = html.replace(/^---+\s*$/gm, '<hr>');

    // 3. 代码块（必须优先于行内代码）
    // 注意：不能再调 escapeHtml(code)——第 1 步已对整篇（含代码块内容）做了 HTML 转义，
    // 这里再转一次会造成双重转义（> → &gt; → &amp;gt;），PDF 里就会显示成字面 &gt;
    html = html.replace(/```(\w*)[ \t]*\r?\n([\s\S]*?)```/g, (_, lang, code) => {
      const langAttr = lang ? ` class="language-${lang}"` : '';
      return `<pre${langAttr}><code>${code}</code></pre>`;
    });

    // 4. 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 5. 标题
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // 6. 引用（blockquote）— 多行分组，内部解析表格
    // 先把连续的 &gt; 行分组，内部额外处理表格
    html = html.replace(/((?:^&gt;.*(?:\r?\n|$))+)/gm, (block) => {
      // 去除每行的 > 前缀（保留缩进空格）
      let inner = block.replace(/^&gt; ?/gm, '');
      
      // 在 blockquote 内部处理表格（先于外层表格处理，兼容 > |...| 语法）
      inner = parseTables(inner);
      
      // 处理 blockquote 内部的标题
      inner = inner
        .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
        .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
        .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
        .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
        .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
      
      return '<blockquote>' + inner.trim() + '</blockquote>';
    });

    // 7. 图片（优先于链接）
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    // 8. 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // 9. 粗体+斜体
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // 10. 删除线
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // 11. 表格 — 完整的表格解析（支持 <thead>/<tbody>/<th> 和对齐）
    html = parseTables(html);

    // 12. 无序列表
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // 13. 有序列表
    html = html.replace(/^\d+[\.\、）)]\s+(.+)$/gm, '<li>$1</li>');

    // 14. 段落（包裹非空行）
    const lines = html.split('\n');
    let result = [];
    let openBlock = null;
    const blockTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'pre', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'blockquote', 'hr', 'img'];

    for (const line of lines) {
      if (openBlock) {
        result.push(line);
        if (new RegExp('</' + openBlock + '>').test(line)) openBlock = null;
        continue;
      }
      const trimmed = line.trim();
      if (!trimmed) {
        result.push('');
        continue;
      }
      const tagName = trimmed.match(/^<(\w+)/)?.[1];
      if (tagName && blockTags.includes(tagName)) {
        result.push(trimmed);
        if (!new RegExp('</' + tagName + '>').test(trimmed)) openBlock = tagName;
        continue;
      }
      result.push(`<p>${trimmed}</p>`);
    }

    return result.join('\n');
  }
};

/**
 * 解析 Markdown 表格块为 HTML <table>
 * 支持 || 双竖线语法，忽略单列"假表格"
 */
function parseTables(html) {
  return html.replace(/(?:^\s*\|.+\|(?:\r?\n|$))+/gm, (block) => {
    const lines = block.trim().split('\n');

    // 找到分隔行：包含 --- 且拆分后有 ≥2 个对齐条目（排除单列 |---|）
    const sepIdx = lines.findIndex(l => {
      const trimmed = l.trim();
      if (!/^\|.*---.*\|$/.test(trimmed)) return false;
      const parts = trimmed.split('|').filter(s => s.trim());
      return parts.length >= 2;
    });
    if (sepIdx < 0) return block;

    // 表头至少 2 列
    const headerLine = lines.slice(0, sepIdx).join(' ');
    const headerCells = headerLine.split('|').filter(c => c.trim());
    if (headerCells.length < 2) return block;

    // 对齐方式
    const sepLine = lines[sepIdx].trim();
    const sepParts = sepLine.split('|').filter(s => s.trim());
    const alignments = sepParts.map(s => {
      const cell = s.trim();
      if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
      if (cell.endsWith(':')) return 'right';
      if (cell.startsWith(':')) return 'left';
      return 'left';
    });

    // 数据行
    const dataLines = lines.slice(sepIdx + 1).filter(l => l.trim());

    // 至少一行真实数据（≥2列）
    const hasRealData = dataLines.some(line => {
      const cells = line.split('|').filter(c => c.trim());
      return cells.length >= 2;
    });
    if (!hasRealData) return block;

    // 构建 HTML
    let out = '<table>\n<thead>\n<tr>';
    headerCells.forEach((cell, i) => {
      const align = alignments[i] && alignments[i] !== 'left'
        ? ` style="text-align:${alignments[i]}"`
        : '';
      out += `<th${align}>${cell.trim()}</th>`;
    });
    out += '</tr>\n</thead>\n';

    if (dataLines.length) {
      out += '<tbody>\n';
      dataLines.forEach(line => {
        const cells = line.split('|').filter(c => c.trim());
        if (!cells.length) return;
        out += '<tr>';
        cells.forEach((cell, i) => {
          const align = alignments[i] && alignments[i] !== 'left'
            ? ` style="text-align:${alignments[i]}"`
            : '';
          out += `<td${align}>${cell.trim()}</td>`;
        });
        out += '</tr>\n';
      });
      out += '</tbody>\n';
    }
    out += '</table>';
    return out;
  });
}

