import 'dotenv/config';

const DEFAULT_GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

/**
 * Baca daftar provider dari environment.
 *
 * PROVIDERS=cosmos,mobius,gemini
 * COSMOS_TYPE=openai            # openai (default) | gemini
 * COSMOS_LABEL=CosmosHub
 * COSMOS_BASE_URL=https://.../v1
 * COSMOS_API_KEY=...
 * COSMOS_MODELS=model-a,model-b
 */
export function loadProviders(env = process.env) {
  const ids = (env.PROVIDERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const out = {};

  for (const id of ids) {
    const P = id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const type = (env[`${P}_TYPE`] || 'openai').toLowerCase();
    const models = (env[`${P}_MODELS`] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const baseUrl = (env[`${P}_BASE_URL`] || (type === 'gemini' ? DEFAULT_GEMINI_BASE : '')).replace(/\/+$/, '');
    const apiKey = env[`${P}_API_KEY`] || '';

    if (type !== 'openai' && type !== 'gemini' && type !== 'mock') {
      console.warn(`[providers] "${id}" dilewati: ${P}_TYPE harus openai atau gemini`);
      continue;
    }
    if (type !== 'mock') {
      if (!apiKey) { console.warn(`[providers] "${id}" dilewati: ${P}_API_KEY kosong`); continue; }
      if (type === 'openai' && !baseUrl) { console.warn(`[providers] "${id}" dilewati: ${P}_BASE_URL kosong`); continue; }
      if (!models.length) { console.warn(`[providers] "${id}" dilewati: ${P}_MODELS kosong`); continue; }
    }

    out[id] = {
      id,
      label: env[`${P}_LABEL`] || id,
      type,
      baseUrl,
      apiKey,
      models: models.length ? models : ['mock'],
    };
  }
  return out;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('');
  return '';
}

async function post(url, headers, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* bukan JSON */ }
    if (!res.ok) {
      const detail = data?.error?.message || data?.message || raw.slice(0, 200) || res.statusText;
      throw new ProviderError(`Provider membalas ${res.status}: ${detail}`, res.status === 429 ? 429 : 502);
    }
    if (!data) throw new ProviderError('Provider membalas dengan format yang tidak dikenali');
    return data;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e.name === 'AbortError') throw new ProviderError('Provider kelamaan merespons (timeout)', 504);
    throw new ProviderError(`Gagal menghubungi provider: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function chatOpenAI(p, model, messages, { temperature, timeoutMs }) {
  const data = await post(
    `${p.baseUrl}/chat/completions`,
    { Authorization: `Bearer ${p.apiKey}` },
    { model, messages, temperature },
    timeoutMs,
  );
  const text = textOf(data?.choices?.[0]?.message?.content);
  if (!text) throw new ProviderError('Provider tidak mengirim isi jawaban');
  return text;
}

async function chatGemini(p, model, messages, { temperature, json, timeoutMs }) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = {
    contents,
    generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const data = await post(
    `${p.baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': p.apiKey },
    body,
    timeoutMs,
  );
  const text = (data?.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
  if (!text) {
    const why = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || 'kosong';
    throw new ProviderError(`Gemini tidak mengirim jawaban (${why})`);
  }
  return text;
}

// Provider tiruan untuk uji coba tanpa API key (PROVIDERS=mock, MOCK_TYPE=mock)
function chatMock(kind) {
  if (kind === 'flashcards') {
    return JSON.stringify([
      { front: 'Apa itu X?', back: 'Jawaban X (contoh).' },
      { front: 'Apa itu Y?', back: 'Jawaban Y (contoh).' },
    ]);
  }
  if (kind === 'quiz') {
    return '```json\n' + JSON.stringify([
      { question: 'Contoh soal 1?', options: ['A', 'B', 'C', 'D'], answer: 1, explanation: 'Karena B benar.' },
      { question: 'Contoh soal 2?', options: ['A', 'B', 'C', 'D'], answer: 0, explanation: 'Karena A benar.' },
    ]) + '\n```';
  }
  if (kind === 'summary') return '## Ringkasan\n\n- **Poin 1** contoh\n- Poin 2 contoh';
  return 'Ini jawaban contoh dari provider tiruan.';
}

export async function chat(provider, model, messages, opts = {}) {
  const o = { temperature: 0.4, json: false, timeoutMs: 120000, ...opts };
  if (provider.type === 'mock') return chatMock(o.kind);
  if (provider.type === 'gemini') return chatGemini(provider, model, messages, o);
  return chatOpenAI(provider, model, messages, o);
}
