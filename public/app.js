/* =========================================================
   Belajar Logika — ruang belajar untuk 2 materi
   Ringkasan, flashcard, kuis, tutor lokal, dan slide asli.
   ========================================================= */

const STORE = 'belajarin-logika-v1';
const DEFAULT_TAB = 'ringkasan';
const SOFT = {
  'semantic-tree': '#dff3ee',
  substitusi: '#eee7ff',
};

const TABS = [
  { id: 'ringkasan', label: 'Ringkasan', icon: icon('book') },
  { id: 'flashcards', label: 'Flashcard', icon: icon('cards') },
  { id: 'kuis', label: 'Kuis', icon: icon('quiz') },
  { id: 'tutor', label: 'Tutor', icon: icon('chat') },
  { id: 'slide', label: 'Slide', icon: icon('layers') },
];

const ui = {
  flash: {},
  quiz: {},
  chat: {},
  pendingAsk: null,
  lightbox: null,
};

let DATA = null;
let progress = loadProgress();
let lastRouteKey = '';

/* ---------------------------------------------------------
   Boot + routing
   --------------------------------------------------------- */

boot();

async function boot() {
  try {
    const res = await fetch('materials.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
    if (!DATA?.materials?.length) throw new Error('Materi kosong');
  } catch (err) {
    document.querySelector('#app').innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">Gagal memuat</p>
        <h1>Materi belum bisa dibuka</h1>
        <p>Pastikan file <code>public/materials.json</code> ada, lalu muat ulang halaman.</p>
        <button class="btn btn-primary" onclick="location.reload()">Muat ulang</button>
      </div>`;
    console.error(err);
    return;
  }

  renderSidebar();
  render();
  window.addEventListener('hashchange', render);
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKey);
}

function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [kind, id, tab] = raw.split('/');
  if (kind === 'materi' && id && DATA.materials.some((m) => m.id === id)) {
    return {
      name: 'material',
      id,
      tab: TABS.some((t) => t.id === tab) ? tab : DEFAULT_TAB,
    };
  }
  return { name: 'home' };
}

const material = (id) => DATA.materials.find((m) => m.id === id);
const routeKey = (r) => (r.name === 'home' ? 'home' : `${r.id}/${r.tab}`);
const accStyle = (m) => `--accent:${m.accent};--accent-soft:${SOFT[m.id] || '#eef1ef'}`;

function render() {
  const r = route();
  const app = document.querySelector('#app');
  const m = r.name === 'material' ? material(r.id) : null;

  app.innerHTML = r.name === 'home' ? homeView() : materialView(m, r.tab);
  renderSidebar(r);

  document.title =
    r.name === 'home'
      ? 'Belajar Logika — Semantic Tree & Substitusi'
      : `${m.title} · ${TABS.find((t) => t.id === r.tab).label} — Belajar Logika`;

  if (r.name === 'material') {
    progress.lastMaterial = r.id;
    progress.lastTab = r.tab;
    saveProgress();
  }

  const key = routeKey(r);
  if (key !== lastRouteKey) {
    window.scrollTo(0, 0);
    lastRouteKey = key;
  }

  requestAnimationFrame(() => {
    app.classList.remove('view-in');
    void app.offsetWidth;
    app.classList.add('view-in');
  });

  if (r.name === 'material' && r.tab === 'tutor') afterTutorRender(m);
}

function refreshTab() {
  const r = route();
  if (r.name !== 'material') return;
  const m = material(r.id);
  const panel = document.querySelector('.tab-panel');
  if (!panel) return;
  panel.innerHTML = tabContent(m, r.tab);
  renderSidebar(r);
  if (r.tab === 'tutor') afterTutorRender(m);
}

/* ---------------------------------------------------------
   Progress
   --------------------------------------------------------- */

function loadProgress() {
  const base = { cards: {}, quiz: {}, lastMaterial: null, lastTab: null };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    return {
      ...base,
      ...saved,
      cards: saved.cards && typeof saved.cards === 'object' ? saved.cards : {},
      quiz: saved.quiz && typeof saved.quiz === 'object' ? saved.quiz : {},
    };
  } catch {
    return base;
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORE, JSON.stringify(progress));
  } catch {
    /* storage penuh / mode privat — abaikan */
  }
}

function isMastered(m, i) {
  return Boolean(progress.cards[m.id]?.[i]);
}

function countMastered(m) {
  return m.cards.reduce((n, _, i) => n + (isMastered(m, i) ? 1 : 0), 0);
}

function bestScore(m) {
  const b = progress.quiz[m.id]?.best;
  return Number.isFinite(b) ? b : null;
}

function pctFor(m) {
  const cardPart = m.cards.length ? countMastered(m) / m.cards.length : 0;
  const best = (bestScore(m) ?? 0) / 100;
  return Math.round((cardPart * 0.65 + best * 0.35) * 100);
}

function totals() {
  let cards = 0;
  let mastered = 0;
  let slides = 0;
  let quiz = 0;
  let attempts = 0;
  let pct = 0;
  for (const m of DATA.materials) {
    cards += m.cards.length;
    mastered += countMastered(m);
    slides += m.slides;
    quiz += m.quiz.length;
    attempts += progress.quiz[m.id]?.attempts || 0;
    pct += pctFor(m);
  }
  return {
    cards,
    mastered,
    slides,
    quiz,
    attempts,
    pct: Math.round(pct / DATA.materials.length),
    topics: DATA.materials.reduce((n, m) => n + m.tutor.length, 0),
  };
}

/* ---------------------------------------------------------
   Sidebar
   --------------------------------------------------------- */

function renderSidebar(r = route()) {
  const nav = document.querySelector('#sidebar-materials');
  const mobile = document.querySelector('#mobile-materials');

  if (nav) {
    nav.innerHTML = DATA.materials
      .map((m) => {
        const active = r.name === 'material' && r.id === m.id;
        return `
          <a class="side-link side-material ${active ? 'is-active' : ''}" href="#/materi/${m.id}" style="${accStyle(m)}">
            <span class="side-num">${String(m.order).padStart(2, '0')}</span>
            <span class="side-main">${esc(shortNavTitle(m))}<small>${pctFor(m)}% selesai</small></span>
            <span class="side-dot" aria-hidden="true"></span>
          </a>`;
      })
      .join('');
  }

  const homeLink = document.querySelector('[data-nav="home"]');
  if (homeLink) homeLink.classList.toggle('is-active', r.name === 'home');

  if (mobile) {
    mobile.innerHTML = DATA.materials
      .map((m) => {
        const active = r.name === 'material' && r.id === m.id;
        return `<a class="mobile-chip ${active ? 'is-active' : ''}" href="#/materi/${m.id}" style="${accStyle(m)}">${esc(shortNavTitle(m))}</a>`;
      })
      .join('');
  }

  const t = totals();
  const box = document.querySelector('#sidebar-progress');
  if (box) {
    box.innerHTML = `
      <div class="sp-card">
        <div class="sp-top"><span>Progres keseluruhan</span><strong>${t.pct}%</strong></div>
        <div class="bar"><i style="width:${t.pct}%"></i></div>
        <p>${t.mastered} dari ${t.cards} kartu dikuasai${t.attempts ? ` · ${t.attempts} percobaan kuis` : ''}</p>
      </div>`;
  }
}

function shortNavTitle(m) {
  if (m.title.includes('&')) return m.title.split('&')[0].trim();
  return m.title;
}

/* ---------------------------------------------------------
   Home
   --------------------------------------------------------- */

function homeView() {
  const t = totals();
  const last = progress.lastMaterial ? material(progress.lastMaterial) : null;
  const target = last ? `#/materi/${last.id}/${progress.lastTab || DEFAULT_TAB}` : '#/materi/semantic-tree';
  const lastLabel = last ? `Lanjutkan ${TABS.find((x) => x.id === (progress.lastTab || DEFAULT_TAB)).label.toLowerCase()}` : 'Mulai belajar';

  return `
    <section class="hero">
      <div class="hero-copy reveal">
        <p class="eyebrow"><span class="eyebrow-dot"></span> Logika Informatika · 2 materi</p>
        <h1>Dua materi.<br /><em>Satu alur</em><br />belajar.</h1>
        <p class="hero-lead">
          Semantic Tree &amp; Proof by Falsification, lalu Substitusi. Semuanya sudah dipecah
          jadi ringkasan, flashcard, kuis, dan tutor yang menjawab dari slide kuliahmu.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="${target}">${lastLabel} <span aria-hidden="true">→</span></a>
          <button class="btn btn-ghost btn-lg" type="button" data-scroll="materi">Lihat materi</button>
        </div>
        <ul class="hero-points">
          <li>${icon('check')} Ringkasan padat</li>
          <li>${icon('check')} ${t.cards} flashcard</li>
          <li>${icon('check')} ${t.quiz} soal kuis</li>
          <li>${icon('check')} ${t.slides} slide asli</li>
        </ul>
      </div>

      <div class="hero-art reveal" style="--delay:.12s" aria-hidden="true">
        <div class="art-card">
          <div class="art-head">
            <span class="art-title">Contoh pohon semantik</span>
            <span class="art-badge">E = ¬R → (¬R ∧ Q)</span>
          </div>
          <svg class="tree-art" viewBox="0 0 340 250">
            <g stroke="#cdc7b7" stroke-width="2" stroke-linecap="round">
              <path d="M170 46 L96 118" />
              <path d="M170 46 L248 118" />
              <path d="M248 118 L196 200" />
              <path d="M248 118 L300 200" />
            </g>
            <g font-size="11" font-weight="700" fill="#8b948e" font-family="inherit">
              <text x="112" y="76">T</text>
              <text x="218" y="76">F</text>
              <text x="208" y="166">T</text>
              <text x="286" y="166">F</text>
            </g>
            <g font-family="inherit" text-anchor="middle" font-weight="700">
              <circle cx="170" cy="42" r="26" fill="#16231f" />
              <text x="170" y="47" fill="#fffdf8" font-size="15">R</text>
              <circle cx="94" cy="124" r="23" fill="#0f766e" />
              <text x="94" y="129" fill="#fffdf8" font-size="14">T</text>
              <circle cx="250" cy="124" r="23" fill="#fffdf8" stroke="#16231f" stroke-width="2" />
              <text x="250" y="129" fill="#16231f" font-size="14">Q</text>
              <circle cx="194" cy="206" r="23" fill="#0f766e" />
              <text x="194" y="211" fill="#fffdf8" font-size="14">T</text>
              <circle cx="302" cy="206" r="23" fill="#d94f4f" />
              <text x="302" y="211" fill="#fffdf8" font-size="14">F</text>
            </g>
          </svg>
          <div class="art-foot">
            <span><i class="legend t"></i>true</span>
            <span><i class="legend f"></i>false</span>
            <span class="art-foot-note">3 jalur · 3 daun</span>
          </div>
        </div>
        <div class="float-card float-a"><strong>Satisfiable</strong><span>ada daun T</span></div>
        <div class="float-card float-b"><span class="fc-arrow">◀</span> Substitusi total</div>
      </div>
    </section>

    <section class="stat-strip reveal" style="--delay:.18s">
      <div><strong>${t.slides}</strong><span>slide sumber</span></div>
      <div><strong>${t.cards}</strong><span>flashcard</span></div>
      <div><strong>${t.quiz}</strong><span>soal kuis</span></div>
      <div><strong>${t.topics}</strong><span>topik tutor</span></div>
    </section>

    <section class="home-section" id="materi">
      <div class="section-head reveal">
        <div><p class="eyebrow">Materi</p><h2>Pilih titik mulai</h2></div>
        <p>Dua materi ini saling nyambung. Mulai dari pohon semantik, lanjut ke substitusi.</p>
      </div>
      <div class="material-grid">
        ${DATA.materials.map(materialCard).join('')}
      </div>
    </section>

    <section class="home-section how">
      <div class="section-head reveal">
        <div><p class="eyebrow">Alur belajar</p><h2>Empat langkah, satu materi</h2></div>
        <p>Pola yang sama dipakai di kedua materi, jadi kamu cepat terbiasa.</p>
      </div>
      <div class="steps">
        ${[
          ['01', 'Baca ringkasan', 'Pahami alur besar dan istilah pentingnya dulu.'],
          ['02', 'Hafalkan kartu', 'Balik flashcard sampai tandanya “paham”.'],
          ['03', 'Uji dengan kuis', 'Cek pemahaman, lalu baca pembahasan tiap soal.'],
          ['04', 'Tanya tutor', 'Masih bingung? Tanya dengan bahasamu sendiri.'],
        ]
          .map(
            ([n, title, body], i) => `
            <article class="step reveal" style="--delay:${0.06 * i}s">
              <span class="step-num">${n}</span>
              <h3>${title}</h3>
              <p>${body}</p>
            </article>`
          )
          .join('')}
      </div>
    </section>
  `;
}

function materialCard(m) {
  const pct = pctFor(m);
  const best = bestScore(m);
  return `
    <a class="material-card reveal" href="#/materi/${m.id}" style="${accStyle(m)}">
      <div class="mc-top">
        <span class="mc-num">${String(m.order).padStart(2, '0')}</span>
        <span class="mc-badge">${m.slides} slide</span>
      </div>
      <h3>${esc(m.title)}</h3>
      <p>${esc(m.short)}</p>
      <div class="tag-row">${m.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>
      <div class="mc-progress">
        <div class="bar"><i style="width:${pct}%"></i></div>
        <span>${pct}% selesai</span>
      </div>
      <div class="mc-meta">
        <span>${m.cards.length} kartu</span>
        <span>${m.quiz.length} soal</span>
        <span>${best == null ? 'belum ada nilai' : `nilai ${best}%`}</span>
      </div>
      <div class="mc-foot"><span>Buka materi</span><span class="mc-arrow" aria-hidden="true">→</span></div>
    </a>`;
}

/* ---------------------------------------------------------
   Material shell
   --------------------------------------------------------- */

function materialView(m, tab) {
  const pct = pctFor(m);
  const best = bestScore(m);
  return `
    <div class="material-page" style="${accStyle(m)}">
      <header class="material-head">
        <div class="material-intro reveal">
          <a class="crumb" href="#/">← Semua materi</a>
          <p class="eyebrow">Materi ${String(m.order).padStart(2, '0')} · ${esc(m.course)}</p>
          <h1>${esc(m.title)}</h1>
          <p class="material-lead">${esc(m.short)}</p>
          <div class="tag-row">${m.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>
        </div>
        <div class="material-meter reveal" style="--delay:.08s">
          <div class="ring" style="--pct:${pct}">
            <span>${pct}<small>%</small></span>
          </div>
          <div class="meter-copy">
            <strong>${pct === 100 ? 'Materi selesai!' : 'Progres materi'}</strong>
            <span>${countMastered(m)}/${m.cards.length} flashcard dikuasai</span>
            <span>${best == null ? 'Kuis belum dicoba' : `Nilai kuis terbaik ${best}%`}</span>
          </div>
        </div>
      </header>

      <nav class="tabs" aria-label="Bagian materi">
        ${TABS.map((t) => {
          const active = t.id === tab;
          return `<a class="tab-link ${active ? 'is-active' : ''}" href="#/materi/${m.id}/${t.id}" ${active ? 'aria-current="page"' : ''}>${t.icon}<span>${t.label}</span></a>`;
        }).join('')}
      </nav>

      <div class="tab-panel" role="tabpanel">
        ${tabContent(m, tab)}
      </div>
    </div>`;
}

function tabContent(m, tab) {
  switch (tab) {
    case 'flashcards':
      return flashcardsView(m);
    case 'kuis':
      return quizView(m);
    case 'tutor':
      return tutorView(m);
    case 'slide':
      return slidesView(m);
    default:
      return summaryView(m);
  }
}

/* ---------------------------------------------------------
   Ringkasan
   --------------------------------------------------------- */

function summaryView(m) {
  return `
    <div class="summary-grid">
      <div class="summary-main">
        <article class="paper prose reveal">
          ${renderMarkdown(m.summary)}
        </article>
        <div class="next-grid reveal" style="--delay:.06s">
          <a class="next-card" href="#/materi/${m.id}/flashcards">
            <span class="next-num">01</span>
            <strong>Latih flashcard</strong>
            <small>${m.cards.length} kartu</small>
          </a>
          <a class="next-card" href="#/materi/${m.id}/kuis">
            <span class="next-num">02</span>
            <strong>Uji dengan kuis</strong>
            <small>${m.quiz.length} soal</small>
          </a>
          <button class="next-card" type="button" data-ask="${esc(m.quick[0])}" data-ask-material="${m.id}">
            <span class="next-num">03</span>
            <strong>Tanya tutor</strong>
            <small>dari slide</small>
          </button>
        </div>
      </div>

      <aside class="rail">
        <section class="rail-card reveal" style="--delay:.04s">
          <div class="rail-head"><h2>Peta materi</h2><span>${m.sections.length} bagian</span></div>
          <div class="map-list">
            ${m.sections
              .map(
                (s, i) => `
              <details class="map-item">
                <summary>
                  <span class="map-num">${String(i + 1).padStart(2, '0')}</span>
                  <span class="map-title">${esc(s.title)}</span>
                  <span class="map-slide">slide ${esc(s.slides)}</span>
                </summary>
                <div class="map-body">
                  <p>${esc(s.body)}</p>
                  <button class="text-link" type="button" data-open-slide="${firstSlide(s.slides)}" data-slide-material="${m.id}">
                    Buka slide ${esc(s.slides)} →
                  </button>
                </div>
              </details>`
              )
              .join('')}
          </div>
        </section>

        <section class="rail-card rail-ask reveal" style="--delay:.08s">
          <div class="rail-head"><h2>Latihan cepat</h2></div>
          <p class="rail-copy">Tanya tutor materi ini. Jawabannya diambil dari slide, bukan karangan.</p>
          <div class="quick-list">
            ${m.quick
              .map(
                (q) => `<button class="quick-q" type="button" data-ask="${esc(q)}" data-ask-material="${m.id}">${esc(q)}<span aria-hidden="true">→</span></button>`
              )
              .join('')}
          </div>
        </section>
      </aside>
    </div>`;
}

/* ---------------------------------------------------------
   Flashcard
   --------------------------------------------------------- */

function flashFor(m) {
  if (!ui.flash[m.id]) {
    ui.flash[m.id] = { order: m.cards.map((_, i) => i), pos: 0, flipped: false, focus: false };
  }
  const state = ui.flash[m.id];
  if (state.pos >= state.order.length) state.pos = Math.max(0, state.order.length - 1);
  return state;
}

function flashcardsView(m) {
  const f = flashFor(m);
  const mastered = countMastered(m);

  if (!f.order.length) {
    return `
      <div class="empty-state card-empty">
        <p class="eyebrow">Flashcard</p>
        <h2>Semua kartu sudah dikuasai 🎉</h2>
        <p>Tidak ada kartu tersisa di mode fokus. Kamu bisa mengulang semuanya kapan saja.</p>
        <button class="btn btn-primary" type="button" data-flash-action="reset">Ulangi semua kartu</button>
      </div>`;
  }

  const cardIndex = f.order[f.pos];
  const card = m.cards[cardIndex];

  return `
    <div class="study-toolbar">
      <div>
        <p class="tool-eyebrow">Flashcard</p>
        <h2>${m.cards.length} kartu untuk materi ini</h2>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-flash-action="shuffle">Acak</button>
        <button class="btn btn-ghost btn-sm" type="button" data-flash-action="focus">Fokus belum paham</button>
      </div>
    </div>

    <div class="flash-progress">
      <div class="bar"><i style="width:${m.cards.length ? (mastered / m.cards.length) * 100 : 0}%"></i></div>
      <span>${mastered} / ${m.cards.length} dikuasai</span>
    </div>

    <div class="flash-stage">
      <div class="flashcard ${f.flipped ? 'is-flipped' : ''}" data-flash-card role="button" tabindex="0" aria-label="Balik kartu">
        <div class="fc-inner">
          <div class="fc-face fc-front">
            <span class="fc-label">Pertanyaan</span>
            <p>${esc(card.front)}</p>
            <span class="fc-hint">klik untuk melihat jawaban</span>
          </div>
          <div class="fc-face fc-back">
            <span class="fc-label">Jawaban</span>
            <p>${esc(card.back)}</p>
            <span class="fc-hint">klik untuk kembali</span>
          </div>
        </div>
      </div>
    </div>

    <div class="flash-controls">
      <button class="btn btn-ghost" type="button" data-flash-action="prev" ${f.pos === 0 ? 'disabled' : ''}>← Sebelumnya</button>
      <div class="flash-count">${f.pos + 1} <span>/ ${f.order.length}</span></div>
      <button class="btn btn-ghost" type="button" data-flash-action="next" ${f.pos === f.order.length - 1 ? 'disabled' : ''}>Berikutnya →</button>
    </div>

    <div class="flash-rate">
      <button class="btn btn-soft" type="button" data-flash-action="unknown">Ulangi nanti</button>
      <button class="btn btn-primary" type="button" data-flash-action="known">Sudah paham</button>
    </div>

    <p class="keyhint">Spasi untuk balik kartu · ← → pindah · 1 ulangi · 2 paham</p>`;
}

function flashAction(action, m) {
  const f = flashFor(m);
  const index = f.order[f.pos];

  if (action === 'flip') {
    f.flipped = !f.flipped;
  } else if (action === 'next') {
    if (f.pos < f.order.length - 1) f.pos += 1;
    f.flipped = false;
  } else if (action === 'prev') {
    if (f.pos > 0) f.pos -= 1;
    f.flipped = false;
  } else if (action === 'shuffle') {
    f.order = shuffle([...f.order]);
    f.pos = 0;
    f.flipped = false;
    toast('Kartu diacak');
  } else if (action === 'focus') {
    const remaining = m.cards.map((_, i) => i).filter((i) => !isMastered(m, i));
    if (!remaining.length) {
      toast('Semua kartu sudah dikuasai 🎉');
      return;
    }
    f.order = shuffle(remaining);
    f.pos = 0;
    f.flipped = false;
    f.focus = true;
    toast(`${remaining.length} kartu belum dikuasai`);
  } else if (action === 'known' || action === 'unknown') {
    const know = action === 'known';
    progress.cards[m.id] = progress.cards[m.id] || {};
    progress.cards[m.id][index] = know;
    saveProgress();
    f.flipped = false;

    if (know && f.focus) {
      f.order = f.order.filter((i) => i !== index);
      if (f.pos >= f.order.length) f.pos = Math.max(0, f.order.length - 1);
    } else if (f.pos < f.order.length - 1) {
      f.pos += 1;
    }

    toast(know ? 'Ditandai sudah paham' : 'Masuk daftar ulangi');
  } else if (action === 'reset') {
    progress.cards[m.id] = {};
    saveProgress();
    ui.flash[m.id] = { order: m.cards.map((_, i) => i), pos: 0, flipped: false, focus: false };
    toast('Semua kartu diulang dari awal');
  }

  refreshTab();
}

/* ---------------------------------------------------------
   Kuis
   --------------------------------------------------------- */

function quizView(m) {
  const session = ui.quiz[m.id];
  const best = bestScore(m);

  if (!session) return quizIntro(m, best);
  if (session.phase === 'done') return quizResult(m, session);
  return quizRun(m, session, best);
}

function quizIntro(m, best) {
  const attempts = progress.quiz[m.id]?.attempts || 0;
  return `
    <div class="quiz-intro reveal">
      <div class="intro-card">
        <span class="intro-icon">${icon('quiz')}</span>
        <p class="eyebrow">Kuis materi</p>
        <h2>Uji pemahamanmu</h2>
        <p class="intro-copy">
          ${m.quiz.length} soal pilihan ganda. Setiap jawaban langsung dapat pembahasan,
          jadi salah pun tetap belajar.
        </p>
        <div class="intro-stats">
          <div><strong>${m.quiz.length}</strong><span>soal</span></div>
          <div><strong>${best == null ? '—' : `${best}%`}</strong><span>nilai terbaik</span></div>
          <div><strong>${attempts}</strong><span>percobaan</span></div>
        </div>
        <button class="btn btn-primary btn-lg" type="button" data-quiz-action="start">
          ${attempts ? 'Coba lagi' : 'Mulai kuis'} <span aria-hidden="true">→</span>
        </button>
        <p class="intro-hint">Tips: baca ringkasan dulu kalau masih ragu.</p>
      </div>
    </div>`;
}

function quizRun(m, session, best) {
  const idx = session.order[session.pos];
  const item = m.quiz[idx];
  const selected = session.selected;

  const options = item.options
    .map((opt, i) => {
      let cls = '';
      if (session.checked) {
        if (i === item.answer) cls = 'is-correct';
        else if (i === selected) cls = 'is-wrong';
      } else if (i === selected) {
        cls = 'is-selected';
      }
      const mark = session.checked && i === item.answer ? '<span class="opt-mark">✓</span>' : session.checked && i === selected ? '<span class="opt-mark bad">✕</span>' : '';
      return `<button class="quiz-option ${cls}" type="button" data-quiz-option="${i}" ${session.checked ? 'disabled' : ''}>
        <span class="opt-key">${String.fromCharCode(65 + i)}</span>
        <span>${esc(opt)}</span>${mark}
      </button>`;
    })
    .join('');

  return `
    <div class="quiz-top">
      <div class="quiz-meta"><span>Soal ${session.pos + 1} dari ${session.order.length}</span><span>${best == null ? '' : `Terbaik ${best}%`}</span></div>
      <div class="bar"><i style="width:${(session.pos / session.order.length) * 100}%"></i></div>
    </div>

    <div class="quiz-card reveal">
      <p class="quiz-kicker">Pilihan ganda</p>
      <h2 class="quiz-question">${esc(item.question)}</h2>
      <div class="quiz-options">${options}</div>

      ${
        session.checked
          ? `<div class="feedback ${selected === item.answer ? 'good' : 'bad'}">
              <strong>${selected === item.answer ? 'Tepat!' : 'Belum tepat'}</strong>
              <p>${esc(item.explanation)}</p>
            </div>
            <button class="btn btn-primary btn-next-q" type="button" data-quiz-action="next">
              ${session.pos === session.order.length - 1 ? 'Lihat hasil' : 'Soal berikutnya'} →
            </button>`
          : `<button class="btn btn-primary btn-next-q" type="button" data-quiz-action="check" ${selected == null ? 'disabled' : ''}>
              Periksa jawaban
            </button>`
      }
    </div>
    <p class="keyhint">Tekan 1–4 untuk memilih · Enter untuk periksa</p>`;
}

function quizResult(m, session) {
  const total = session.order.length;
  const correct = session.answers.filter((a) => a.selected === m.quiz[a.idx].answer).length;
  const score = session.score ?? Math.round((correct / total) * 100);
  const title = score >= 90 ? 'Luar biasa!' : score >= 70 ? 'Bagus, hampir matang' : score >= 50 ? 'Sudah kelihatan arahnya' : 'Waktunya baca ulang';
  const copy =
    score >= 90
      ? 'Kamu menguasai materi ini. Coba ulangi seminggu lagi supaya tetap lengket.'
      : score >= 70
        ? 'Beberapa detail masih lolos. Baca pembahasan yang salah, lalu coba lagi.'
        : score >= 50
          ? 'Dasar-dasarnya sudah masuk. Ringkasan dan flashcard akan menutup sisanya.'
          : 'Jangan langsung ulang kuis. Baca ringkasan dulu, lalu hafalkan flashcard.';

  return `
    <div class="result-card reveal">
      <div class="score-ring" style="--pct:${score}">
        <span>${score}<small>%</small></span>
      </div>
      <p class="eyebrow">Hasil kuis</p>
      <h2>${title}</h2>
      <p class="result-copy">${copy}</p>
      <div class="result-stats">
        <div><strong>${correct}/${total}</strong><span>jawaban benar</span></div>
        <div><strong>${score}%</strong><span>nilai</span></div>
        <div><strong>${progress.quiz[m.id]?.best ?? score}%</strong><span>terbaik</span></div>
      </div>
      <div class="result-actions">
        <button class="btn btn-primary" type="button" data-quiz-action="retry">Coba lagi</button>
        <a class="btn btn-ghost" href="#/materi/${m.id}/flashcards">Balik ke flashcard</a>
        <a class="btn btn-ghost" href="#/materi/${m.id}/ringkasan">Baca ringkasan</a>
      </div>

      <div class="review">
        <div class="review-head"><h3>Pembahasan</h3><span>${total} soal</span></div>
        ${session.order
          .map((idx, n) => {
            const item = m.quiz[idx];
            const answer = session.answers.find((a) => a.idx === idx);
            const ok = answer && answer.selected === item.answer;
            const chosen = answer && answer.selected != null ? item.options[answer.selected] : 'Tidak dijawab';
            return `
              <article class="review-item ${ok ? 'ok' : 'no'}">
                <div class="review-top">
                  <span class="review-num">${String(n + 1).padStart(2, '0')}</span>
                  <span class="review-status">${ok ? 'Benar' : 'Salah'}</span>
                </div>
                <p class="review-q">${esc(item.question)}</p>
                <div class="review-answers">
                  <span class="ans-pill ${ok ? 'ok' : 'no'}">Jawabanmu: ${esc(chosen)}</span>
                  ${ok ? '' : `<span class="ans-pill ok">Kunci: ${esc(item.options[item.answer])}</span>`}
                </div>
                <p class="review-exp">${esc(item.explanation)}</p>
              </article>`;
          })
          .join('')}
      </div>
    </div>`;
}

function quizAction(action, m) {
  if (action === 'start' || action === 'retry') {
    ui.quiz[m.id] = {
      phase: 'run',
      order: shuffle(m.quiz.map((_, i) => i)),
      pos: 0,
      selected: null,
      checked: false,
      answers: [],
    };
    refreshTab();
    return;
  }

  const session = ui.quiz[m.id];
  if (!session || session.phase !== 'run') return;

  if (action === 'check') {
    if (session.selected == null || session.checked) return;
    session.checked = true;
    session.answers.push({ idx: session.order[session.pos], selected: session.selected });
  } else if (action === 'next') {
    if (!session.checked) return;
    if (session.pos >= session.order.length - 1) {
      const total = session.order.length;
      const correct = session.answers.filter((a) => a.selected === m.quiz[a.idx].answer).length;
      session.score = Math.round((correct / total) * 100);
      session.phase = 'done';

      const p = progress.quiz[m.id] || { attempts: 0, best: 0 };
      p.attempts = (p.attempts || 0) + 1;
      p.best = Math.max(Number.isFinite(p.best) ? p.best : 0, session.score);
      p.last = session.score;
      p.lastTotal = total;
      p.updated = Date.now();
      progress.quiz[m.id] = p;
      saveProgress();
      toast(session.score >= 70 ? 'Kuis selesai — hasil bagus!' : 'Kuis selesai. Baca pembahasannya, ya.');
    } else {
      session.pos += 1;
      session.selected = null;
      session.checked = false;
    }
  }

  refreshTab();
}

/* ---------------------------------------------------------
   Tutor lokal
   --------------------------------------------------------- */

function tutorView(m) {
  const messages = chatFor(m);
  return `
    <div class="tutor-layout reveal">
      <div class="tutor-shell">
        <div class="tutor-head">
          <div class="tutor-avatar">✦</div>
          <div class="tutor-id">
            <h2>Tutor ${esc(shortNavTitle(m))}</h2>
            <p>Jawaban diambil dari ${m.slides} slide materi · bukan AI generatif</p>
          </div>
          <span class="live-pill"><i></i> siap</span>
        </div>

        <div class="chat-scroll" id="chat-scroll" aria-live="polite">
          ${messages.map((msg) => messageHtml(msg, m)).join('')}
        </div>

        <div class="tutor-suggest">
          ${m.quick.map((q) => `<button type="button" class="suggest-chip" data-ask="${esc(q)}" data-ask-material="${m.id}">${esc(q)}</button>`).join('')}
        </div>

        <form class="tutor-form" id="tutor-form" autocomplete="off">
          <label class="sr-only" for="tutor-input">Tulis pertanyaan</label>
          <input id="tutor-input" name="message" type="text" placeholder="Tanya konsep, contoh, atau cara mengerjakan…" maxlength="300" />
          <button class="send-btn" type="submit" aria-label="Kirim pertanyaan">
            <svg viewBox="0 0 24 24" fill="none"><path d="m4 12 16-7-5.5 14-3-6.2L4 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m11.5 12.8 3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </form>
      </div>
    </div>`;
}

function chatFor(m) {
  if (!ui.chat[m.id]) {
    ui.chat[m.id] = [
      {
        role: 'tutor',
        text: `Halo! Aku tutor untuk materi "${m.title}". Tanya apa saja soal ${m.tags
          .slice(0, 2)
          .join(' dan ')
          .toLowerCase()} — jawabannya kuambil dari isi slide, jadi aman untuk belajar.`,
        related: m.quick.slice(0, 3),
      },
    ];
  }
  return ui.chat[m.id];
}

function messageHtml(msg, m) {
  if (msg.role === 'user') {
    return `<div class="msg msg-user"><div class="bubble">${textHtml(msg.text)}</div></div>`;
  }
  if (msg.role === 'typing') {
    return `<div class="msg msg-tutor"><div class="msg-avatar">✦</div><div class="bubble typing"><span></span><span></span><span></span></div></div>`;
  }
  const slideBtn = msg.slide
    ? `<button class="msg-slide" type="button" data-open-slide="${firstSlide(msg.slide)}" data-slide-material="${m.id}">Lihat slide ${esc(msg.slide)} →</button>`
    : '';
  const related = msg.related?.length
    ? `<div class="msg-related"><span>Topik terkait</span>${msg.related
        .map((q) => `<button type="button" data-ask="${esc(q)}" data-ask-material="${m.id}">${esc(q)}</button>`)
        .join('')}</div>`
    : '';
  return `<div class="msg msg-tutor"><div class="msg-avatar">✦</div><div class="bubble">${textHtml(msg.text)}${slideBtn}${related}</div></div>`;
}

function afterTutorRender(m) {
  if (ui.pendingAsk && ui.pendingAsk.id === m.id) {
    const q = ui.pendingAsk.q;
    ui.pendingAsk = null;
    sendTutor(m, q);
    return;
  }
  scrollChat();
}

function sendTutor(m, text) {
  const clean = text.trim();
  if (!clean) return;
  const messages = chatFor(m);
  messages.push({ role: 'user', text: clean });
  const typing = { role: 'typing' };
  messages.push(typing);
  renderChatBody(m);

  const result = answerTutor(m, clean);
  window.setTimeout(() => {
    const i = messages.indexOf(typing);
    if (i > -1) messages.splice(i, 1);
    messages.push({ role: 'tutor', ...result });
    const r = route();
    if (r.name === 'material' && r.id === m.id && r.tab === 'tutor') renderChatBody(m);
  }, 420);
}

function renderChatBody(m) {
  const box = document.querySelector('#chat-scroll');
  if (!box) return;
  box.innerHTML = chatFor(m).map((msg) => messageHtml(msg, m)).join('');
  box.scrollTop = box.scrollHeight;
}

function scrollChat() {
  const box = document.querySelector('#chat-scroll');
  if (box) box.scrollTop = box.scrollHeight;
}

const STOPWORDS = new Set(
  'apa itu yang dan atau di ke dari untuk dengan bagaimana cara kenapa mengapa adalah apakah bisa jelaskan contoh soal materi ini saya aku kamu kita tolong dong ya sih lah kah the a an of to in on is are'.split(' ')
);

function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(s) {
  return normalize(s)
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function answerTutor(m, text) {
  const nq = normalize(text);
  const words = tokens(text);

  if (!words.length) {
    if (/halo|hai|hi|hello|pagi|siang|malam/.test(nq)) {
      return {
        text: 'Halo! Siap bantu. Kamu bisa tanya konsep, minta contoh, atau minta langkah mengerjakan soal dari materi ini.',
        related: m.quick.slice(0, 3),
      };
    }
    return {
      text: 'Pertanyaannya masih terlalu umum. Coba sebutkan istilah yang mau dibahas, misalnya nama konsep atau bagian slide.',
      related: m.quick.slice(0, 3),
    };
  }

  const scored = [];
  for (const item of m.tutor) {
    const tags = item.tags.map(normalize);
    const qn = normalize(item.q);
    const an = normalize(item.a);
    let score = 0;

    for (const w of words) {
      if (tags.includes(w)) score += 5;
      else if (tags.some((t) => t.length > 3 && (t.includes(w) || w.includes(t)))) score += 3;
      if (qn.includes(w)) score += 2;
      if (an.includes(w)) score += 1;
    }

    if (nq.length > 5 && qn.includes(nq)) score += 6;
    for (const t of tags) {
      if (t.length > 3 && nq.includes(t)) score += 2;
    }

    if (score > 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);

  if (!scored.length || scored[0].score < 2) {
    return {
      text: `Aku belum menemukan jawaban yang pas untuk "${text}" di slide materi ini. Coba pakai kata kunci yang lebih spesifik, misalnya "${m.quick[0]}" atau "${m.quick[1]}".`,
      related: m.quick.slice(0, 3),
    };
  }

  return {
    text: scored[0].item.a,
    slide: scored[0].item.slide,
    related: scored
      .slice(1, 4)
      .map((x) => x.item.q),
  };
}

/* ---------------------------------------------------------
   Slide viewer
   --------------------------------------------------------- */

function slidesView(m) {
  return `
    <div class="slides-head reveal">
      <div>
        <p class="tool-eyebrow">Slide asli</p>
        <h2>${m.slides} slide dari file kuliah</h2>
        <p class="slides-sub">${esc(m.source)}</p>
      </div>
      <span class="slide-total">${m.slides} halaman</span>
    </div>
    <div class="slide-grid reveal" style="--delay:.06s">
      ${Array.from({ length: m.slides }, (_, i) => {
        const n = i + 1;
        return `<button class="slide-thumb" type="button" data-open-slide="${n}" data-slide-material="${m.id}" aria-label="Buka slide ${n}">
          <img loading="lazy" src="${slideSrc(m, n)}" alt="Slide ${n} materi ${esc(m.title)}" />
          <span class="slide-badge">${n}</span>
        </button>`;
      }).join('')}
    </div>`;
}

function slideSrc(m, n) {
  const file = `${String(n).padStart(2, '0')}.jpg`;
  return `${m.slideDir}/${file}`;
}

function firstSlide(range) {
  const match = String(range).match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function openSlide(mid, n) {
  const m = material(mid);
  if (!m) return;
  const num = Math.min(Math.max(Number(n) || 1, 1), m.slides);
  ui.lightbox = { mid, n: num };

  const box = document.querySelector('#lightbox');
  box.hidden = false;
  box.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lb-open');
  updateLightbox();
  box.querySelector('.icon-btn')?.focus({ preventScroll: true });
}

function updateLightbox() {
  const lb = ui.lightbox;
  if (!lb) return;
  const m = material(lb.mid);
  const img = document.querySelector('#lb-img');
  img.src = slideSrc(m, lb.n);
  img.alt = `Slide ${lb.n} dari materi ${m.title}`;
  document.querySelector('#lb-material').textContent = `${shortNavTitle(m)} · slide ${lb.n}`;
  document.querySelector('#lb-count').textContent = `${lb.n} / ${m.slides}`;
  document.querySelector('#lb-source').textContent = m.source;
  document.querySelector('[data-lb-prev]').disabled = lb.n <= 1;
  document.querySelector('[data-lb-next]').disabled = lb.n >= m.slides;
}

function closeLightbox() {
  const box = document.querySelector('#lightbox');
  box.hidden = true;
  box.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lb-open');
  ui.lightbox = null;
}

function moveLightbox(delta) {
  const lb = ui.lightbox;
  if (!lb) return;
  const m = material(lb.mid);
  const next = lb.n + delta;
  if (next < 1 || next > m.slides) return;
  lb.n = next;
  updateLightbox();
}

/* ---------------------------------------------------------
   Events
   --------------------------------------------------------- */

function onClick(e) {
  const scrollBtn = e.target.closest('[data-scroll]');
  if (scrollBtn) {
    document.getElementById(scrollBtn.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const slideBtn = e.target.closest('[data-open-slide]');
  if (slideBtn) {
    openSlide(slideBtn.dataset.slideMaterial, Number(slideBtn.dataset.openSlide));
    return;
  }

  const askBtn = e.target.closest('[data-ask]');
  if (askBtn) {
    askTutor(askBtn.dataset.askMaterial, askBtn.dataset.ask);
    return;
  }

  const flashBtn = e.target.closest('[data-flash-action]');
  if (flashBtn) {
    const r = route();
    if (r.name === 'material') flashAction(flashBtn.dataset.flashAction, material(r.id));
    return;
  }

  const optBtn = e.target.closest('[data-quiz-option]');
  if (optBtn) {
    const r = route();
    if (r.name !== 'material') return;
    const session = ui.quiz[r.id];
    if (!session || session.phase !== 'run' || session.checked) return;
    session.selected = Number(optBtn.dataset.quizOption);
    refreshTab();
    return;
  }

  const quizBtn = e.target.closest('[data-quiz-action]');
  if (quizBtn) {
    const r = route();
    if (r.name === 'material') quizAction(quizBtn.dataset.quizAction, material(r.id));
    return;
  }

  if (e.target.closest('[data-lb-close]')) {
    closeLightbox();
    return;
  }
  if (e.target.closest('[data-lb-prev]')) {
    moveLightbox(-1);
    return;
  }
  if (e.target.closest('[data-lb-next]')) {
    moveLightbox(1);
    return;
  }

  if (e.target.closest('.flashcard')) {
    const r = route();
    if (r.name === 'material' && r.tab === 'flashcards') flashAction('flip', material(r.id));
  }
}

function onSubmit(e) {
  if (e.target.id !== 'tutor-form') return;
  e.preventDefault();
  const r = route();
  if (r.name !== 'material') return;
  const input = document.querySelector('#tutor-input');
  const value = input?.value.trim();
  if (!value) return;
  input.value = '';
  sendTutor(material(r.id), value);
}

function onKey(e) {
  if (ui.lightbox) {
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') moveLightbox(-1);
    else if (e.key === 'ArrowRight') moveLightbox(1);
    return;
  }

  if (e.target.matches('input, textarea, select')) return;

  const r = route();
  if (r.name !== 'material') return;
  const m = material(r.id);

  if (r.tab === 'flashcards') {
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      flashAction('flip', m);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      flashAction('prev', m);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      flashAction('next', m);
    } else if (e.key === '1') {
      flashAction('unknown', m);
    } else if (e.key === '2') {
      flashAction('known', m);
    }
  }

  if (r.tab === 'kuis') {
    const session = ui.quiz[m.id];
    if (!session || session.phase !== 'run') return;
    const item = m.quiz[session.order[session.pos]];
    if (/^[1-4]$/.test(e.key) && !session.checked) {
      const i = Number(e.key) - 1;
      if (i < item.options.length) {
        session.selected = i;
        refreshTab();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!session.checked && session.selected != null) quizAction('check', m);
      else if (session.checked) quizAction('next', m);
    }
  }
}

function askTutor(mid, question) {
  if (!mid || !question) return;
  ui.pendingAsk = { id: mid, q: question };
  const target = `#/materi/${mid}/tutor`;
  if (location.hash === target) render();
  else location.hash = target;
}

/* ---------------------------------------------------------
   Markdown + text helpers
   --------------------------------------------------------- */

function renderMarkdown(md) {
  const lines = String(md).replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length, 4);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushParagraph();
      const type = ul ? 'ul' : 'ol';
      if (list !== type) {
        closeList();
        out.push(`<${type}>`);
        list = type;
      }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  closeList();
  return out.join('\n');
}

function inline(value) {
  return esc(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function textHtml(value) {
  return String(value)
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let toastTimer;
function toast(message) {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

function icon(name) {
  const paths = {
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" stroke="currentColor" stroke-width="1.7"/>',
    cards:
      '<rect x="7" y="4" width="13" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 7v13a2 2 0 0 0 2 2h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    quiz: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.8 2.2c-.8.5-1.3 1-1.3 1.9v.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1" fill="currentColor"/>',
    chat: '<path d="M20 12.5a7.5 7.5 0 0 1-8 7.5 8 8 0 0 1-3.2-.7L4 21l1.4-4.1A7.5 7.5 0 1 1 20 12.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    layers:
      '<path d="m12 3 9 5-9 5-9-5 9-5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">${paths[name] || ''}</svg>`;
}
