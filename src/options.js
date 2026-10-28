import { MODELS, EFFORTS, LANGUAGES, getSettings, getApiKey } from './lib/settings.js';
import { verifyApiKey } from './lib/api.js';

const $ = (id) => document.getElementById(id);
const apiKeyInput = $('apiKey');
const toggleKeyButton = $('toggleKeyButton');
const testKeyButton = $('testKeyButton');
const modelSelect = $('model');
const effortSelect = $('effort');
const languageSelect = $('language');
const customInstructionsInput = $('customInstructions');
const saveButton = $('saveButton');
const messageDiv = $('message');

let messageTimer;

init();

async function init() {
  fillOptions(modelSelect, MODELS.map((m) => ({ id: m.id, label: m.description })));
  fillOptions(effortSelect, EFFORTS);
  fillOptions(languageSelect, LANGUAGES);

  const settings = await getSettings();
  apiKeyInput.value = await getApiKey();
  modelSelect.value = settings.model;
  effortSelect.value = settings.effort;
  languageSelect.value = settings.language;
  customInstructionsInput.value = settings.customInstructions;

  toggleKeyButton.addEventListener('click', () => {
    const hidden = apiKeyInput.type === 'password';
    apiKeyInput.type = hidden ? 'text' : 'password';
    toggleKeyButton.textContent = hidden ? '隠す' : '表示';
  });
  testKeyButton.addEventListener('click', testKey);
  saveButton.addEventListener('click', save);
  $('shortcutsLink').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

function fillOptions(select, options) {
  for (const option of options) select.add(new Option(option.label, option.id));
}

async function testKey() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showMessage('APIキーを入力してください', 'error');
    return;
  }
  testKeyButton.disabled = true;
  try {
    await verifyApiKey(apiKey);
    showMessage('接続に成功しました。このAPIキーは使用できます', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    testKeyButton.disabled = false;
  }
}

async function save() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showMessage('APIキーを入力してください', 'error');
    return;
  }
  await chrome.storage.local.set({
    claudeApiKey: apiKey,
    model: modelSelect.value,
    effort: effortSelect.value,
    language: languageSelect.value,
    customInstructions: customInstructionsInput.value.trim()
  });
  showMessage('設定を保存しました', 'success');
}

function showMessage(text, type) {
  clearTimeout(messageTimer);
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.hidden = false;
  messageTimer = setTimeout(() => {
    messageDiv.hidden = true;
  }, 4000);
}
