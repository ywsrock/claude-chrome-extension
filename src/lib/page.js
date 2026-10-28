// 閲覧中のタブからテキストを取り出すユーティリティ

// これを超えるページ本文は先頭だけを送る（コストと応答時間を抑えるため。画面上で明示する）
export const MAX_PAGE_CHARS = 100_000;

// タブ内に注入して実行される関数。外側の変数は参照できない
function extractPageContent() {
  return {
    title: document.title,
    url: location.href,
    selection: window.getSelection()?.toString() ?? '',
    text: document.body?.innerText ?? ''
  };
}

export async function readTab(tabId) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageContent
  });
  return injection.result;
}

/**
 * 取得したページ内容を、Claudeに渡す資料（context）に変換する。
 * @param {'selection'|'page'|'auto'} mode auto は選択範囲があればそれを、なければページ本文を使う
 */
export function toContext(page, mode) {
  const selection = page.selection.trim();
  if (mode !== 'page' && selection) {
    return { kind: 'selection', text: selection, title: page.title, url: page.url };
  }
  if (mode === 'selection') {
    throw new Error('ページ上でテキストが選択されていません。');
  }
  const text = page.text.trim();
  if (!text) {
    throw new Error('このページから本文を取得できませんでした。');
  }
  const truncated = text.length > MAX_PAGE_CHARS;
  return {
    kind: 'page',
    text: truncated ? text.slice(0, MAX_PAGE_CHARS) : text,
    truncated,
    title: page.title,
    url: page.url
  };
}
