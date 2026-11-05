# Dokalio v2.2: Mobbin Design References & Handoff

5 November 2026 · CP-001 · Platform referensi: web.

## Kedudukan dan keputusan

**Mobbin Pro dipakai untuk desain Dokalio.** Dokumen ini memulihkan referensi discovery awal dan menambahkan kurasi baru melalui koneksi Mobbin. Ini koreksi kelengkapan spesifikasi v2.2; sebelas keputusan produk tidak dibuka ulang.

Blueprint tetap acuan perilaku, keamanan dan state bisnis. Referensi adalah bahan untuk merancang UI asli Dokalio. Memilih contoh Stripe/Airwallex tidak memilih payment provider atau integrasi API. Menelaah PandaDoc tidak menambahkan e-signature atau document editor.

Set aktif setelah penggantian berisi 11 screen terpilih dan 2 flow pendamping, dengan 15 gambar lokal. Preview screen ditinjau secara visual; M11 juga diperiksa pada resolusi penuh. Untuk flow, hanya posisi yang dicatat di bawah yang diperiksa; tidak ada klaim seluruh layar atau produk diaudit. Screenshot resolusi penuh diunduh dari image_url hasil tool dan disimpan lokal agar referensi tidak hilang saat URL sementara kedaluwarsa.

Gambar lokal tidak di-commit ke repo aplikasi publik karena merupakan UI pihak ketiga yang dikurasi Mobbin; salinan utama ada di kit privat `C:/Projects/dokalio/references/mobbin/`.

## Referensi terdahulu yang dipulihkan

| Referensi historis | Tujuan awal | Status saat kurasi ulang |
|---|---|---|
| [Dropbox](https://mobbin.com/screens/8f6b34cd-2a14-47a7-86db-5e905e64c44a) | Document Hub | Link dipulihkan dari v2.1, tidak diverifikasi ulang sebagai screen yang sama; gunakan M01/M02 untuk bukti visual baru |
| [Zendesk](https://mobbin.com/screens/3156ae05-1afc-4c44-8335-bf21078eebf7) | Helpdesk | Link historis; M03 adalah screen baru yang ditinjau |
| [Jobber](https://mobbin.com/screens/740e3f39-e437-4e54-9d14-774d50e7b507) | Dashboard | Link historis; M04 adalah dashboard operator yang benar-benar terlihat pada kurasi baru |
| [PandaDoc](https://mobbin.com/screens/fe19281f-c27e-4481-b36a-a8a4bd48162c) | Konteks dokumen | ID yang sama ditemukan dan ditinjau kembali pada M08; layar berupa daftar dokumen, bukan bukti alur approval lengkap |
| [Teachable](https://mobbin.com/flows/d25380ac-e178-4050-b1aa-95803094165a?tab=screens) | Pembuatan tiket | Link historis; hasil baru yang ditinjau berupa Help entry F03. Form submit halaman penuh pengganti tersedia pada M11 |

Status historis tidak berarti link mati atau sudah diuji aksesnya pada sesi ini. Pilihan awal Dropbox × Zendesk × Jobber dipertahankan sebagai arah pola, dengan tambahan pembanding invoice dan approval.

## Screen terpilih dan penerapan

### M01-document-browser: Document Hub

[Dropbox di Mobbin](https://mobbin.com/screens/fc28609e-828f-488e-9914-356a1e53ddce)

Terlihat pada preview: Dropbox menampilkan pencarian di atas dan area file/folder di bawah.

Penerapan pada Dokalio: Ambil penempatan search dan perpindahan daftar/grid jika relevan. Dokalio menampilkan katalog link; jangan menambah upload salinan Drive, PDF editor, e-signatures atau onboarding overlay dari contoh.

Traceability: DOC-22-01/02; G1.

![Dropbox: Document Hub](references/mobbin/M01-document-browser.jpg)

### M02-document-search: Pencarian dokumen

[Dropbox di Mobbin](https://mobbin.com/screens/f72e459b-c02c-4682-b3e9-3eacdccef7f8)

Terlihat pada preview: Dropdown pencarian menampilkan suggestions dan hasil file dengan judul serta waktu.

Penerapan pada Dokalio: Hasil Dokalio harus difilter tenant/org/object sebelum muncul; jangan tampilkan nama atau thumbnail dokumen yang tidak berhak dilihat.

Traceability: DOC-22-02, SEC-22-01; G1.

![Dropbox: Pencarian dokumen](references/mobbin/M02-document-search.jpg)

### M03-helpdesk-thread: Helpdesk admin/team

[Zendesk di Mobbin](https://mobbin.com/screens/fa0613e4-9f82-4fca-9899-235380ca0168)

Terlihat pada preview: Zendesk memperlihatkan thread di tengah, konteks request/assignment di sisi kiri, serta area public reply di bawah.

Penerapan pada Dokalio: Gunakan satu thread dan konteks proyek/layanan/dokumen. Ringkas panel klien; internal note harus jelas berbeda dan tidak ikut notifikasi klien. Hindari menyalin seluruh kepadatan panel operator.

Traceability: HLP-22-01/02; G1.

![Zendesk: Helpdesk admin/team](references/mobbin/M03-helpdesk-thread.jpg)

### M04-action-center: Action Center

[Jobber di Mobbin](https://mobbin.com/screens/fe42d222-ebc8-42b2-87a0-928d36697abf)

Terlihat pada preview: Jobber home menampilkan kelompok workflow Requests, Quotes, Jobs, Invoices serta bagian To do.

Penerapan pada Dokalio: Ini dashboard operator, bukan bukti dashboard client. Ambil pengelompokan status dan tindakan; Dokalio memprioritaskan tugas pending sesuai role dan tidak mengadopsi grafik/revenue atau trial banners.

Traceability: ACT-22-01, REM-22-01; G1.

![Jobber: Action Center](references/mobbin/M04-action-center.jpg)

### M05-client-context: Unified client workspace

[Jobber di Mobbin](https://mobbin.com/screens/fd47e7a5-dbce-47e9-8529-f5525ae8354c)

Terlihat pada preview: Detail klien Jobber menampilkan kontak, overview dengan tab pekerjaan dan invoice, serta last communication.

Penerapan pada Dokalio: Pertahankan satu header klien dan konteks project/service; data billing tetap mengikuti finance permission. Jangan menambah property management ke scope.

Traceability: CTX-22-01, SEC-22-01; G1.

![Jobber: Unified client workspace](references/mobbin/M05-client-context.jpg)

### M06-invoice-review: Preview sebelum Issue

[Stripe di Mobbin](https://mobbin.com/screens/d32b7853-ec0d-4470-af0e-b6bab908c388)

Terlihat pada preview: Stripe memperlihatkan invoice preview di kanan dan pengaturan tindakan/recipient di kiri, termasuk pilihan finalise only.

Penerapan pada Dokalio: Pisahkan Preview, Issue dan Send. CTA Dokalio harus mengharuskan admin mengonfirmasi versi, total dan locale. Jangan mengadopsi edit-after-issued atau send otomatis yang mungkin disiratkan contoh.

Traceability: INV-22-01/02, LNG-22-02; G0.5.

![Stripe: Preview sebelum Issue](references/mobbin/M06-invoice-review.jpg)

### M07-invoice-pdf: Preview PDF pembanding

[Square di Mobbin](https://mobbin.com/screens/ff3c2be2-17af-4d0d-981f-ba2b18731e34)

Terlihat pada preview: Square client view memperlihatkan halaman invoice dengan line items dan total serta pilihan PDF.

Penerapan pada Dokalio: Gunakan untuk keterbacaan dokumen dan total. Deposit, split payment, QR payment dan payment gateway pada contoh bukan tambahan scope Dokalio.

Traceability: INV-22-02, LNG-22-02; G0.5.

![Square: Preview PDF pembanding](references/mobbin/M07-invoice-pdf.jpg)

### M08-document-status: Status dan filter dokumen

[PandaDoc di Mobbin](https://mobbin.com/screens/fe19281f-c27e-4481-b36a-a8a4bd48162c)

Terlihat pada preview: PandaDoc menampilkan daftar dokumen dengan filter Date, Status, Owner, Recipient, Company dan label Draft/Completed.

Penerapan pada Dokalio: Ambil filter status/konteks yang relevan. Draft/published/approval Dokalio harus memiliki makna terpisah; Completed contoh tidak membuktikan approval per versi.

Traceability: PUB-22-01, DOC-22-01; G1.

![PandaDoc: Status dan filter dokumen](references/mobbin/M08-document-status.jpg)

### M09-document-actions: Antrian review dokumen

[PandaDoc di Mobbin](https://mobbin.com/screens/fcf97436-55d3-4405-9448-b318c61fd880)

Terlihat pada preview: PandaDoc Home memisahkan Drafts, Actions required dan Finalized, dengan timeline di kanan.

Penerapan pada Dokalio: Gunakan pemisahan antrian dan detail kejadian sebagai pembanding Action Center. Jangan mengasumsikan Finalized berarti pembayaran atau approval sah di Dokalio.

Traceability: ACT-22-01, APR-22-01; G1.

![PandaDoc: Antrian review dokumen](references/mobbin/M09-document-actions.jpg)

### M10-approval-confirm: Konfirmasi approval

[7shifts di Mobbin](https://mobbin.com/screens/cdd81545-b515-4664-b2d2-caaa0dbcc7cb)

Terlihat pada preview: 7shifts memperlihatkan tombol Approve/Request changes dan dialog konfirmasi Approve document.

Penerapan pada Dokalio: Referensi dari domain HR, digunakan untuk struktur konfirmasi saja. Dokalio menambahkan nomor versi, penanggung jawab dan dampak keputusan; approval bukan tanda tangan legal atau ekspor otomatis.

Traceability: APR-22-01/02, REV-22-01; G1.

![7shifts: Konfirmasi approval](references/mobbin/M10-approval-confirm.jpg)

## Flow pendamping

### F01-invoice: Form invoice admin

[Airwallex: Creating an invoice](https://mobbin.com/flows/45967791-df7e-43f8-954a-4c45b5e30e20?tab=screens)

Flow memiliki 12 screen. Posisi yang ditinjau: 5, 8, 12. Posisi 5 memperlihatkan customer/currency/line items dan total; posisi 8 menampilkan invoice settings dengan due-date options; posisi 12 menampilkan invoice detail dengan label Finalised dan Unpaid.

Penerapan: Gunakan urutan form, pemeriksaan tanggal dan detail hasil. Tambahkan Review → explicit admin Issue sesuai blueprint; jangan menebak langkah yang tidak ditinjau atau mengadopsi subscription/payment automation.

Traceability: J05/J06, INV-22-01/02/03; G0.5.

![Airwallex posisi 5](references/mobbin/F01-invoice-step-5.jpg)

![Airwallex posisi 8](references/mobbin/F01-invoice-step-8.jpg)

![Airwallex posisi 12](references/mobbin/F01-invoice-step-12.jpg)

### M11-ticket-form: Form tiket halaman penuh

[Resend: Contact support](https://mobbin.com/screens/348d67b2-ac8e-4a10-ba66-b2746248c740)

Menggantikan F02-ticket/Midday atas koreksi pengguna: gunakan halaman penuh dengan form dan lampiran terlihat utuh. Screenshot resolusi penuh 1920 × 1325 diperiksa langsung; blok Contact support terlihat lengkap dari judul sampai tombol Send Help Request. Di contoh, form ini berupa kartu inline yang dapat ditutup (tombol Close) di halaman Help, di bawah kotak tanya AI; bukan modal atau side panel. Dokalio mengambil komposisi formnya sebagai halaman penuh tersendiri; kotak AI dan bagian halaman lain di atasnya tidak menjadi acuan.

Terlihat: Subject, Message, Attachments dengan area drag-and-drop/click, pilihan current impact dan tombol kirim. Screenshot memperlihatkan angka batas file dan jenis yang diterima oleh contoh; angka itu bukan kebijakan upload Dokalio.

Penerapan Dokalio: form halaman penuh dengan Subject/Category/Description; tampilkan konteks project/service/document yang terisi dari jalur asal; area lampiran privat dan tombol Kirim harus terlihat jelas. Di mobile, layout tetap halaman penuh dan boleh scroll vertikal alami, tanpa horizontal overflow atau menyembunyikan area attachment pada panel terpisah.

Referensi ini hanya membuktikan komposisi form, bukan status sukses, otorisasi tenant, keamanan upload atau konteks proyek. Daftar lampiran, progress upload, remove/retry, validation dan feedback tiket berhasil harus dirancang sesuai blueprint. Jangan mewarisi kebijakan limit file atau severity sebagai requirement baru tanpa keputusan operasional.

Traceability: J08, HLP-22-01/02, UX-22-01; G1. Referensi produk email digunakan untuk struktur support form saja; bukan pemilihan integrasi email.

![Resend: form tiket utuh dengan area attachment](references/mobbin/M11-ticket-form.jpg)

### F03-help-entry: Pintu masuk Helpdesk

[Teachable: Help](https://mobbin.com/flows/d4779c96-61d6-4005-bf6e-7e13c76bdad5?tab=screens)

Flow memiliki 2 screen. Posisi yang ditinjau: 2. Posisi 2 menampilkan halaman Help dengan My tickets dan Message Support.

Penerapan: Gunakan jalur jelas menuju tiket dan daftar tiket. Live chat, knowledge base dan jam layanan pada contoh tidak ditambahkan ke scope.

Traceability: J08, HLP-22-01; G1.

![Teachable posisi 2](references/mobbin/F03-help-entry-step-2.jpg)

## Hasil yang tidak dipakai sebagai bukti

F02-ticket/Midday ditolak pengguna karena tampilan tidak memadai. Dua gambar dan metadata lamanya dipindahkan ke arsip, tidak lagi digunakan sebagai referensi aktif. M11 menggantikannya dengan form halaman utama yang area attachment dan tombol kirimnya terlihat utuh. Hasil beehiiv/Mintlify berbentuk modal dan contoh Supabase terpisah pada beberapa posisi scroll; tidak dipilih untuk permintaan halaman penuh dengan form utuh ini.

Pencarian approval PandaDoc sempat menghasilkan flow Importing a file. Itu bukan alur approval dan tidak dipakai untuk membuktikan requirement. Pencarian approval generik menghasilkan Cofounder; tidak dipilih karena konteksnya berbeda. Contractbook memperlihatkan konfigurasi automation request approval; bukan pengalaman approver dan tidak dipakai sebagai acuan utama. Tidak ada fitur yang disimpulkan hanya dari nama hasil pencarian.

## Urutan desain dan gate review

| Urutan | Surface | Referensi | Deliverable sebelum implementasi UI |
|---|---|---|---|
| 1, G0.5 | Invoice list/form, Preview/Issue, PDF, proof verification admin | M06/M07, F01 | Wireframe desktop/mobile, locale ID/EN, currency/rounding display, processing/failure/retry, duplicate issue dan payment verification states |
| 2, G1 | Action Center klien/admin/team | M04/M05/M09 | Antrian sesuai role, versi dan tenggat; finance permission; empty/no-action; stale CTA; no auto-approve |
| 3, G1 | Document Hub dan Preview/Publish | M01/M02/M08 | Daftar/search/filter, draft tersembunyi, audience preview, metadata fallback, permission denied dan request-access ticket |
| 4, G1 | Helpdesk | M03, M11, F03 | Form berisi konteks, thread, public/internal reply, lampiran, waiting/resolved/reopen states |
| 5, G1 | Approval/revisi dan payment proof klien | M10, M09 sebagai pembanding status | Exact version/assignees, approve/request revision, concurrent/stale decision, revision items dan status PendingVerification |

**UI-MOB-01: wajib review referensi sebelum implementasi setiap surface UI terkait.** G0 source/security audit dapat berjalan tanpa menunggu desain. G0.5 harus memiliki bukti desain invoice; G1 harus memiliki bukti desain surface G1 yang akan dirilis. Tidak perlu menunggu seluruh UI produk untuk memulai invoice.

Setiap review mencatat: requirement/journey, screen ID yang dipakai, pola yang diambil, hal yang sengaja tidak diambil, wireframe Dokalio, desktop/mobile, state dan keterbatasan, lalu hasil review. Bila screen tidak sesuai, tandai ditolak dan ganti dengan alasan; tidak perlu bertanya ulang sebelas keputusan.

## Brief desain untuk OrcaDev

Gunakan dokumen ini dan blueprint v2.2 sebagai input tahap shape/document sebelum implementasi UI. Mulai invoice G0.5, lalu surface G1 sesuai roadmap. Hasilkan komponen dan token visual Dokalio yang konsisten, bukan campuran warna/logo vendor referensi.

Tidak ada perubahan warna brand, logo, metode login atau fitur bisnis yang disetujui melalui kurasi ini. Jika aset brand belum tersedia, tandai token sebagai usulan desain dan lanjutkan wireframe. Angka pada contoh tidak menjadi tarif/pajak/nominal produk.

Referensi web desktop tidak membuktikan layout mobile. Turunkan layout untuk 360/390/768/1280px, keyboard focus, screen reader labels, label ID/EN panjang, loading/empty/permission/validation/success/stale/network/retry. Uji state internal note tidak terbaca klien, finance cards tersaring, draft tidak terlihat dan invoice issued tidak berubah.

Satu tombol konfirmasi bukan bukti backend authorization atau audit; implementasi harus tetap memenuhi acceptance keamanan. Revision items, version stability Drive, payment-proof verification dan reminder suppression terutama berasal dari blueprint Dokalio; referensi visual tidak dijadikan bukti bahwa produk lain memenuhi aturan itu.

## Readiness setelah pemulihan

Referensi historis sudah dicatat, kurasi baru memiliki bukti preview dan screenshot lokal, dan handoff desain dapat dimulai tanpa meminta pengguna mengirim koleksi Mobbin lagi. Desain final, token/brand, prototype/UAT, implementasi UI dan pengujian aplikasi belum dilakukan dalam pekerjaan ini. Koneksi Mobbin hanya digunakan untuk pencarian; tidak membuat/mengubah koleksi atau akun.
