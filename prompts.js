const SYSTEM =
  'Kamu adalah tutor yang sabar dan jelas untuk mahasiswa dan pelajar Indonesia. ' +
  'Kamu HANYA memakai isi materi yang diberikan. Jangan mengarang fakta yang tidak ada di materi. ' +
  'Kalau materi tidak cukup untuk menjawab, bilang terus terang.';

const langName = (lang) => (lang === 'en' ? 'English' : 'Bahasa Indonesia');

function materialBlock(text) {
  return `=== MATERI ===\n${text}\n=== AKHIR MATERI ===`;
}

export function buildGenerate(kind, { text, count, lang }) {
  const L = langName(lang);

  if (kind === 'summary') {
    return [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content:
          `${materialBlock(text)}\n\nBuat ringkasan belajar dalam ${L} format Markdown dengan struktur:\n` +
          '## Gambaran Umum (2-3 kalimat)\n## Konsep Kunci (poin-poin, jelaskan singkat)\n' +
          '## Istilah Penting (istilah: arti)\n## Yang Sering Diujikan (poin-poin)\n## Intisari (1 paragraf pendek)\n' +
          'Gunakan kalimat yang mudah dipahami. Jangan menambahkan informasi di luar materi.',
      },
    ];
  }

  if (kind === 'flashcards') {
    return [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content:
          `${materialBlock(text)}\n\nBuat ${count} flashcard dalam ${L} dari materi di atas. ` +
          'Setiap kartu menguji satu hal (definisi, rumus, tanggal, sebab-akibat, dst). ' +
          'Balas HANYA dengan JSON array valid tanpa teks lain, bentuk: ' +
          '[{"front":"pertanyaan singkat","back":"jawaban singkat"}]',
      },
    ];
  }

  if (kind === 'quiz') {
    return [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content:
          `${materialBlock(text)}\n\nBuat ${count} soal pilihan ganda dalam ${L} dari materi di atas. ` +
          'Tiap soal punya 4 opsi, tepat satu yang benar, pengecoh masuk akal, dan penjelasan singkat. ' +
          'Variasikan posisi jawaban benar. ' +
          'Balas HANYA dengan JSON array valid tanpa teks lain, bentuk: ' +
          '[{"question":"...","options":["A","B","C","D"],"answer":0,"explanation":"..."}] ' +
          '(answer = indeks opsi benar mulai dari 0).',
      },
    ];
  }

  throw new Error(`kind tidak dikenal: ${kind}`);
}

export function buildChat({ text, history, lang }) {
  return [
    {
      role: 'system',
      content:
        `${SYSTEM} Jawab dalam ${langName(lang)}, ringkas, dan beri contoh kalau membantu. ` +
        'Kalau pertanyaan di luar materi, boleh jawab dengan pengetahuan umum tetapi sebutkan bahwa itu di luar materi.\n\n' +
        materialBlock(text),
    },
    ...history,
  ];
}

// ---------- parsing & validasi keluaran model ----------

export function parseJsonLoose(raw) {
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(s); } catch { /* lanjut */ }
  const start = s.search(/[\[{]/);
  const end = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { /* lanjut */ }
  }
  throw new Error('Jawaban model bukan JSON yang valid');
}

export function normalizeFlashcards(data) {
  const arr = Array.isArray(data) ? data : data?.flashcards || data?.cards;
  if (!Array.isArray(arr)) throw new Error('Format flashcard tidak sesuai');
  const cards = arr
    .map((c) => ({ front: String(c?.front ?? c?.question ?? '').trim(), back: String(c?.back ?? c?.answer ?? '').trim() }))
    .filter((c) => c.front && c.back);
  if (!cards.length) throw new Error('Tidak ada flashcard yang valid');
  return cards;
}

export function normalizeQuiz(data) {
  const arr = Array.isArray(data) ? data : data?.questions || data?.quiz;
  if (!Array.isArray(arr)) throw new Error('Format kuis tidak sesuai');
  const qs = arr
    .map((q) => {
      const options = Array.isArray(q?.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
      let answer = q?.answer;
      if (typeof answer === 'string' && /^[A-Za-z]$/.test(answer.trim())) answer = answer.trim().toUpperCase().charCodeAt(0) - 65;
      answer = Number(answer);
      return {
        question: String(q?.question ?? '').trim(),
        options,
        answer,
        explanation: String(q?.explanation ?? '').trim(),
      };
    })
    .filter((q) => q.question && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
  if (!qs.length) throw new Error('Tidak ada soal yang valid');
  return qs;
}
