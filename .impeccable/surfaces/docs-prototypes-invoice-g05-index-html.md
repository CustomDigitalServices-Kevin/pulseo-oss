---
version: 1
slug: "docs-prototypes-invoice-g05-index-html"
primary_target: "docs/prototypes/invoice-g05/index.html"
related_targets: []
---

# Surface brief: Invoice admin G0.5

Status: brief disetujui pengguna 5 November 2026 (hasil `/impeccable shape`). Prototype belum dibangun; direction contract ditulis saat build dimulai.

## Mode dan cakupan

- Mode: **Operate**.
- Hasil berikutnya: prototype klik HTML dengan data contoh untuk review desain UI-MOB-01/02, tanpa backend dan tanpa menyentuh kode Pulseo. Lokasi: `docs/prototypes/invoice-g05/`.
- Responsif: 1280–1440 (utama), 768, 390.

## Pengguna dan tugas

Workspace admin berizin finance (pemilik/staf keuangan agensi atau konsultan kecil), laptop, jam kantor, lonjakan di awal bulan saat draft periodik muncul. Tugas: meninjau draft manual/AI/periodik, Preview → Terbit, memantau jatuh tempo, memverifikasi bukti transfer.

Hasil wajib: invoice terbit hanya setelah konfirmasi eksplisit atas versi, total, mata uang dan bahasa PDF; verifikasi bukti mencatat pembayaran tepat sekali; sisa tagihan selalu terlihat. Acuan: blueprint §9, J05–J07, INV-22-01..03, PAY-22-01, LNG-22-02; referensi Mobbin M06, M07, F01, G01, G02.

## Layar

1. Daftar invoice: tab Semua / Draft / Perlu verifikasi / Jatuh tempo / Lunas / Void + panel detail.
2. Editor draft: klien, proyek/layanan, periode, mata uang IDR/USD, bahasa PDF ID/EN, baris, diskon/pajak dari aturan workspace, instruksi pembayaran, label sumber manual/AI/periodik; data kurang ditandai jelas.
3. Review → Terbit: mode fokus, PDF skala terbit, cek akhir (klien, total, mata uang, bahasa), dialog konfirmasi; state memproses, berhasil, gagal + coba lagi, perlindungan klik ganda.
4. Detail terbit: snapshot terkunci, unduh PDF, riwayat pembayaran, Void dengan alasan (ditolak bila ada pembayaran sah).
5. Verifikasi bukti: antrian + halaman review (bukti kiri, invoice dan klaim kanan); Verifikasi dengan jumlah/tanggal diterima, atau Tolak dengan alasan.
6. Catat pembayaran manual.

Anti-goal: tombol terbit+kirim sekaligus, edit setelah terbit, auto-Lunas, grafik pendapatan, payment gateway, ikon kereta/rambu.

## State dan rentang

1–30 baris (umumnya 3–8); nominal sampai Rp 9.999.999.999 (IDR tanpa desimal), USD 2 desimal; nama klien sampai ±60 karakter; 0–200 invoice per bulan dengan empty state invoice pertama. Bukti: pending, nominal tidak cocok, kurang bayar, duplikat, tidak terbaca, sudah diverifikasi, izin ditolak, gagal simpan; plus loading dan error jaringan.

## Layout

1280–1440: rail + daftar + detail; Review menyembunyikan daftar. 768: rail jadi bar atas, detail halaman penuh. 390: daftar jadi kartu dengan garis status; verifikasi bukti dapat dipakai (zoom bukti, form verifikasi); editor berfungsi tetapi tidak dioptimalkan. Status tidak hanya warna (setiap titik berlabel teks), fokus keyboard terlihat, tindakan penting memakai konfirmasi.

## Arah terpilih: Jalur Status

- Dipilih pengguna dari ronde arah visual (form: kandidat 6 dari daftar tujuh arah yang di-ground; seed:3f9dc865cc7b81a5). Nama tidak memakai rujukan kereta atas permintaan pengguna.
- Gerakan khas: status sebagai garis progres empat titik Draft → Preview → Terbit → Lunas, kecil di setiap baris, besar di detail; titik Terbit adalah gerbang konfirmasi.
- Palet: shell biru tua, latar abu hangat; garis yang sudah dilewati biru tua; kuning = menunggu pihak lain (preview basi, bukti menunggu verifikasi); hijau = selesai; abu = belum dicapai; merah hanya untuk masalah (lewat jatuh tempo, ditolak, gagal render).
- Huruf: sans condensed bergaya rambu untuk label, sans biasa untuk isi; semua nominal angka tabular rata desimal, tidak pernah patah baris.
- Disiplin tambahan: Review menguasai area kerja; sisa tagihan rata kanan; field yang berubah setelah preview ditandai di posisinya; layar sempit membuang kolom utuh.
- Sketsa ronde: `.impeccable/mocks/decision/assigned.html` (lokal, tidak di-commit).

## Keputusan terbuka (jangan dikarang)

Format nomor invoice (`INV/2026/11/0041` hanya contoh), tarif/aturan pajak (tampil sebagai "PPN · aturan workspace"), isi instruksi rekening, huruf final, logo Dokalio (sementara wordmark teks). Konversi kurs di luar cakupan: satu invoice satu mata uang.
