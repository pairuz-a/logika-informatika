# Belajar Logika

Ruang belajar pribadi untuk **dua materi Logika Informatika**:

1. **Semantic Tree & Proof by Falsification** — 18 slide
2. **Substitusi** — 41 slide

Semua isi diambil dari dua file slide kuliah di folder ini. Tidak ada API key, tidak ada biaya, dan tidak perlu koneksi ke layanan AI.

**Situs live:** <https://pairuz-a.github.io/logika-informatika/>

## Fitur

- **Ringkasan** tiap materi, disusun ulang dalam bahasa yang lebih mudah dibaca.
- **Flashcard** dengan mode balik kartu, acak, dan fokus ke kartu yang belum dikuasai.
- **Kuis pilihan ganda** dengan pembahasan tiap soal dan nilai terbaik.
- **Tutor lokal** yang menjawab berdasarkan isi slide. Pencocokan kata kunci, bukan AI generatif, jadi jawabannya konsisten dan bisa dilacak ke slide sumber.
- **Penampil slide asli** (59 halaman) dengan navigasi keyboard.
- **Progres belajar** disimpan di `localStorage` browser.
- Tampilan responsif untuk desktop dan HP.

## Menjalankan

```bash
npm install
npm start
```

Buka <http://localhost:3000>.

Untuk pengembangan:

```bash
npm run dev
```

## Struktur

```
server.js              Server Express statis + health check
public/
  index.html           Kerangka aplikasi
  style.css            Desain dan responsive layout
  app.js               Routing, flashcard, kuis, tutor, slide viewer
  materials.json       Semua konten belajar (ringkasan, kartu, kuis, tutor)
  slides/
    semantic-tree/     18 gambar slide (01.jpg–18.jpg)
    substitusi/        41 gambar slide (01.jpg–41.jpg)
build_materials.py     Skrip pembuat materials.json dari konten terkurasi
render.yaml            Blueprint Render (free plan)
```

## Sumber materi

- `7. SEMANTIC TREE-PROOF by FALSIFICATION.pptx` — Ikrima Alfi, S.T., M.Eng.
- `8. SUBSTITUSI.pptx` — Ikrima Alfi, S.T., M.Eng.

Slide asli diekspor menjadi gambar JPG agar bisa dibaca langsung di browser. File PPTX tidak disajikan ke publik.

## Deploy ke Render

1. Push repo ini ke GitHub.
2. Di Render, pilih **New → Blueprint**, hubungkan repo, lalu gunakan `render.yaml`.
3. Tidak ada environment variable yang wajib diisi.

Catatan free plan Render: service tidur setelah ±15 menit tanpa trafik, jadi request pertama bisa terasa lambat (±1 menit).

## Catatan

- Progres tersimpan per browser. Membuka di perangkat lain akan mulai dari nol.
- Tutor menjawab dengan mencari topik paling relevan dari kumpulan Q&A yang sudah disusun dari slide. Kalau pertanyaan tidak cocok, tutor akan menyarankan topik terkait.
- Untuk mengubah konten, edit `build_materials.py` lalu jalankan `python build_materials.py`.
