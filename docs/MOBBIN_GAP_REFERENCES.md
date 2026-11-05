# Dokalio v2.2: Pelengkap Referensi Mobbin

Tanggal kurasi: 5 November 2026. Mengikuti sebelas keputusan pada blueprint; tidak menambah scope implementasi.

## Ringkasan bukti dan batas kecocokan

13 screen tambahan dipilih dari hasil koneksi Mobbin: 7 web dan 6 iOS. Preview masing-masing diperiksa secara visual dan gambar resolusi penuh disimpan lokal. Paket gabungan memuat 24 screen, 2 flow dan 28 gambar. Tidak ada klaim seluruh produk atau backend referensi diaudit.

| Kebutuhan | Referensi | Yang sudah tersedia | Yang belum dibuktikan referensi |
|---|---|---|---|
| Verifikasi bukti bayar | G01/G02 | Layout preview dokumen/detail/riwayat dan antrian review | Exact alur verifikasi bukti transfer masuk dengan Verified/Rejected belum ditemukan; statusnya kecocokan sebagian |
| Revisi per item | G03/G04 | Komentar per bagian, Resolve dan checklist | Structured revision fields, respons tim dan approval ulang per versi tetap rancangan Dokalio |
| Tambah link Drive | G05/G06 | Input URL/judul dan konteks izin Drive | Form gabungan metadata/context → Preview → Publish belum ditemukan sebagai satu screen |
| Action Center klien | G07/G08/G13 | Action list, Action Required/Waiting dan empty state | Exact dashboard client owner/member penyedia jasa belum ditemukan; jangan melabeli dashboard operator sebagai client portal |
| Mobile | G08–G13 | Action cards, keputusan, files list, form tiket penuh dan attachment previews | Semua contoh mobile adalah iOS; web responsif Dokalio, invoice/PDF dan form bukti bayar mobile belum diuji/ditinjau sebagai screen referensi tersendiri |

Mobbin mengembalikan `RATE_LIMITED / Too many requests` pada pencarian lanjutan. Pencarian dihentikan, tidak diganti dengan tebakan, web search atau connector lain. Percobaan yang terkena pembatasan tidak dihitung sebagai bukti bahwa referensi tidak tersedia di Mobbin.

## Referensi terpilih

### G01-payment-review: Review bukti bayar admin: susunan pembanding

[Remote (web)](https://mobbin.com/screens/5a02d53a-4cc4-411a-ba45-3d0b7c1f0f54)

Terlihat: Remote menampilkan PDF invoice di kiri dan detail nominal, label Awaiting approval, riwayat serta tombol Decline di kanan.

Penerapan: Ini review invoice kontraktor, bukan verifikasi bukti transfer masuk. Ambil susunan dokumen + detail + history, lalu Dokalio mengganti dokumen kiri dengan bukti bayar dan kanan dengan invoice terkait, jumlah diklaim, jumlah diterima, tanggal, status dan keputusan admin. Jangan mengadopsi forex, contractor onboarding atau pay button.

Batas bukti: Sebagian; bukan bukti alur receipt verification lengkap.

Traceability: PAY-22-01, INV-22-02; G0.5/G1.

![Review bukti bayar admin: susunan pembanding, sumber web](references/mobbin/G01-payment-review.jpg)

### G02-payment-queue: Antrian bukti perlu verifikasi

[Melio (web)](https://mobbin.com/screens/bf5a95bf-1d81-4017-ac17-0e35ad2c2885)

Terlihat: Melio menampilkan tab Approvals dengan baris vendor, bill, debit date, status Pending approval, amount dan action Approve.

Penerapan: Ambil pola tabel antrian; ubah kolom menjadi klien, invoice, nominal bukti, waktu unggah dan PendingVerification. CTA utama Review membuka bukti sebelum verifikasi. Jangan meminjam makna pembayaran keluar atau approve membayar vendor.

Batas bukti: Sebagian; antrian approval pembayaran keluar, bukan receipt masuk.

Traceability: PAY-22-01, ACT-22-01; G0.5/G1.

![Antrian bukti perlu verifikasi, sumber web](references/mobbin/G02-payment-queue.jpg)

### G03-revision-items: Revisi per bagian dan Resolve

[Contractbook (web)](https://mobbin.com/screens/4be3b62c-8099-49d6-81b0-3a3906bb0fe5)

Terlihat: Contractbook memperlihatkan komentar/suggestion yang terkait teks, daftar Active di panel kanan dan kontrol Resolve pada thread komentar.

Penerapan: Jadikan setiap item revisi punya nomor, bagian yang dirujuk, deskripsi, pembuat, waktu, status dan respons tim. Resolve pada item berarti ditangani, bukan Approved. Simpan referensi versi lama dan versi hasil. Tidak perlu membangun editor dokumen internal.

Batas bukti: Pola komentar per bagian terlihat; approval versi dan structured fields berasal dari blueprint.

Traceability: REV-22-01, APR-22-02; G1.

![Revisi per bagian dan Resolve, sumber web](references/mobbin/G03-revision-items.jpg)

### G04-revision-checklist: Daftar item revisi

[Slite (web)](https://mobbin.com/screens/de1e7f91-22f2-4b9c-81c2-46fe74ffbcd6)

Terlihat: Slite memperlihatkan checklist pada dokumen Design review template dan thread komentar di kanan.

Penerapan: Gunakan daftar item yang dapat dipindai dan diskusi per item; Dokalio memisahkan belum ditangani/sudah ditangani/perlu klarifikasi dan tautan versi hasil. Status item tidak mengesahkan seluruh hasil kerja.

Batas bukti: Sebagian; checklist dan komentar terlihat, bukan state machine revisi Dokalio.

Traceability: REV-22-01; G1.

![Daftar item revisi, sumber web](references/mobbin/G04-revision-checklist.jpg)

### G05-add-link: Input tautan Drive: komponen URL dan judul

[Dovetail (web)](https://mobbin.com/screens/2678f390-f59c-4c70-ad3f-7dc378eedefa)

Terlihat: Dovetail menampilkan dialog Create link dengan Link URL, Text to display, Save dan Cancel.

Penerapan: Ambil pemisahan URL dan judul serta fallback judul manual. Dokalio menambahkan kategori, organisasi klien, proyek/layanan, visibility, metadata access state, Preview dan Publish. Untuk form metadata lengkap, gunakan halaman utama agar audiens dan konteks terlihat; dialog kecil ini hanya referensi komponen.

Batas bukti: Pola input link terlihat; tidak ada bukti integrasi Drive atau preview/publish pada contoh.

Traceability: PUB-22-01, DOC-22-01/02; G1.

![Input tautan Drive: komponen URL dan judul, sumber web](references/mobbin/G05-add-link.jpg)

### G06-drive-sharing: Konteks izin berbagi Drive

[Google Drive (web)](https://mobbin.com/screens/2bfc11e9-d18a-40c6-9c36-5ba12e2b86c2)

Terlihat: Google Drive menampilkan dialog Share dengan penerima, pilihan Editor, Notify people, pesan dan Send.

Penerapan: Gunakan sebagai penjelas bahwa izin file asli berada di Drive. Dokalio hanya menunjukkan status belum diperiksa/tidak diketahui atau pemeriksaan yang benar-benar diizinkan. Publish link tidak melakukan tindakan Share atau mengubah Editor/Viewer. Jangan menyalin daftar penerima tanpa izin.

Batas bukti: Izin berbagi eksternal terlihat; bukan layar tambah link Dokalio.

Traceability: DOC-22-01/02, SEC-22-01; G1.

![Konteks izin berbagi Drive, sumber web](references/mobbin/G06-drive-sharing.jpg)

### G07-action-list: Action Center klien: pola antrian tindakan

[Remote (web)](https://mobbin.com/screens/1a5a8ac8-49f2-467c-ad4f-5e36c2e86936)

Terlihat: Remote menampilkan Things to do dengan item, uraian, waktu dan View all; pada preview panel daftar terbuka di sisi kanan.

Penerapan: Ini produk HR/operator, bukan portal klien jasa. Ambil struktur judul tindakan, konteks, waktu dan CTA. Dokalio menampilkan antrian sebagai isi utama Home, bukan bergantung pada side panel. Hanya tampilkan approval yang ditugaskan, balasan tiket, invoice/bukti sesuai finance permission dan due dates organisasi sendiri.

Batas bukti: Sebagian; pola action list sesuai, exact end-client dashboard belum ditemukan.

Traceability: ACT-22-01, REM-22-01, SEC-22-01; G1.

![Action Center klien: pola antrian tindakan, sumber web](references/mobbin/G07-action-list.jpg)

### G08-mobile-actions: Mobile: Action Required / Waiting

[Docusign (ios)](https://mobbin.com/screens/1be1d33a-d303-4918-84fd-5bdced4d146a)

Terlihat: Docusign iOS memperlihatkan dua kartu Action Required dan Waiting for Others, agreement activity dan navigasi bawah.

Penerapan: Adaptasi ke web responsif: antrian perlu tindakan saya dan menunggu tim, dengan ringkasan approval/tiket/billing yang berizin. Bottom nav tetap Home/Documents/Helpdesk/More sesuai blueprint. Jangan mengambil e-signature, upgrade banner atau navigasi native sebagai requirement.

Batas bukti: Referensi iOS; bukan bukti implementasi web mobile.

Traceability: ACT-22-01, UX-22-01; G1.

![Mobile: Action Required / Waiting, sumber ios](references/mobbin/G08-mobile-actions.jpg)

### G09-mobile-decision: Mobile: kartu keputusan

[Remote (ios)](https://mobbin.com/screens/6f7ddbc3-3a49-492b-8de8-5f7c791cdf28)

Terlihat: Remote iOS memperlihatkan Pending requests dengan kartu dan tombol Decline/Approve, tanggal serta ringkasan.

Penerapan: Pola kartu dan dua tindakan hanya pembanding dari domain HR. Dokalio menampilkan exact version dan assignee, lalu konfirmasi keputusan; Request revision harus membuka form item revisi. Jangan melakukan approve hanya karena swipe atau membaca kartu.

Batas bukti: Referensi iOS dari request cuti, bukan approval dokumen atau pembayaran.

Traceability: APR-22-01/02, REV-22-01; G1.

![Mobile: kartu keputusan, sumber ios](references/mobbin/G09-mobile-decision.jpg)

### G10-mobile-documents: Mobile: katalog dokumen

[Dropbox (ios)](https://mobbin.com/screens/f520e6c9-1ce9-4b72-a7b4-615eefc813e0)

Terlihat: Dropbox iOS memperlihatkan Files, search, daftar thumbnail/nama/ukuran/waktu, overflow action dan navigasi bawah.

Penerapan: Gunakan daftar satu kolom dengan judul dan metadata ringkas serta filter yang dapat dijangkau. Katalog Dokalio berisi tautan, jadi jangan mengambil Upload/Scan/Camera uploads. URL tetap memerlukan izin Drive.

Batas bukti: Referensi iOS; metadata dan thumbnail Dokalio hanya jika diizinkan.

Traceability: DOC-22-02, UX-22-01; G1.

![Mobile: katalog dokumen, sumber ios](references/mobbin/G10-mobile-documents.jpg)

### G11-mobile-ticket: Mobile: form tiket halaman penuh

[GOAT (ios)](https://mobbin.com/screens/478a2bb4-f881-468a-a4a9-f62722531486)

Terlihat: GOAT iOS memperlihatkan New Request, kategori, description, Attachments dan Submit dalam layar penuh tanpa modal overlay.

Penerapan: Pembanding struktur dari e-commerce saja. Dokalio memakai Subject/Category/Description, konteks project/service/document, lampiran dan kirim. Nomor order dan klasifikasi buyer tidak diambil. Form mobile boleh scroll vertikal; jangan menaruh attachment pada layar tersembunyi.

Batas bukti: Referensi iOS; screenshot form terlihat utuh, bukan test Safari/Chrome mobile.

Traceability: HLP-22-01/02, UX-22-01; G1.

![Mobile: form tiket halaman penuh, sumber ios](references/mobbin/G11-mobile-ticket.jpg)

### G12-mobile-attachments: Mobile: preview dan hapus lampiran

[Brilliant (ios)](https://mobbin.com/screens/f5fc0cca-fe47-4f14-a3ae-15edd5dc59cf)

Terlihat: Brilliant iOS memperlihatkan New ticket dengan description, thumbnail screenshot, tombol hapus, tombol tambah dan Submit.

Penerapan: Ambil thumbnail, remove dan add-file yang mudah dijangkau; Dokalio juga merancang progress, retry, invalid file dan accessibility labels. Tidak mengadopsi branding atau provider ticketing pada contoh.

Batas bukti: Referensi iOS dari aplikasi pendidikan, digunakan untuk struktur lampiran saja.

Traceability: HLP-22-02, UX-22-01; G1.

![Mobile: preview dan hapus lampiran, sumber ios](references/mobbin/G12-mobile-attachments.jpg)

### G13-mobile-empty: Mobile: tidak ada tindakan tertunda

[Deel (ios)](https://mobbin.com/screens/28f8bdc3-5ea8-4bb8-b0f7-0ff4bab4bb2c)

Terlihat: Deel iOS memperlihatkan Upcoming actions, No payments due dan No pending items to approve dengan tombol nonaktif.

Penerapan: Gunakan empty state jujur, tanpa kartu approval atau invoice buatan. Tombol nonaktif harus memiliki penjelasan yang bisa dibaca screen reader atau tidak ditampilkan bila tidak diperlukan. Jangan mengadopsi add people/payroll/HR.

Batas bukti: Referensi iOS dari HR/operator, hanya pola empty state.

Traceability: ACT-22-01, UX-22-01; G1.

![Mobile: tidak ada tindakan tertunda, sumber ios](references/mobbin/G13-mobile-empty.jpg)

## Brief desain yang melengkapi referensi

### Verifikasi bukti bayar

Rancang halaman admin dengan bukti bayar sebagai panel utama, detail invoice/klien/nominal/tanggal di samping, serta keputusan Verify atau Reject dengan alasan. Sebelum menyimpan, admin memastikan pembayaran benar-benar diterima. Tombol bukan approve payment outgoing. State minimum: PendingVerification, verifying/processing, Verified, Rejected, evidence unreadable, amount mismatch, underpaid, duplicate proof, already verified, permission denied, storage error dan retry. Verifikasi dan payment record harus idempoten. Client hanya melihat status dan alasan yang boleh dibagikan, tidak dapat self-mark Paid. Source: blueprint PAY-22-01, bukan klaim kemampuan G01/G02.

### Revisi per item

Setiap item memuat ID, bagian yang dirujuk, teks perubahan, pembuat/waktu, state, respons tim dan referensi versi hasil. Daftar dapat difilter unresolved/resolved. CTA Request revision mengharuskan minimal satu item. Tandai item ditangani tidak menyetujui versi. Versi baru memerlukan pengajuan dan keputusan baru; versi lama tidak hilang. Untuk mobile, daftar item berada di halaman utama dan detail item dibuka sebagai halaman penuh, bukan panel sempit.

### Tambah link Drive

Form admin: paste URL → validasi domain/format → metadata jika diizinkan atau fallback title manual → kategori/client/project/service → visibility → Preview audiens/versi → Publish eksplisit. Status fetching, denied, invalid URL, stale preview dan permission unknown harus punya teks yang jujur. Uji salah organisasi dan jangan menampilkan isi file privat melalui proxy. G05 adalah pola input, G06 adalah referensi sharing eksternal; tidak ada klaim keduanya sudah merupakan integrasi lengkap.

### Action Center klien

Home client owner/member memprioritaskan Perlu tindakan saya, Menunggu tim dan tenggat terdekat, masing-masing membuka objek kanonik. Kartu menampilkan jenis, konteks proyek/layanan, versi/tenggat dan CTA yang berizin. Finance card hilang bagi user tanpa izin finance; approval hanya bagi assignee ditunjuk. Konten yang sudah selesai/superseded berhenti meminta tindakan. Detail historis tetap di timeline. Jangan menyalin payroll, hiring, spending analytics atau onboarding checklist HR.

### Adaptasi web mobile

Contoh iOS hanya referensi penempatan dan kepadatan. Dokalio tetap web/PWA, dengan bottom nav Home/Documents/Helpdesk/More. Rancang 360/390/768/1280px dengan natural vertical scroll, tanpa horizontal overflow. Input dan CTA tetap dapat dijangkau saat keyboard terbuka; status/fokus/loading/error tidak bergantung pada warna. Periksa judul panjang ID/EN, angka/mata uang, locale invoice terpisah, tap target, zoom bukti bayar, file picker web dan feedback upload.

Untuk bukti bayar mobile: halaman detail invoice → unggah bukti → preview file/claimed amount/date → kirim → PendingVerification. Tidak ada auto-Paid. Ini brief turunan blueprint yang belum memiliki referensi screen mobile finansial persis; jangan menyebut gap itu sudah tertutup.

## Acceptance review referensi

- UI-MOB-02: review bukti bayar mencantumkan G01/G02 sebagai analog, wireframe Dokalio dan semua state PAY-22-01 sebelum implementasi. Tanpa bukti eksternal persis, label kecocokan sebagian tetap dipertahankan.
- UI-MOB-03: revisi memperlihatkan daftar item, resolved/unresolved, respons tim dan hubungan versi; Resolve tidak sama dengan Approve.
- UI-MOB-04: form Drive memperlihatkan URL/title, konteks, audience preview dan permission fallback; Publish tidak mengubah izin file.
- UI-MOB-05: Action Center divalidasi untuk client owner/member berizin dan tidak berizin finance/approval; G07 sendiri bukan bukti dashboard klien.
- UI-MOB-06: mockup dan UAT web mobile diuji tersendiri; label sumber iOS tidak dihilangkan. Form tiket mengikuti pilihan pengguna berupa halaman penuh dengan attachment dan CTA jelas.

UI-MOB-02..06 adalah rincian review desain dari UI-MOB-01, bukan gate produk atau keputusan discovery baru. Tidak perlu meminta ulang sebelas keputusan atau kembali meminta screenshot/collection yang sudah disimpan.

## Referensi yang ditolak dan gap tersisa

Copilot yang ditemukan berupa halaman marketing dengan screenshot kecil; tidak dipakai sebagai bukti dashboard client. Upwork review-and-pay memuat auto-release setelah tenggat; tidak diambil agar tidak mengaburkan larangan auto-approve Dokalio. Hasil pencarian expense receipt berupa invoice preview/agent report tidak dipakai sebagai bukti verifikasi transfer. Pencarian Figma resolved comments menghasilkan nol hasil pada query ini, bukan bukti Figma tidak tersedia di Mobbin.

Kelanjutan kurasi setelah pembatasan layanan berakhir dapat menargetkan: receipt incoming payment verification, exact client-facing action dashboard, URL ingestion dengan metadata/publish, serta invoice/payment proof pada viewport mobile web. Sampai ada bukti baru, gap persis tersebut tetap terbuka meskipun pola visual pembanding dan brief desain sudah tersedia.

## Handoff

Baca bersama MOBBIN_REFERENCES.md dan blueprint v2.2. Mulai wireframe invoice/verifikasi G0.5 lalu surface G1. Gunakan pola yang terlihat, pertahankan aturan Dokalio, dan catat keputusan adaptasi. Tidak ada kode/config/runtime yang diubah oleh kurasi ini. Desain final, prototype, UAT dan acceptance implementasi belum dijalankan.
