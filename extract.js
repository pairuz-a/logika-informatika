import path from 'node:path';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export class ExtractError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const decodeXml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function xmlTexts(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(decodeXml(m[1]));
  return out;
}

async function fromPdf(buf) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function fromPptx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  const parts = [];
  for (let i = 0; i < slides.length; i++) {
    const xml = await zip.files[slides[i]].async('string');
    // satu paragraf = satu baris
    const paras = xml.split('</a:p>').map((p) => xmlTexts(p, 'a:t').join('')).filter(Boolean);
    if (paras.length) parts.push(`[Slide ${i + 1}]\n${paras.join('\n')}`);
  }
  return parts.join('\n\n');
}

async function fromXlsx(buf) {
  const zip = await JSZip.loadAsync(buf);

  // Teks bersama (sharedStrings). Satu <si> bisa berisi beberapa <t> (rich text).
  const sharedFile = zip.files['xl/sharedStrings.xml'];
  const shared = sharedFile
    ? (await sharedFile.async('string')).split(/<si\b[^>]*>/).slice(1).map((si) => xmlTexts(si, 't').join(''))
    : [];

  const sheets = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));

  const out = [];
  for (let i = 0; i < sheets.length; i++) {
    const xml = await zip.files[sheets[i]].async('string');
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const type = (c[1].match(/\bt="([^"]*)"/) || [])[1];
        const inner = c[2] || '';
        let val = '';
        if (type === 's') val = shared[Number((inner.match(/<v>([^<]*)<\/v>/) || [])[1])] ?? '';
        else if (type === 'inlineStr') val = xmlTexts(inner, 't').join('');
        else val = decodeXml((inner.match(/<v>([^<]*)<\/v>/) || [])[1] || '');
        if (val !== '') cells.push(val);
      }
      if (cells.length) rows.push(cells.join(' | '));
    }
    if (rows.length) out.push(`[Sheet ${i + 1}]\n${rows.join('\n')}`);
  }
  return out.join('\n\n');
}

export async function extractFile(buffer, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const title = path.basename(originalName || 'Materi', ext) || 'Materi';
  let text = '';

  try {
    if (ext === '.pdf') text = await fromPdf(buffer);
    else if (ext === '.docx') text = (await mammoth.extractRawText({ buffer })).value;
    else if (ext === '.pptx') text = await fromPptx(buffer);
    else if (ext === '.xlsx') text = await fromXlsx(buffer);
    else if (['.txt', '.md', '.csv'].includes(ext)) text = buffer.toString('utf8');
    else if (['.mp3', '.wav', '.mp4', '.mov', '.m4a'].includes(ext)) {
      throw new ExtractError('Audio/video belum didukung (butuh transkripsi). Upload materi sebagai PDF, DOCX, PPTX, XLSX, atau TXT.');
    } else {
      throw new ExtractError(`Format ${ext || 'tanpa ekstensi'} belum didukung. Coba PDF, DOCX, PPTX, XLSX, atau TXT.`);
    }
  } catch (e) {
    if (e instanceof ExtractError) throw e;
    throw new ExtractError(`Gagal membaca file ${originalName}: ${e.message}`);
  }

  text = clean(text);
  if (text.length < 20) {
    throw new ExtractError('Teks dalam file tidak terbaca. Kalau PDF hasil scan (berupa gambar), perlu OCR dulu.');
  }
  return { title, text };
}

export function clean(t) {
  return String(t || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
