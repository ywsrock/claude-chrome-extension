import { QUICK_ACTIONS } from './lib/settings.js';
import { readTab, toContext } from './lib/page.js';

// ツールバーのアイコン（およびショートカット）でサイドパネルを開く
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
  migrateLegacySettings().catch(console.error);
});

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ask', title: '選択テキストについて質問する', contexts: ['selection'] });
    for (const action of QUICK_ACTIONS) {
      chrome.contextMenus.create({ id: `action:${action.id}`, title: action.label, contexts: ['selection'] });
    }
    chrome.contextMenus.create({ id: 'page:summarize', title: 'このページを要約', contexts: ['page'] });
  });
}

// v1 は APIキーを storage.sync（Googleアカウントで同期）に保存していたため、端末内の storage.local へ移す
async function migrateLegacySettings() {
  const legacy = await chrome.storage.sync.get(['claudeApiKey', 'language']);
  const current = await chrome.storage.local.get(['claudeApiKey', 'language']);
  const updates = {};
  if (legacy.claudeApiKey && !current.claudeApiKey) updates.claudeApiKey = legacy.claudeApiKey;
  if (legacy.language && !current.language) updates.language = legacy.language;
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
  await chrome.storage.sync.remove(['claudeApiKey', 'language', 'temperature', 'defaultPrompt']);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  // sidePanel.open はユーザー操作の直後に同期的に呼ぶ必要がある
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
  buildPendingRequest(info, tab).then((request) =>
    chrome.storage.session.set({
      pendingRequest: { ...request, windowId: tab.windowId, createdAt: Date.now() }
    })
  );
});

async function buildPendingRequest(info, tab) {
  const isPage = info.menuItemId === 'page:summarize';
  const actionId = info.menuItemId === 'ask' ? null : isPage ? 'summarize' : info.menuItemId.replace('action:', '');

  let page = null;
  try {
    page = await readTab(tab.id);
  } catch (error) {
    console.warn('ページを読み取れませんでした:', error);
  }

  if (isPage) {
    if (!page) return { error: 'このページは読み取れません（chrome:// やウェブストアなどのページは対象外です）。' };
    try {
      return { actionId, context: toContext(page, 'page') };
    } catch (error) {
      return { error: error.message };
    }
  }

  // info.selectionText は改行が失われるため、取得できればページ側の選択範囲を優先する
  const text = page?.selection.trim() || info.selectionText;
  return { actionId, context: { kind: 'selection', text, title: tab.title, url: tab.url } };
}
