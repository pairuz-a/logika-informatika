import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProviders, chat, ProviderError } from './providers.js';
import { extractFile, clean, ExtractError } from './extract.js';
import { buildGenerate, buildChat, parseJsonLoose, normalizeFlashcards, normalizeQuiz } from './prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_CHARS = Number(process.env.MAX_MATERIAL_CHARS) || 60000;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN) || 20;
const APP_PASSWORD = process.env.APP_PASSWORD || '';

const providers = loadProviders();
if (!Object.keys(providers).length) {
  console.warn('\n[!] Belum ada provider yang valid. Salin .env.example ke .env lalu isi API key.\n');
}

const app = express();
// Render (dan hosting lain) menaruh app di belakang reverse proxy.
// Tanpa ini, req.ip selalu IP proxy dan rate limit jadi satu bucket untuk semua user.
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ---------- helper ----------
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    res.status(status).json({ error: e.message || 'Terjadi kesalahan' });
  });

function bad(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function pickProvider(body) {
  const p = providers[body?.provider];
  if (!p) throw bad('Provider tidak dikenal. Pilih provider yang tersedia.');
  const model = body?.model || p.models[0];
  if (!p.models.includes(model)) throw bad('Model tidak tersedia untuk provider ini.');
  return { p, model };
}

function prepareText(raw) {
  const text = clean(raw);
  if (text.length < 20) throw bad('Materi terlalu pendek.');
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}

// ---------- auth & rate limit ----------
app.get('/api/config', (_req, res) => {
  res.json({ passwordRequired: Boolean(APP_PASSWORD), maxChars: MAX_CHARS });
});

app.use('/api', (req, res, next) => {
  if (APP_PASSWORD && req.get('x-app-password') !== APP_PASSWORD) {
    return res.status(401).json({ error: 'Password salah atau belum diisi.' });
  }
  next();
});

const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
  if (list.length >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Kebanyakan permintaan. Tunggu sebentar lalu coba lagi.' });
  }
  list.push(now);
  hits.set(req.ip, list);
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < 60000)) hits.delete(ip);
}, 60000).unref();

// ---------- endpoint ----------
app.get('/api/providers', (_req, res) => {
  res.json(Object.values(providers).map(({ id, label, type, models }) => ({ id, label, type, models })));
});

app.post('/api/extract', rateLimit, upload.single('file'), wrap(async (req, res) => {
  let result;
  if (req.file) {
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    result = await extractFile(req.file.buffer, name);
  } else if (req.body?.text) {
    result = { title: String(req.body.title || 'Catatan').slice(0, 80), text: clean(req.body.text) };
  } else {
    throw bad('Kirim file atau teks.');
  }

  const full = result.text;
  const text = prepareText(full);
  res.json({ title: result.title, text, chars: text.length, truncated: full.length > text.length, originalChars: full.length });
}));

app.post('/api/generate', rateLimit, wrap(async (req, res) => {
  const { kind, lang } = req.body || {};
  if (!['summary', 'flashcards', 'quiz'].includes(kind)) throw bad('kind harus summary, flashcards, atau quiz.');
  const { p, model } = pickProvider(req.body);
  const text = prepareText(req.body.text);
  const defaults = { flashcards: 15, quiz: 10 };
  const maxes = { flashcards: 40, quiz: 30 };
  const count = Math.min(Math.max(parseInt(req.body.count, 10) || defaults[kind] || 0, 1), maxes[kind] || 1);

  const messages = buildGenerate(kind, { text, count, lang });
  const raw = await chat(p, model, messages, { json: kind !== 'summary', kind, temperature: kind === 'summary' ? 0.3 : 0.5 });

  try {
    if (kind === 'summary') return res.json({ result: raw.trim() });
    const data = parseJsonLoose(raw);
    return res.json({ result: kind === 'flashcards' ? normalizeFlashcards(data) : normalizeQuiz(data) });
  } catch (e) {
    throw new ProviderError(`Model belum menghasilkan format yang benar (${e.message}). Coba lagi atau ganti model.`);
  }
}));

app.post('/api/chat', rateLimit, wrap(async (req, res) => {
  const { p, model } = pickProvider(req.body);
  const text = prepareText(req.body.text);
  const history = (Array.isArray(req.body.messages) ? req.body.messages : [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== 'user') throw bad('Pesan terakhir harus dari user.');

  const reply = await chat(p, model, buildChat({ text, history, lang: req.body.lang }), { kind: 'chat', temperature: 0.5 });
  res.json({ reply: reply.trim() });
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ada' }));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File terlalu besar (maks 20 MB).' : err.message });
  }
  if (err instanceof ExtractError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan' });
});

app.listen(PORT, () => {
  console.log(`Belajarin Kos jalan di http://localhost:${PORT}`);
  console.log(`Provider aktif: ${Object.keys(providers).join(', ') || '(belum ada)'}`);
});
