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

## Catatan

- Progres tersimpan per browser. Membuka di perangkat lain akan mulai dari nol.
- Tutor menjawab dengan mencari topik paling relevan dari kumpulan Q&A yang sudah disusun dari slide. Kalau pertanyaan tidak cocok, tutor akan menyarankan topik terkait.
- Untuk mengubah konten, edit `build_materials.py` lalu jalankan `python build_materials.py`.
