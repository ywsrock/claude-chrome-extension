document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('saveButton');
  const messageDiv = document.getElementById('message');

  // 保存されたAPIキーを読み込む
  chrome.storage.sync.get(['claudeApiKey'], function(result) {
    if (result.claudeApiKey) {
      apiKeyInput.value = result.claudeApiKey;
    }
  });

  // 保存ボタンのクリックイベント
  saveButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showMessage('APIキーを入力してください', 'error');
      return;
    }

    // APIキーを保存
    chrome.storage.sync.set({
      claudeApiKey: apiKey
    }, function() {
      showMessage('設定を保存しました', 'success');
    });
  });

  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 3000);
  }
});
