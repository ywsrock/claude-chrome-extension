import { MODELS, QUICK_ACTIONS, getSettings, getApiKey, buildSystemPrompt, buildUserContent } from './lib/settings.js';
import { streamMessage } from './lib/api.js';
import { renderMarkdown } from './lib/markdown.js';
import { readTab, toContext } from './lib/page.js';

// 右クリックメニューからの依頼をこの時間内に受け取れなければ破棄する
const PENDING_TTL_MS = 60_000;
const UNREADABLE_PAGE = 'このページは読み取れません（chrome:// やウェブストアなどのページは対象外です）。';

const $ = (id) => document.getElementById(id);
const els = {
  messages: $('messages'),
  emptyStateTemplate: $('emptyStateTemplate'),
  input: $('input'),
  sendButton: $('sendButton'),
  newChatButton: $('newChatButton'),
  settingsButton: $('settingsButton'),
  captureSelectionButton: $('captureSelectionButton'),
  capturePageButton: $('capturePageButton'),
  modelSelect: $('modelSelect'),
  quickActions: $('quickActions'),
  contextChip: $('contextChip'),
  contextLabel: $('contextLabel'),
  contextClear: $('contextClear'),
  banner: $('banner'),
  bannerText: $('bannerText'),
  bannerAction: $('bannerAction'),
  bannerClose: $('bannerClose')
};

const state = {
  // { role: 'user', text, content, contextLabel } | { role: 'assistant', text, status?, error?, streaming? }
  messages: [],
  context: null,
  controller: null,
  windowId: null
};

init();

async function init() {
  state.windowId = (await chrome.windows.getCurrent()).id;

  const settings = await getSettings();
  for (const model of MODELS) {
    els.modelSelect.add(new Option(model.label, model.id));
  }
  els.modelSelect.value = settings.model;

  for (const action of QUICK_ACTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = action.label;
    button.title = action.prompt;
    button.addEventListener('click', () => runQuickAction(action));
    els.quickActions.append(button);
  }

  bindEvents();

  const { conversation } = await chrome.storage.session.get('conversation');
  if (Array.isArray(conversation)) state.messages = conversation;
  renderMessages();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.pendingRequest?.newValue) consumePendingRequest();
    if (area === 'local' && changes.model) els.modelSelect.value = changes.model.newValue;
    if (area === 'local' && changes.claudeApiKey?.newValue) hideBanner();
  });

  await consumePendingRequest();
  if (!(await getApiKey())) showMissingKeyBanner();
  els.input.focus();
}

function bindEvents() {
  els.sendButton.addEventListener('click', () => {
    if (state.controller) state.controller.abort();
    else submitInput();
  });
  els.input.addEventListener('keydown', (event) => {
    // 日本語入力の変換確定（isComposing）のEnterでは送信しない
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      submitInput();
    }
  });
  els.input.addEventListener('input', autoResize);
  els.newChatButton.addEventListener('click', newChat);
  els.settingsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());
  els.captureSelectionButton.addEventListener('click', () => attachFromTab('selection'));
  els.capturePageButton.addEventListener('click', () => attachFromTab('page'));
  els.contextClear.addEventListener('click', () => setContext(null));
  els.modelSelect.addEventListener('change', () => chrome.storage.local.set({ model: els.modelSelect.value }));
  els.bannerClose.addEventListener('click', hideBanner);
  els.messages.addEventListener('click', onMessagesClick);
}

// ---- 送信と応答の生成 ----

function submitInput() {
  if (state.controller) return;
  send(els.input.value, state.context);
}

async function send(prompt, context, displayText) {
  if (state.controller) return;
  const question = prompt.trim() || (context ? '上の内容について説明してください。' : '');
  if (!question) return;

  const apiKey = await getApiKey();
  if (!apiKey) {
    showMissingKeyBanner();
    return;
  }

  state.messages.push({
    role: 'user',
    text: displayText ?? question,
    content: buildUserContent(question, context),
    contextLabel: context ? describeContext(context) : null
  });
  els.input.value = '';
  autoResize();
  setContext(null);
  hideBanner();
  await generate(apiKey);
}

async function generate(apiKey) {
  const settings = await getSettings();
  const history = toApiMessages(state.messages);
  const reply = { role: 'assistant', text: '', streaming: true };
  state.messages.push(reply);
  state.controller = new AbortController();
  updateBusy();
  renderMessages();
  scrollToBottom();

  try {
    const { stopReason } = await streamMessage({
      apiKey,
      model: settings.model,
      effort: settings.effort,
      system: buildSystemPrompt(settings),
      messages: history,
      signal: state.controller.signal,
      onText: (text) => {
        reply.text += text;
        scheduleStreamingRender();
      }
    });
    if (stopReason === 'refusal') {
      // 拒否された応答の途中まで出力された部分は使わない
      reply.text = '';
      reply.status = 'refusal';
    } else if (stopReason === 'max_tokens') {
      reply.status = 'max_tokens';
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      reply.status = 'stopped';
    } else {
      reply.status = 'error';
      reply.error = error.message;
    }
  } finally {
    delete reply.streaming;
    state.controller = null;
    updateBusy();
    renderMessages();
    saveConversation();
  }
}

function toApiMessages(messages) {
  return messages
    .filter((m) => m.role === 'user' || (m.text && m.status !== 'error' && m.status !== 'refusal'))
    .map((m) => ({ role: m.role, content: m.role === 'user' ? m.content : m.text }));
}

async function regenerate() {
  const last = state.messages.at(-1);
  if (state.controller || last?.role !== 'assistant') return;
  const apiKey = await getApiKey();
  if (!apiKey) {
    showMissingKeyBanner();
    return;
  }
  state.messages.pop();
  await generate(apiKey);
}

async function runQuickAction(action) {
  if (state.controller) return;
  const extra = els.input.value.trim();
  let context = state.context;
  let prompt = action.prompt;

  if (!context && extra) {
    // 入力欄に貼り付けた文章をそのまま対象にする
    context = { kind: 'text', text: extra };
  } else if (extra) {
    prompt += `\n\n${extra}`;
  }

  if (!context) {
    try {
      context = toContext(await readActiveTab(), 'auto');
    } catch (error) {
      showBanner(error.message);
      return;
    }
  }
  await send(prompt, context, action.label);
}

function newChat() {
  state.controller?.abort();
  state.messages = [];
  setContext(null);
  hideBanner();
  renderMessages();
  saveConversation();
  els.input.focus();
}

function saveConversation() {
  const conversation = state.messages.map(({ streaming, ...message }) => message);
  chrome.storage.session.set({ conversation }).catch((error) => {
    console.warn('会話を保存できませんでした:', error);
  });
}

// ---- ページの読み取り ----

async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('アクティブなタブが見つかりません。');
  if (tab.url && !/^(https?|file):/.test(tab.url)) throw new Error(UNREADABLE_PAGE);

  try {
    return await readTab(tab.id);
  } catch {
    // 拡張機能アイコン以外から開いた場合など、このタブへのアクセス権がないときは許可を求める
  }
  const granted = await chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
  if (!granted) {
    throw new Error('ページを読み取る権限がありません。拡張機能のアイコンをクリックしてから操作するか、権限を許可してください。');
  }
  try {
    return await readTab(tab.id);
  } catch {
    throw new Error(UNREADABLE_PAGE);
  }
}

async function attachFromTab(mode) {
  try {
    setContext(toContext(await readActiveTab(), mode));
    hideBanner();
    els.input.focus();
  } catch (error) {
    showBanner(error.message);
  }
}

async function consumePendingRequest() {
  const { pendingRequest: request } = await chrome.storage.session.get('pendingRequest');
  if (!request || request.windowId !== state.windowId) return;
  await chrome.storage.session.remove('pendingRequest');
  if (Date.now() - request.createdAt > PENDING_TTL_MS) return;

  if (request.error) {
    showBanner(request.error);
    return;
  }
  const action = QUICK_ACTIONS.find((a) => a.id === request.actionId);
  if (action && !state.controller) {
    await send(action.prompt, request.context, action.label);
  } else {
    setContext(request.context);
    els.input.focus();
  }
}

function setContext(context) {
  state.context = context;
  els.contextChip.hidden = !context;
  els.contextLabel.textContent = context ? describeContext(context) : '';
  els.contextLabel.title = context?.url ?? '';
}

function describeContext(context) {
  const chars = `${context.text.length.toLocaleString()}文字`;
  if (context.kind === 'page') {
    return `📄 ${context.title || 'ページ'}（${chars}${context.truncated ? '・長いため先頭のみ' : ''}）`;
  }
  if (context.kind === 'selection') return `✂️ 選択テキスト（${chars}）`;
  return `📝 入力テキスト（${chars}）`;
}

// ---- 表示 ----

const STATUS_NOTES = {
  stopped: '生成を停止しました。',
  max_tokens: '応答が長すぎるため途中で終了しました。「続けて」と送信すると続きを生成します。',
  refusal: 'この依頼には応答できませんでした。内容や表現を変えて試してください。'
};

function renderMessages() {
  els.messages.replaceChildren();
  if (!state.messages.length) {
    els.messages.append(els.emptyStateTemplate.content.cloneNode(true));
    return;
  }
  state.messages.forEach((message, index) => {
    els.messages.append(messageElement(message, index === state.messages.length - 1));
  });
}

function messageElement(message, isLast) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${message.role}`;

  if (message.role === 'user') {
    if (message.contextLabel) {
      const context = document.createElement('div');
      context.className = 'message-context';
      context.textContent = message.contextLabel;
      wrapper.append(context);
    }
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = message.text;
    wrapper.append(bubble);
    return wrapper;
  }

  if (message.streaming && !message.text) {
    const thinking = document.createElement('div');
    thinking.className = 'thinking';
    thinking.textContent = '考え中';
    wrapper.append(thinking);
    return wrapper;
  }

  if (message.text) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble markdown';
    bubble.innerHTML = renderMarkdown(message.text);
    wrapper.append(bubble);
  }

  if (message.status) {
    const note = document.createElement('div');
    note.className = `note${message.status === 'error' ? ' error' : ''}`;
    note.textContent = message.status === 'error' ? message.error : STATUS_NOTES[message.status];
    wrapper.append(note);
  }

  if (!message.streaming) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    if (message.text) {
      actions.append(actionButton('コピー', 'copy'));
    }
    if (isLast) {
      actions.append(actionButton(message.status === 'error' ? '再試行' : '再生成', 'regenerate'));
    }
    wrapper.append(actions);
  }
  return wrapper;
}

function actionButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost-button';
  button.textContent = label;
  button.dataset.action = action;
  return button;
}

let renderScheduled = false;

// ストリーミング中は最後のメッセージだけを描画し直す（1フレームに1回まで）
function scheduleStreamingRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    const atBottom = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 48;
    const last = state.messages.at(-1);
    els.messages.lastElementChild?.replaceWith(messageElement(last, true));
    if (atBottom) scrollToBottom();
  });
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

async function onMessagesClick(event) {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.classList.contains('code-copy')) {
    await copyText(button.closest('pre').querySelector('code').textContent, button);
    return;
  }
  if (button.dataset.action === 'regenerate') {
    regenerate();
    return;
  }
  if (button.dataset.action === 'copy') {
    const index = [...els.messages.children].indexOf(button.closest('.message'));
    await copyText(state.messages[index].text, button);
  }
}

async function copyText(text, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'コピーしました';
  } catch (error) {
    console.error('クリップボードへのコピーに失敗:', error);
    button.textContent = 'コピー失敗';
  }
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

function updateBusy() {
  const busy = Boolean(state.controller);
  els.sendButton.textContent = busy ? '停止' : '送信';
  els.sendButton.classList.toggle('stop', busy);
  for (const chip of els.quickActions.children) chip.disabled = busy;
}

function autoResize() {
  els.input.style.height = 'auto';
  els.input.style.height = `${els.input.scrollHeight + 2}px`;
}

function showBanner(text, action) {
  els.bannerText.textContent = text;
  els.bannerAction.hidden = !action;
  els.bannerAction.textContent = action?.label ?? '';
  els.bannerAction.onclick = action?.onClick ?? null;
  els.banner.hidden = false;
}

function showMissingKeyBanner() {
  showBanner('Claude APIキーが設定されていません。', {
    label: '設定を開く',
    onClick: () => chrome.runtime.openOptionsPage()
  });
}

function hideBanner() {
  els.banner.hidden = true;
}
