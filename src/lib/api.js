// Claude Messages API をブラウザから直接呼び出すクライアント

const API_BASE = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 64000;

// 安全分類器が依頼を断ったとき、サーバー側で推奨モデルに自動で再実行させる（Haikuは非対応）
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

function buildHeaders(apiKey) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true'
  };
}

/**
 * 応答をストリーミングで受け取り、テキストが届くたびに onText を呼ぶ。
 * @returns {Promise<{stopReason: string|null}>}
 */
export async function streamMessage({ apiKey, model, effort, system, messages, signal, onText }) {
  const headers = buildHeaders(apiKey);
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages,
    output_config: { effort },
    stream: true
  };
  if (SERVER_FALLBACK_MODELS.has(model)) {
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }

  const response = await request(`${API_BASE}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  });

  let stopReason = null;
  for await (const event of readServerSentEvents(response.body)) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      onText(event.delta.text);
    } else if (event.type === 'message_delta') {
      stopReason = event.delta?.stop_reason ?? stopReason;
    } else if (event.type === 'error') {
      throw new Error(describeError(event.error?.type, event.error?.message));
    }
  }
  return { stopReason };
}

// 料金のかからないモデル一覧APIでキーの有効性を確認する
export async function verifyApiKey(apiKey) {
  const { 'content-type': _, ...headers } = buildHeaders(apiKey);
  await request(`${API_BASE}/models?limit=1`, { headers });
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('ネットワークに接続できませんでした。インターネット接続を確認してください。');
  }
  if (!response.ok) {
    let type;
    let message;
    try {
      const data = await response.json();
      type = data.error?.type;
      message = data.error?.message;
    } catch {
      // エラー本文がJSONでない場合はステータスコードだけで判断する
    }
    throw new Error(describeError(type, message, response.status));
  }
  return response;
}

async function* readServerSentEvents(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // stream: true でないと、チャンク境界で分断された日本語などのマルチバイト文字が文字化けする
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const event = parseDataLine(line);
        if (event) yield event;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

function parseDataLine(line) {
  if (!line.startsWith('data:')) return null;
  const data = line.slice(5).trim();
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    console.warn('SSEメッセージを解析できませんでした:', data);
    return null;
  }
}

function describeError(type, message, status) {
  if (status === 401 || type === 'authentication_error') {
    return 'APIキーが無効です。設定画面でAPIキーを確認してください。';
  }
  if (status === 403 || type === 'permission_error') {
    return `このAPIキーには利用権限がありません。${message ?? ''}`;
  }
  if (status === 429 || type === 'rate_limit_error') {
    return 'APIの利用上限（レート制限）に達しました。しばらく待ってから再試行してください。';
  }
  if (status === 529 || type === 'overloaded_error') {
    return 'Claudeが混雑しています。少し待ってから再試行してください。';
  }
  if (message) return `APIエラー: ${message}`;
  return `APIエラーが発生しました（HTTP ${status ?? '不明'}）。`;
}
