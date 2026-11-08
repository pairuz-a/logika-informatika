# Belajarin Kos

Web belajar berbasis AI buat anak kos: upload materi, jadi **ringkasan**, **flashcard**, **kuis**, dan **tutor chat**.
Tanpa langganan. Kamu pakai API murah sendiri, atau free tier kalau ada.

Provider yang didukung:
- **OpenAI-compatible** (CosmosHub, Mobius, Groq, OpenRouter, atau penjual token lain): cukup isi base URL, API key, dan nama model.
- **Gemini** (API native Google).

Bisa ganti provider/model langsung dari dropdown di web. Kalau tidak mau beli provider, pakai **Gemini free tier** dari Google AI Studio, atau provider OpenAI-compatible yang punya free tier seperti Groq/OpenRouter. Ollama di laptop juga bisa dipakai lewat base URL `http://localhost:11434/v1`.

## Jalankan

Butuh Node.js 18 atau lebih baru.

```bash
npm install
cp .env.example .env     # lalu isi base URL, API key, dan nama model
npm start
```

Buka http://localhost:3000

## Deploy ke Render (gratis)

File `render.yaml` sudah disiapkan untuk Render Blueprint.

1. Push project ini ke repo GitHub (private juga boleh).
2. Di [Render Dashboard](https://dashboard.render.com), pilih **New → Blueprint**.
3. Hubungkan repo tadi, lalu **Apply**.
4. Saat diminta, isi:
   - `GEMINI_API_KEY` — API key gratis dari [Google AI Studio](https://aistudio.google.com/apikey).
   - `APP_PASSWORD` — opsional, tapi isi kalau link mau dibagikan ke teman.
5. Setelah deploy selesai, buka URL `https://<nama-service>.onrender.com`.

Catatan Render free:

- Service tidur setelah 15 menit tanpa traffic. Request pertama setelah tidur bisa lambat sekitar 1 menit.
- Memori 512 MB dan upload tetap maksimal 20 MB. File yang sangat besar bisa gagal diproses.
- Riwayat materi tetap disimpan di browser masing-masing, bukan di server.
- Untuk memakai provider lain, ubah `PROVIDERS` dan tambahkan variabel provider di dashboard Render. Jangan commit file `.env`.

## Konfigurasi `.env`

Daftar provider lewat `PROVIDERS=cosmos,mobius,gemini`. Tiap provider punya blok variabel berawalan nama id-nya (huruf besar):

| Variabel | Arti |
| --- | --- |
| `<ID>_TYPE` | `openai` (default) atau `gemini` |
| `<ID>_LABEL` | Nama yang tampil di dropdown |
| `<ID>_BASE_URL` | Untuk `openai`: alamat sebelum `/chat/completions`, biasanya berakhiran `/v1` |
| `<ID>_API_KEY` | API key |
| `<ID>_MODELS` | Daftar nama model, pisah koma |

Mau tambah provider baru? Tambah id-nya di `PROVIDERS` dan buat blok variabelnya. Tidak perlu ubah kode.

Pengaturan lain: `MAX_MATERIAL_CHARS` (batas panjang materi ke model), `RATE_LIMIT_PER_MIN` (per IP), `APP_PASSWORD` (kalau diisi, web minta password; berguna kalau dibuka ke teman).

## Yang sudah jalan

- Upload PDF, DOCX, PPTX, XLSX, TXT, atau paste teks.
- Ringkasan terstruktur, flashcard (balik kartu, tandai hafal, acak), kuis pilihan ganda dengan pembahasan, chat tutor berdasarkan materi.
- Riwayat materi tersimpan di browser (localStorage), maksimal 20.

## Batasan

- **Audio/video (MP3, MP4, dst) belum didukung**: butuh layanan transkripsi (Whisper atau sejenis).
- **PDF hasil scan** (isinya gambar) tidak terbaca; perlu OCR dulu.
- Materi dipotong sampai `MAX_MATERIAL_CHARS` karakter. Materi panjang banget sebaiknya dipecah per bab.
- Riwayat ada di browser masing-masing, tidak disinkronkan antar perangkat.
- Hasil AI bisa salah atau terlalu disederhanakan. Cek lagi ke materi aslinya sebelum ujian.

## Struktur

```
server.js      Express: API + file statis, rate limit, password opsional
providers.js   Klien OpenAI-compatible dan Gemini
extract.js     Ekstraksi teks (PDF/DOCX/PPTX/XLSX/TXT)
prompts.js     Prompt dan validasi keluaran model
public/        Frontend (HTML/CSS/JS tanpa framework)
render.yaml    Blueprint deploy gratis ke Render
```
