# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Acuan normatif: `C:\Projects\dokalio\Dokalio_Client_Workspace_Blueprint_v2.2.md` (CP-001, 5 November 2026). Bila file ini berbeda dengan blueprint, blueprint yang berlaku.

Dua sisi dilayani dengan bobot setara; setiap surface menentukan sendiri peran mana yang dilayaninya.

- **Penyedia jasa (workspace = tenant SaaS):**
  - *Workspace owner/admin* — mengelola klien dan akses, membuat/publish dokumen, membuat/review/issue invoice (dengan izin finance), memverifikasi bukti bayar, melihat antrian tindakan lintas klien dalam workspace sendiri.
  - *Team* — mengerjakan tiket dan hasil kerja sesuai assignment dan izin eksplisit.
- **Klien (client organization di dalam workspace):**
  - *Client owner* — melihat materi terbit, mengelola anggota sesuai kebijakan, menyetujui hasil kerja hanya bila ditunjuk.
  - *Client member* — melihat materi terbit, membuat tiket, melihat invoice dan mengunggah bukti bayar hanya bila diberi akses finance.
- Klien yang hanya ditagih boleh punya record organisasi tanpa akun portal.

Pendaftaran pilot invitation-only. Pilot awal: satu penyedia jasa yang melayani banyak organisasi klien; model data sudah memisahkan workspace dari client organization sejak awal.

## Product Purpose

Dokalio menyatukan hubungan kerja penyedia jasa dan klien dalam satu konteks klien: menemukan dokumen, meminta bantuan, menyetujui hasil kerja per versi, memantau proyek atau layanan berulang, dan mengelola invoice.

Sukses berarti: lebih sedikit permintaan kirim ulang tautan, keputusan yang dapat ditelusuri per versi, invoice akurat setelah pemeriksaan manusia, dan satu riwayat bantuan yang jelas.

## Positioning

Workspace hubungan klien di mana **satu perubahan sah disimpan sekali pada objek kanonik dan tercermin di semua layar yang berwenang** ("Update Once, Reflect Everywhere"). Manusia selalu memegang keputusan: tidak ada auto-approve, auto-issue, atau auto-Paid; AI dan scheduler hanya membuat draft.

Bukan pengganti Google Drive, bukan aplikasi akuntansi lengkap, bukan CRM penjualan, bukan helpdesk dengan SLA bertingkat.

## Operating Context

- **Home klien = Action Center:** tindakan tertunda (perlu approval, revisi, balasan tiket ditunggu, invoice jatuh tempo, bukti bayar menunggu verifikasi, periode layanan berikutnya), masing-masing membuka objek kanonik. Daftar kosong berarti tidak ada tindakan; tidak diisi grafik buatan.
- **Navigasi utama:**
  - Klien: Home/Action Center, Documents, Helpdesk, More (Projects & Services, Approvals, Billing & Renewals, anggota, profil). Mobile klien: Home / Documents / Helpdesk / More.
  - Admin: Action Center, Clients, Documents, Helpdesk Inbox, Invoices.
  - Team: My Work, Tickets, Documents, Projects.
  - Desktop memakai sidebar ringkas.
- **Alur kunci:** Draft → Preview → Publish untuk materi; Draft → Preview → konfirmasi admin → Issued untuk invoice; approval per versi oleh penanggung jawab yang ditunjuk (satu keputusan sah cukup); revisi terstruktur memerlukan approval ulang pada versi baru; bukti bayar masuk PendingVerification sampai admin memverifikasi.
- **Google Drive** tetap sumber isi dan izin berbagi; Dokalio menyimpan link, metadata yang diizinkan, dan revisi publikasi. Link Drive yang gagal dibuka menawarkan "Minta bantuan akses" sebagai tiket kontekstual.
- **Helpdesk kontekstual:** tiket terkait proyek/layanan/dokumen, satu thread kronologis, lampiran privat, internal note tidak pernah terlihat klien.
- Bidang usaha penyedia (mis. konsultansi Power Platform vs. agensi umum) **belum diputuskan**; produk ditujukan untuk penyedia jasa secara umum.

## Capabilities and Constraints

- **Urutan gate:** G0 security/deployment blockers → G0.5 pilot invoice admin (manual / AI draft / draft periodik, Preview → Issue, PDF privat ID/EN, verifikasi bukti) → G1 portal klien (Action Center, approval/revisi, Drive hub, Helpdesk, upload bukti klien, reminder in-app) → G2 email/WhatsApp → G3 template/Kanban → G4 komersialisasi SaaS.
- **Status implementasi:** spesifikasi v2.2 selesai; belum ada fitur Dokalio yang diimplementasikan atau diuji. G0 belum lulus.
- **Kandidat fondasi:** checkout Pulseo (Next.js 16, Better Auth, Drizzle, PostgreSQL, graphile-worker) — reuse bersyarat audit. Selisih utama yang diketahui: Pulseo belum punya lapisan workspace (organisasinya = klien), belum ada tabel invoice/payment/approval/Drive/reminder/outbox, status tiket dan peran berbeda, locale hanya `fr`/`en` via cookie.
- **Bahasa:** UI `id` atau `en` per pengguna, tersimpan di profil dan berlaku lintas sesi; bahasa Prancis upstream bukan requirement. Bahasa invoice dipilih terpisah dan dibekukan saat terbit. Konten pengguna tidak diterjemahkan otomatis.
- **Uang:** dihitung di server dengan decimal exact / minor units; tidak ada angka final dari AI.
- **Isolasi:** setiap read, write, search, export, file, job, cache, dan notifikasi memeriksa workspace, organisasi, membership, dan objek di server. Menyembunyikan tombol tidak cukup.
- **UX:** tidak ada tabel yang memaksa scroll horizontal untuk tugas inti; form tiket dapat dipakai pada 360px; tersedia state loading, empty, permission denied, validation, success, stale version, network error, dan retry aman.
- **Belum ditetapkan:** batas upload, retensi, SLO/RPO/RTO, frekuensi reminder, budget; metode login final (blueprint menyebut email/password, kandidat memakai magic link sebagai default).
- **Di luar MVP:** public signup, payment gateway, auto-approve/issue, Drive full sync, public API, full accounting, advanced SLA, broadcast WhatsApp.

## Brand Commitments

- Nama produk: **Dokalio** (terkunci; pemeriksaan domain/merek belum dinyatakan selesai).
- Belum ada aset brand Dokalio: tidak ada logo, warna, maupun panduan suara. Logo `public/logo-*.svg` dan warna `#2563EB` milik Pulseo, bukan komitmen Dokalio.
- Branding workspace dibaca dari configuration layer, bukan hardcode di komponen (persiapan G4 branding per tenant).
- Referensi Mobbin Pro sudah dipulihkan dan dikurasi ulang pada 5 November 2026. Baca [Mobbin References & Handoff](docs/MOBBIN_REFERENCES.md), termasuk gambar lokal, batas bukti dan UI-MOB-01 sebelum implementasi surface UI. Tidak perlu meminta koleksi/screenshot yang sama lagi.

## Evidence on Hand

- Spec kit v2.2 di `C:\Projects\dokalio`: blueprint, PRD, SRS, DESIGN.md (IA & UX, bukan sistem visual), USER_FLOWS, DB_SCHEMA, API_CONTRACT, TEST_PLAN, TRACEABILITY, QUALITY_GATE; integritas file tercatat di MANIFEST.md.
- Journey J01–J11 dan acceptance criteria SEC/PUB/APR/REV/REM/ACT/CTX/INV/PAY/DOC/HLP/LNG/EVT/NOT/UX/OPS di blueprint bagian 13 dan 19.
- Tidak ada pelanggan, testimoni, studi kasus, harga, atau hasil uji implementasi; jangan dibuat-buat.

## Product Principles

1. **Manusia memutuskan, sistem mengingatkan.** AI dan scheduler hanya membuat draft; publish, issue, approve, dan Paid selalu tindakan eksplisit pengguna berwenang.
2. **Satu objek kanonik.** Status bisnis disimpan sekali dan diproyeksikan; tidak ada salinan status yang bisa diedit terpisah. Snapshot historis (PDF terbit, keputusan approval, audit) tidak berubah.
3. **Tindakan didahulukan.** Home menampilkan apa yang perlu dilakukan dan membuka objeknya, bukan grafik.
4. **Isolasi dan izin di server, selalu.** Tidak ada kebocoran nama, nominal, atau keberadaan objek lintas workspace/organisasi.
5. **Navigasi ramping.** Proyek, layanan, approval, dan billing tampil kontekstual; fitur lanjutan tidak boleh memperpadat jalur menemukan dokumen atau meminta bantuan.

## Accessibility & Inclusion

- Warna bukan satu-satunya pembeda status.
- Fokus keyboard, label pembaca layar, dan konfirmasi tindakan tersedia.
- UI bilingual `id`/`en` per pengguna, termasuk label aksesibilitas; tanggal/angka mengikuti locale tampilan dan zona waktu tenggat ditampilkan jelas.
- Form inti dapat dipakai pada viewport 360px.
