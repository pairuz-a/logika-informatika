'use strict';

const $ = (s, r = document) => r.querySelector(s);
const LIB_KEY = 'bk:library';
const PREF_KEY = 'bk:prefs';
const PW_KEY = 'bk:pw';
const MAX_LIB = 20;

const state = { providers: [], config: {}, lib: [], current: null, quiz: null, busy: new Set() };

// ---------- util ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function md(src) {
  const inline = (t) =>
    t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, '$1<em>$2</em>');
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of esc(src).split('\n')) {
    const l = raw.trimEnd();
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) {
      closeList();
      const lvl = m[1].length + 1;
      html += `<h${lvl}>${inline(m[2])}</h${lvl}>`;
    } else if ((m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/))) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(m[1])}</li>`;
    } else if (!l.trim()) {
      closeList();
    } else {
      closeList();
      html += `<p>${inline(l)}</p>`;
    }
  }
  closeList();
  return html;
}

function toast(msg, info = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (info ? ' info' : '');
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, info ? 3500 : 8000);
}

async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const pw = localStorage.getItem(PW_KEY);
  if (pw) headers['x-app-password'] = pw;
  let payload;
  if (form) payload = form;
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new Error('Tidak bisa terhubung ke server.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ---------- penyimpanan ----------
function loadLib() {
  try { state.lib = JSON.parse(localStorage.getItem(LIB_KEY)) || []; } catch { state.lib = []; }
}
function saveLib() {
  state.lib = state.lib.slice(0, MAX_LIB);
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(state.lib));
  } catch {
    // penyimpanan penuh: buang materi paling lama lalu coba lagi
    if (state.lib.length > 1) { state.lib.pop(); saveLib(); }
    else toast('Penyimpanan browser penuh, materi ini tidak tersimpan.');
  }
}
function prefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}
function setPref(k, v) {
  localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs(), [k]: v }));
}

// ---------- provider ----------
function fillModels() {
  const p = state.providers.find((x) => x.id === $('#provider').value);
  const sel = $('#model');
  sel.innerHTML = '';
  for (const m of p?.models || []) sel.add(new Option(m, m));
  const saved = prefs().model;
  if (saved && p?.models.includes(saved)) sel.value = saved;
}

async function initProviders() {
  state.providers = await api('/api/providers');
  const sel = $('#provider');
  sel.innerHTML = '';
  for (const p of state.providers) sel.add(new Option(p.label, p.id));
  if (!state.providers.length) {
    toast('Belum ada provider. Isi API key di file .env lalu restart server.');
    return;
  }
  const saved = prefs().provider;
  if (saved && state.providers.some((p) => p.id === saved)) sel.value = saved;
  fillModels();
  $('#lang').value = prefs().lang || 'id';
}

const ai = () => ({ provider: $('#provider').value, model: $('#model').value, lang: $('#lang').value });

// ---------- tampilan ----------
function show(view) {
  $('#intake').hidden = view !== 'intake';
  $('#work').hidden = view !== 'work';
}

function renderLib() {
  const ul = $('#libList');
  ul.innerHTML = '';
  $('#libEmpty').hidden = state.lib.length > 0;
  for (const m of state.lib) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = state.current?.id === m.id ? 'on' : '';
    b.innerHTML = `<span class="t">${esc(m.title)}</span><span class="d">${new Date(m.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>`;
    b.onclick = () => open(m.id);
    li.append(b);
    ul.append(li);
  }
}

function open(id) {
  const m = state.lib.find((x) => x.id === id);
  if (!m) return;
  state.current = m;
  state.quiz = null;
  $('#mTitle').textContent = m.title;
  $('#mMeta').textContent =
    `${m.text.length.toLocaleString('id-ID')} karakter` + (m.truncated ? ` (dipotong dari ${m.originalChars.toLocaleString('id-ID')})` : '');
  show('work');
  renderLib();
  renderAll();
  setTab('summary');
}

function setTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  for (const n of ['summary', 'cards', 'quiz', 'chat']) $(`#pane-${n}`).hidden = n !== name;
}

function renderAll() {
  renderSummary();
  renderCards();
  renderQuiz();
  renderChat();
}

function emptyBlock(pane, text, label, onClick, extra = '') {
  pane.innerHTML = `<div class="empty"><p>${esc(text)}</p>${extra}<button class="btn primary">${esc(label)}</button></div>`;
  $('button', pane).onclick = onClick;
}

function loadingBlock(pane, text) {
  pane.innerHTML = `<p class="loading">${esc(text)}</p>`;
}

// ---------- generate ----------
async function generate(kind, count) {
  const m = state.current;
  if (!m || state.busy.has(kind)) return;
  state.busy.add(kind);
  const paneName = { summary: 'summary', flashcards: 'cards', quiz: 'quiz' }[kind];
  loadingBlock($(`#pane-${paneName}`), 'Lagi dibuatin, tunggu sebentar');
  try {
    const { result } = await api('/api/generate', { method: 'POST', body: { ...ai(), kind, count, text: m.text } });
    if (kind === 'summary') m.summary = result;
    if (kind === 'flashcards') { m.cards = result; m.known = []; m.cardIdx = 0; }
    if (kind === 'quiz') { m.quizData = result; state.quiz = null; }
    saveLib();
  } catch (e) {
    toast(e.message);
  } finally {
    state.busy.delete(kind);
    if (state.current?.id === m.id) renderAll();
  }
}

// ---------- ringkasan ----------
function renderSummary() {
  const m = state.current;
  const pane = $('#pane-summary');
  if (state.busy.has('summary')) return loadingBlock(pane, 'Lagi dibuatin, tunggu sebentar');
  if (!m.summary) return emptyBlock(pane, 'Ringkasan belum dibuat.', 'Buat ringkasan', () => generate('summary'));
  pane.innerHTML = `<div class="md">${md(m.summary)}</div><div class="row end"><button class="btn small" id="reSum">Buat ulang</button></div>`;
  $('#reSum').onclick = () => generate('summary');
}

// ---------- flashcard ----------
const countPicker = (id, opts, def) =>
  `<p class="muted small">Jumlah <select id="${id}">${opts.map((n) => `<option ${n === def ? 'selected' : ''}>${n}</option>`).join('')}</select></p>`;

function renderCards() {
  const m = state.current;
  const pane = $('#pane-cards');
  if (state.busy.has('flashcards')) return loadingBlock(pane, 'Lagi dibuatin, tunggu sebentar');
  if (!m.cards?.length) {
    return emptyBlock(pane, 'Flashcard belum dibuat.', 'Buat flashcard',
      () => generate('flashcards', Number($('#cardCount').value)), countPicker('cardCount', [10, 15, 25, 40], 15));
  }
  m.known = m.known || [];
  m.cardIdx = Math.min(m.cardIdx || 0, m.cards.length - 1);
  const c = m.cards[m.cardIdx];
  const done = m.known.length;
  pane.innerHTML = `
    <div class="row between small muted"><span>Kartu ${m.cardIdx + 1} / ${m.cards.length}</span><span>${done} sudah hafal</span></div>
    <div class="progress"><i style="width:${(done / m.cards.length) * 100}%"></i></div>
    <div class="flash"><div class="flip" id="flip" tabindex="0" role="button" aria-label="Balik kartu">
      <div class="face"><small>Pertanyaan</small><div>${esc(c.front)}</div></div>
      <div class="face b"><small>Jawaban</small><div>${esc(c.back)}</div></div>
    </div></div>
    <p class="muted small" style="text-align:center">Klik kartu untuk membalik</p>
    <div class="row between">
      <div class="row"><button class="btn" id="prev">←</button><button class="btn" id="next">→</button></div>
      <div class="row">
        <button class="btn" id="notYet">Belum</button>
        <button class="btn primary" id="know">Sudah hafal</button>
      </div>
    </div>
    <div class="row end"><button class="btn small ghost" id="shuf">Acak</button><button class="btn small ghost" id="reset">Reset progres</button><button class="btn small" id="reCards">Buat ulang</button></div>`;
  const flip = $('#flip');
  const toggle = () => flip.classList.toggle('back');
  flip.onclick = toggle;
  flip.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
  const go = (d) => { m.cardIdx = (m.cardIdx + d + m.cards.length) % m.cards.length; saveLib(); renderCards(); };
  $('#prev').onclick = () => go(-1);
  $('#next').onclick = () => go(1);
  $('#know').onclick = () => { if (!m.known.includes(m.cardIdx)) m.known.push(m.cardIdx); go(1); };
  $('#notYet').onclick = () => { m.known = m.known.filter((i) => i !== m.cardIdx); go(1); };
  $('#reset').onclick = () => { m.known = []; m.cardIdx = 0; saveLib(); renderCards(); };
  $('#shuf').onclick = () => {
    for (let i = m.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [m.cards[i], m.cards[j]] = [m.cards[j], m.cards[i]];
    }
    m.known = []; m.cardIdx = 0; saveLib(); renderCards();
  };
  $('#reCards').onclick = () => generate('flashcards', m.cards.length);
}

// ---------- kuis ----------
function renderQuiz() {
  const m = state.current;
  const pane = $('#pane-quiz');
  if (state.busy.has('quiz')) return loadingBlock(pane, 'Lagi dibuatin, tunggu sebentar');
  if (!m.quizData?.length) {
    return emptyBlock(pane, 'Kuis belum dibuat.', 'Buat kuis',
      () => generate('quiz', Number($('#quizCount').value)), countPicker('quizCount', [5, 10, 20, 30], 10));
  }
  const qz = (state.quiz ||= { i: 0, score: 0, picked: null });
  const qs = m.quizData;

  if (qz.i >= qs.length) {
    const pct = Math.round((qz.score / qs.length) * 100);
    pane.innerHTML = `<div class="empty"><p>Selesai!</p><div class="score">${qz.score} / ${qs.length}</div><p>${pct}% benar</p>
      <div class="row" style="justify-content:center"><button class="btn primary" id="again">Ulangi</button><button class="btn" id="reQuiz">Buat soal baru</button></div></div>`;
    $('#again').onclick = () => { state.quiz = null; renderQuiz(); };
    $('#reQuiz').onclick = () => generate('quiz', qs.length);
    return;
  }

  const q = qs[qz.i];
  const answered = qz.picked !== null;
  pane.innerHTML = `
    <div class="row between small muted"><span>Soal ${qz.i + 1} / ${qs.length}</span><span>Skor ${qz.score}</span></div>
    <div class="progress"><i style="width:${(qz.i / qs.length) * 100}%"></i></div>
    <div class="q">${esc(q.question)}</div>
    <div class="opts">${q.options.map((o, i) => {
      let cls = 'opt';
      if (answered) cls += i === q.answer ? ' ok' : i === qz.picked ? ' no' : '';
      return `<button class="${cls}" data-i="${i}" ${answered ? 'disabled' : ''}>${String.fromCharCode(65 + i)}. ${esc(o)}</button>`;
    }).join('')}</div>
    ${answered ? `<div class="expl"><strong>${qz.picked === q.answer ? 'Benar!' : 'Kurang tepat.'}</strong> ${esc(q.explanation || '')}</div>
      <div class="row end"><button class="btn primary" id="nextQ">${qz.i + 1 === qs.length ? 'Lihat skor' : 'Lanjut'}</button></div>` : ''}`;
  pane.querySelectorAll('.opt').forEach((b) => {
    b.onclick = () => {
      qz.picked = Number(b.dataset.i);
      if (qz.picked === q.answer) qz.score++;
      renderQuiz();
    };
  });
  const nx = $('#nextQ');
  if (nx) nx.onclick = () => { qz.i++; qz.picked = null; renderQuiz(); };
}

// ---------- tutor ----------
function renderChat() {
  const m = state.current;
  const pane = $('#pane-chat');
  m.chat = m.chat || [];
  pane.innerHTML = `
    <div class="msgs" id="msgs">${m.chat.length ? '' : '<p class="muted">Tanya apa saja soal materi ini. Misalnya: "Jelasin konsep X pakai contoh" atau "Bedanya A sama B apa?"</p>'}</div>
    <div class="chatbar"><textarea id="ask" class="input" rows="2" placeholder="Tulis pertanyaan…"></textarea><button class="btn primary" id="send">Kirim</button></div>`;
  const box = $('#msgs');
  for (const msg of m.chat) {
    const d = document.createElement('div');
    d.className = `msg ${msg.role}`;
    d.innerHTML = msg.role === 'assistant' ? md(msg.content) : esc(msg.content);
    box.append(d);
  }
  box.scrollTop = box.scrollHeight;

  const send = async () => {
    const ta = $('#ask');
    const text = ta.value.trim();
    if (!text || state.busy.has('chat')) return;
    state.busy.add('chat');
    m.chat.push({ role: 'user', content: text });
    ta.value = '';
    renderChat();
    $('#send').disabled = true;
    const wait = document.createElement('div');
    wait.className = 'msg assistant loading';
    wait.textContent = 'Mikir dulu';
    $('#msgs').append(wait);
    $('#msgs').scrollTop = $('#msgs').scrollHeight;
    try {
      const { reply } = await api('/api/chat', { method: 'POST', body: { ...ai(), text: m.text, messages: m.chat } });
      m.chat.push({ role: 'assistant', content: reply });
      m.chat = m.chat.slice(-40);
      saveLib();
    } catch (e) {
      toast(e.message);
      m.chat.pop(); // batalkan pesan user yang gagal dijawab
      ta.value = text;
    } finally {
      state.busy.delete('chat');
      if (state.current?.id === m.id) { renderChat(); if (ta.value) $('#ask').value = ta.value; }
    }
  };
  $('#send').onclick = send;
  $('#ask').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
}

// ---------- intake ----------
async function processMaterial() {
  const file = $('#file').files[0];
  const text = $('#paste').value.trim();
  if (!file && !text) return toast('Pilih file atau paste teks dulu.');

  const btn = $('#goBtn');
  btn.disabled = true;
  btn.textContent = 'Membaca materi…';
  try {
    let data;
    if (file) {
      const form = new FormData();
      form.append('file', file);
      data = await api('/api/extract', { method: 'POST', form });
    } else {
      data = await api('/api/extract', { method: 'POST', body: { text, title: text.split('\n')[0].slice(0, 60) } });
    }
    const m = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      title: data.title, text: data.text, truncated: data.truncated, originalChars: data.originalChars,
      createdAt: Date.now(), summary: '', cards: [], known: [], cardIdx: 0, quizData: [], chat: [],
    };
    state.lib.unshift(m);
    saveLib();
    resetIntake();
    open(m.id);
    if (m.truncated) toast(`Materi panjang, hanya ${m.text.length.toLocaleString('id-ID')} karakter pertama yang dipakai.`, true);
    generate('summary');
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Proses materi';
  }
}

function resetIntake() {
  $('#file').value = '';
  $('#paste').value = '';
  $('#dropText').textContent = 'Klik atau seret file ke sini';
}

// ---------- init ----------
function bind() {
  $('#provider').onchange = () => { setPref('provider', $('#provider').value); fillModels(); };
  $('#model').onchange = () => setPref('model', $('#model').value);
  $('#lang').onchange = () => setPref('lang', $('#lang').value);
  $('#pw').onchange = () => localStorage.setItem(PW_KEY, $('#pw').value);
  $('#newBtn').onclick = () => { state.current = null; show('intake'); renderLib(); };
  $('#goBtn').onclick = processMaterial;
  $('#delBtn').onclick = () => {
    if (!state.current || !confirm('Hapus materi ini dari riwayat?')) return;
    state.lib = state.lib.filter((x) => x.id !== state.current.id);
    state.current = null;
    saveLib();
    renderLib();
    show('intake');
  };
  document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => setTab(t.dataset.tab); });

  const file = $('#file');
  const drop = $('#drop');
  file.onchange = () => { if (file.files[0]) $('#dropText').textContent = file.files[0].name; };
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => {
    if (e.dataTransfer.files[0]) { file.files = e.dataTransfer.files; file.onchange(); }
  });
}

(async function init() {
  bind();
  loadLib();
  renderLib();
  try {
    state.config = await api('/api/config');
    if (state.config.passwordRequired) {
      const pw = $('#pw');
      pw.hidden = false;
      pw.value = localStorage.getItem(PW_KEY) || '';
    }
    await initProviders();
  } catch (e) {
    toast(e.message);
  }
  show('intake');
})();
