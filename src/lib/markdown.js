// Claudeの応答（Markdown）を表示用HTMLに変換する簡易レンダラー。
// 文字列は必ずエスケープしてからタグを組み立てるため、応答やページ由来の文字列からHTMLが注入されることはない。

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function renderInline(text) {
  return text
    .split(/(`[^`\n]+`)/)
    .map((part, index) => {
      if (index % 2 === 1) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      return escapeHtml(part)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(
          /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        );
    })
    .join('');
}

function isTableStart(lines, index) {
  return /^\s*\|.*\|\s*$/.test(lines[index]) &&
    /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[index + 1] ?? '');
}

function splitRow(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderTable(rows) {
  const [header, , ...body] = rows;
  const head = splitRow(header).map((cell) => `<th>${renderInline(cell)}</th>`).join('');
  const bodyRows = body
    .map((row) => `<tr>${splitRow(row).map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

export function renderMarkdown(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const start = list.type === 'ol' && list.start !== 1 ? ` start="${list.start}"` : '';
    const items = list.items.map((item) => `<li>${renderInline(item)}</li>`).join('');
    out.push(`<${list.type}${start}>${items}</${list.type}>`);
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><button type="button" class="code-copy">コピー</button><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (isTableStart(lines, i)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      out.push(renderTable(rows));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 2, 6);
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push('<hr>');
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flush();
      out.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (list?.type !== type) {
        flushList();
        list = { type, start: ordered ? Number(ordered[1]) : 1, items: [] };
      }
      list.items.push(bullet ? bullet[1] : ordered[2]);
      continue;
    }

    // 空行では段落だけを閉じ、番号付きリストの途中に空行があっても番号が続くようにする
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flush();
  return out.join('');
}
