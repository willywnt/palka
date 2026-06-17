# Persiapan Hukum Bisnis SaaS di Indonesia + Analisis Merek "Palka" vs "Falka"

> Status: **Riset informatif (2026-06-15), BUKAN nasihat hukum formal.** Disusun untuk
> pendiri Falka/Palka sebagai bahan diskusi dengan penasihat hukum & konsultan KI (Kekayaan
> Intelektual) terdaftar. Banyak situs pemerintah memblokir akses otomatis saat riset, jadi
> sebagian fakta berasal dari kutipan sumber sekunder terpercaya yang terkorroborasi ≥2 sumber.
> **Sebelum mengambil keputusan final (terutama lisensi pembayaran & pendaftaran merek),
> verifikasi dengan profesional.** Angka pajak/biaya & status regulasi 2025–2026 berubah cepat.

Dokumen ini punya 4 bagian:

1. **Bagian 1** — Checklist legal/regulasi menjalankan SaaS di Indonesia.
2. **Bagian 2** — Analisis merek "Palka" vs "Falka" + temuan PDKI.
3. **Bagian 3** — Draf uraian barang/jasa (Kelas 42/9/35) siap pakai untuk pendaftaran.
4. **Bagian 4** — Alternatif nama (coined) sebagai cadangan.

---

## Bagian 1 — Persiapan Legal/Regulasi Bisnis SaaS

### 1.0 Ringkasan prioritas

| Item | Status | Kapan wajib |
|---|---|---|
| Badan usaha (PT Perorangan/PT) + NIB/OSS + NPWP | 🔴 Harus segera | Saat mulai operasi komersial / terima pembayaran |
| Pendaftaran **PSE Lingkup Privat** (Komdigi) | 🔴 Harus segera | Sebelum layanan dipakai publik |
| Kebijakan Privasi + Syarat & Ketentuan + alur persetujuan (UU PDP) | 🔴 Harus segera | Sebelum kumpulkan data user |
| **DPA** dgn cloud (Cloudflare) + dasar transfer lintas batas | 🔴 Harus segera | Sebelum simpan data pribadi di R2 |
| Enkripsi token OAuth marketplace at-rest | 🔴 Harus segera | Sebelum integrasi live |
| Klausul IP-assignment + NDA (karyawan/kontraktor) | 🟠 Segera | Sebelum orang lain menyentuh kode |
| Pendaftaran merek (DJKI) | 🟠 Segera | Makin cepat makin baik (first-to-file) |
| PKP + PPN + e-Faktur | 🟡 Bisa menyusul | Saat omzet → Rp4,8 M/tahun |
| DPO (Pejabat Pelindungan Data) | 🟡 Tergantung skala | Saat penuhi kriteria (lihat 1.5) |
| Lisensi pembayaran (PJP/BI) | 🟢 Kemungkinan tidak perlu | Hanya jika app pegang/gerakkan dana |
| Pencatatan hak cipta kode (DJKI) | 🟢 Opsional | Kapan saja (bukti kepemilikan) |

### 1.1 Badan usaha

- **PT Perorangan** — tanpa modal minimum, didirikan 1 orang WNI lewat surat pernyataan online
  (tanpa akta notaris), wajib memenuhi kriteria UMK (modal ≤ Rp5 M **atau** omzet ≤ Rp15 M/tahun).
  Jalur teringan untuk founder solo. Dasar: UU Cipta Kerja + PP 8/2021.
- **PT biasa** — ≥2 pemegang saham, akta notaris; modal dasar fleksibel pasca-UU Cipta Kerja.
  Dibutuhkan saat ada co-founder/investor atau usaha melewati plafon UMK.
- **CV** — tanpa modal minimum, **bukan badan hukum** → sekutu aktif bertanggung jawab pribadi
  tak terbatas; kurang ideal untuk startup yang mau menarik investor.
- ⚠️ **Konsekuensi pajak terbaru (lihat 1.3):** per **PP 20/2026**, hanya **PT Perorangan**
  (+ orang pribadi & koperasi) yang masih boleh memakai PPh final 0,5% UMKM — **PT biasa & CV
  tidak**. Untuk founder solo yang ingin pajak ringan, **PT Perorangan** adalah sweet spot.
- PT PMA (ada pemegang saham asing): modal disetor minimum diturunkan jadi **Rp2,5 M** (Okt 2025,
  Perka BKPM 5/2025), tapi **rencana investasi > Rp10 M per KBLI** tetap; PMA **tidak** bisa pakai
  jalur UMK/PT-Perorangan/PPh 0,5%.

### 1.2 Perizinan — NIB / OSS / KBLI

- **NIB lewat OSS-RBA** (PP 5/2021) wajib untuk semua usaha. Tingkat izin tergantung tingkat
  risiko KBLI (Rendah = NIB saja; Menengah-Rendah = + Sertifikat Standar self-declared; dst.).
- **KBLI relevan:**
  - **62010** — Aktivitas Pemrograman Komputer *(kode inti SaaS)*
  - **62019** — Aktivitas Pemrograman Komputer Lainnya
  - **62029** — Konsultasi Komputer & Manajemen Fasilitas Komputer Lainnya
  - **58200** — Penerbitan Piranti Lunak *(jika dijual sebagai produk)*
  - **63122** — Portal Web/Platform Digital Komersial *(jika menjadi platform transaksional)*
  - **63111** — Aktivitas Pengolahan Data *(hosting/cloud)*
- ⚠️ Tingkat risiko per kode **dikonfirmasi di oss.go.id** sebelum daftar (sumber sekunder
  menyebut 62010 "rendah/menengah-rendah", belum terverifikasi dari portal resmi).

### 1.3 Pajak

| Pajak | Ketentuan |
|---|---|
| **NPWP badan** | Wajib saat pendirian (terintegrasi NIB/OSS) |
| **PPh Badan** | 22% (UU HPP 7/2021). Omzet ≤ Rp50 M dapat fasilitas Pasal 31E: diskon 50% (efektif 11%) atas bagian omzet sampai Rp4,8 M |
| **PPh Final 0,5% UMKM** | Omzet ≤ Rp4,8 M/tahun. **⚠️ PP 20/2026 (berlaku 22 April 2026): hanya untuk orang pribadi, PT Perorangan, koperasi.** PT biasa & CV **dikeluarkan**. Untuk OP & PT Perorangan kini **tanpa batas waktu** |
| **PPN** | Nominal **12%** (sejak 1 Jan 2025) **tapi efektif 11%** untuk barang/jasa non-mewah (mekanisme DPP 11/12). Langganan SaaS = Jasa Kena Pajak |
| **Ambang PKP** | **Rp4,8 M/tahun.** Di bawah itu tidak wajib pungut PPN (bisa menyusul). ⚠️ Ada wacana ambang diturunkan ke Rp600 jt–1,2 M (belum berlaku) |
| **e-Faktur** | Wajib begitu jadi PKP; lapor SPT Masa PPN bulanan via Coretax |

### 1.4 Pendaftaran PSE Lingkup Privat — 🔴 WAJIB

- **Dasar:** PP 71/2019 + Permenkominfo 5/2020 (kini di bawah **Komdigi**). Wajib untuk PSE yang
  memproses transaksi / data pribadi operasional / layanan digital — **tanpa pengecualian
  berdasar ukuran usaha**. SaaS ini kena minimal 3 pemicu (transaksi, layanan berbayar, olah data
  pribadi operasional).
- **Cara:** lewat OSS, terbit **TDPSE**, **gratis**, biasanya 5–7 hari kerja.
- **Sanksi bila tidak daftar:** bertingkat → teguran → denda/suspensi → **pemblokiran akses**
  (kasus mass-blocking 2022; penegakan makin ketat 2025).
- 📌 **Catatan jujur:** secara hukum **wajib**, tapi praktik penegakan selama ini menyasar
  platform besar/asing — risiko blokir untuk SaaS domestik kecil rendah. Tetap daftar (murah,
  cepat, prasyarat kredibilitas B2B & integrasi).

### 1.5 Pelindungan Data Pribadi (UU PDP 27/2022) — 🔴 KRITIS

- **Berlaku penuh sejak 17 Okt 2024.** Aturan pelaksana (RPP PDP) & lembaga PDP **belum terbit**
  (per 2026) → pengawasan sementara oleh Ditjen Pengawasan Ruang Digital Komdigi.
- **Kewajiban sebagai Pengendali Data:** dasar pemrosesan sah (persetujuan tertulis/terekam +
  5 dasar lain di Pasal 20), transparansi/Kebijakan Privasi, penuhi hak subjek data (akses,
  koreksi, hapus, tarik persetujuan, keberatan profiling, dll), **DPA dengan prosesor/sub-prosesor**.
- **Notifikasi kebocoran: maks 72 jam** ke subjek data **dan** otoritas (Pasal 46).
- **DPO (Pejabat Pelindungan Data) — ⚠️ ambang turun:** Putusan MK No. 151/PUU-XXII/2024
  (16 Juli 2025) mengubah syarat Pasal 53 dari "dan" (kumulatif) → "**dan/atau**". Kini cukup
  memenuhi **salah satu**: (i) layanan publik; (ii) inti usaha = pemantauan data berskala besar;
  (iii) inti usaha = olah data spesifik/sensitif berskala besar. **Olah data finansial + video
  packing (wajah/suara) berskala besar berpotensi memicu kewajiban DPO.**
- **Transfer data lintas batas (Pasal 56) — relevan karena data di Cloudflare R2/cloud asing:**
  menyimpan data pribadi WNI di cloud luar negeri = **transfer lintas batas**. Boleh, tapi butuh
  dasar berjenjang: (a) negara tujuan setara/lebih → **belum ada whitelist RI**; (b) safeguard
  kontraktual mengikat → **andalkan DPA dengan penyedia cloud**; (c) persetujuan subjek data.
  **Aksi:** dokumentasikan dasar transfer + tandatangani DPA cloud + (konservatif) minta
  persetujuan transfer.
- **Sanksi:** administratif **sampai 2% pendapatan tahunan** + suspensi/penghapusan data; pidana
  (denda korporasi hingga puluhan miliar, dengan pengali sampai 10×).

### 1.6 UU ITE (11/2008 → 19/2016 → 1/2024)

- Kontrak elektronik & klik-setuju **sah** bila memenuhi syarat Pasal 1320 KUHPerdata (sepakat,
  cakap, objek tertentu, sebab halal). **Simpan log persetujuan** sebagai bukti.
- Dokumen/informasi elektronik = **alat bukti sah** → video packing & catatan transaksi bisa jadi
  bukti sengketa (asal integritas sistem terjaga).
- PSE wajib mengoperasikan sistem **andal & aman** (Pasal 15–16). UU 1/2024 menambah kewenangan
  pemerintah memerintahkan PSE melakukan "penyesuaian" sistem.

### 1.7 Pembayaran / QRIS — 🟢 Kemungkinan TIDAK perlu lisensi

- Regulator = **Bank Indonesia** (bukan OJK). Kerangka PBI 22/23/2020, diperbarui **PBI 10/2025**
  (efektif 31 Mar 2026).
- **Kesimpulan kunci:** selama app hanya **mencatat** penjualan POS (CASH/QRIS/TRANSFER) dan
  **tidak memegang/menggerakkan/menyelesaikan dana** pelanggan (merchant memakai QRIS/PJP miliknya
  sendiri) → kalian **vendor software/penunjang, bukan PJP**. QRIS hanya boleh diterbitkan/
  di-acquire oleh PJP berlisensi; arahkan merchant memakai PJP mereka sendiri.
- ⚠️ **Garis merah:** begitu app masuk ke aliran dana (settlement/escrow, agregasi dana merchant,
  menerbitkan/agregasi QRIS sebagai merchant-of-record, inisiasi pembayaran) → menjadi **PJP**
  (modal disetor sampai **Rp15 M** untuk skup penuh). **Ini area yang paling perlu dikonfirmasi ke
  lawyer pembayaran** — tidak ada sumber yang menyebut pengecualian "vendor murni" secara verbatim.

### 1.8 PMSE / E-Commerce (PP 80/2019 + Permendag 31/2023)

- SaaS yang **hanya menyediakan software** ke merchant (bukan mengoperasikan tempat transaksi
  konsumen) **bukan PPMSE/marketplace** → kewajiban PMSE (izin e-commerce, dsb.) tidak menempel.
- ⚠️ Jika nanti menambah fitur **checkout/marketplace in-app**, status bisa berubah — cek ulang.

### 1.9 Dokumen legal wajib

| Dokumen | Catatan |
|---|---|
| **Kebijakan Privasi** | Efektif wajib (UU PDP + PP 71/2019) |
| **Syarat & Ketentuan (ToS)** | Kontrak elektronik sah; simpan log persetujuan |
| **DPA** (Data Processing Agreement) | Wajib substantif (controller–processor); juga dengan sub-prosesor (Cloudflare/cloud) — draf & checklist di `dpa-draft-dan-checklist-id.md` |
| **SLA** | Tidak wajib by name, tapi standar B2B |
| ⚠️ **Klausul pembatasan tanggung jawab** | Pasal 18 UU 8/1999 melarang **klausula baku** yang mengalihkan/menghapus tanggung jawab pelaku usaha → **batal demi hukum**. Untuk B2B bite-nya lebih lemah, tapi praktik aman: **batasi (cap), jangan hapus total** |

### 1.10 Kepatuhan integrasi marketplace

- **Lazada/Shopee Open Platform:** patuhi developer agreement — kuota API, larangan menyalahgunakan
  data seller/buyer, jaga kerahasiaan App Secret.
- **Shopee:** simpan PII pembeli (nama/telp/email/alamat) **maksimal 90 hari**.
- **Token OAuth:** enkripsi at-rest, kunci di KMS terpisah, rotasi & revoke. (Sesuai catatan
  `CLAUDE.md`: token-crypto perlu diangkat ke shared package.)

### 1.11 HKI

- **Hak cipta kode** — otomatis sejak kode dibuat (UU 28/2014); program komputer dilindungi 50
  tahun sejak publikasi. Pencatatan di DJKI **opsional** tapi menjadi bukti kepemilikan murah.
- **Pemberi kerja** adalah pemilik default kode karyawan (Pasal 36), **tapi rebuttable** → **wajib
  klausul pengalihan IP**, terutama untuk **kontraktor/freelancer** (default kurang melindungi +
  ada hak moral).
- **Rahasia dagang** (UU 30/2000) — lindungi algoritma/kode rahasia; perlindungan **mensyaratkan**
  langkah kerahasiaan nyata (NDA, kontrol akses) → NDA bukan formalitas, melainkan konstitutif.
- **Merek** — lihat Bagian 2.

### 1.12 Ketenagakerjaan

- Kontrak **PKWT** (kontrak, maks 5 thn) / **PKWTT** (tetap); UU Cipta Kerja (kini **UU 6/2023**) +
  PP 35/2021. PKWT melewati batas → otomatis jadi PKWTT. Sertakan klausul kerahasiaan + pengalihan
  IP di setiap kontrak.

### 1.13 Keamanan & retensi data

- Retensi default PP 71/2019 ~5 tahun (kecuali aturan sektoral lain). Tetapkan kebijakan retensi
  (khusus **video packing** — data berpotensi sensitif: wajah/suara). Terapkan enkripsi, kontrol
  akses, dan log audit (modul `auditService` sudah ada — pertahankan).

---

## Bagian 2 — Analisis Merek "Palka" vs "Falka"

### 2.1 Kerangka hukum (UU 20/2016)

- **First-to-file:** hak atas merek lahir dari **pendaftaran**, bukan pemakaian. Siapa mendaftar
  lebih dulu, dialah yang berhak.
- **Pasal 21:** permohonan **ditolak** bila punya **persamaan pada pokoknya/keseluruhannya** dengan
  merek terdaftar/diajukan lebih dulu **untuk barang/jasa SEJENIS**. Uji persamaan menilai unsur
  dominan: bentuk, cara penempatan, cara penulisan, **dan bunyi/fonetik**.
- **Pasal 20:** merek tanpa daya pembeda / generik / deskriptif **tidak dapat didaftar**.
- **Kelas Nice untuk SaaS:** **Kelas 42** (SaaS/PaaS, non-downloadable software, desain &
  pengembangan software) — plus **Kelas 9** (software/app yang dapat diunduh) & **Kelas 35** (jasa
  manajemen bisnis/ritel/lokapasar) bila relevan.
- 🔑 **Poin terpenting:** pemicu penolakan adalah **kesamaan jenis barang/jasa ("sejenis")**, bukan
  sekadar nomor kelas. Satu kelas ≠ otomatis bentrok; beda kelas ≠ otomatis aman.

### 2.2 Temuan PDKI (per pencarian pengguna, 2026-06)

> ⚠️ Penelusuran ini belum lengkap (lihat 2.6). PDKI tidak bisa diakses otomatis saat riset, jadi
> data berikut berasal dari tangkapan layar pengguna.

**PALKA DESAIN** — `IDM001322045`
- Status: **Didaftar (AKTIF)**, registrasi 2025-03-27, dilindungi s/d **2034-08-05**.
- Pemilik: **Adri Ramyullah Marzuki** (Jakarta). Pengajuan 2024-08-05.
- **Kelas 42**, tapi uraian jasanya **100% desain interior/eksterior/arsitektur**: desain interior &
  eksterior bangunan/kantor/apartemen, konsultasi arsitektur, akustik/peredam suara, desain dapur &
  kamar mandi, renovasi, dll. **Tidak ada satu pun unsur perangkat lunak/IT/komputer.**

**FALKA** — `IDM001422980` (+ `JID2025088375`)
- Status: **Didaftar (AKTIF)**, registrasi 2026-01-27, dilindungi s/d **2035-07-22**.
- Pemilik: **Rifal Fauzi Ramdani**. Pengajuan 2025-07-22.
- **Kelas 25 (pakaian)** + **Kelas 35 (ritel online pakaian)** — sebuah **brand fashion/konveksi**.
  **Tidak ada di Kelas 42, bukan software.**

**VALKA** — Kelas 25/20 (furnitur: meja, sofa, rak, kasur). Varian fonetik, beda bidang.

**Arti status di panel "pemilik yang sama":**
- **"Berakhir"** = perlindungan merek itu **sudah habis/kedaluwarsa** (tidak aktif). Contoh:
  `D002015006922` (angka **2015** = tahun pengajuan) adalah merek lama (logo "Jakarta + Logo")
  milik pemilik Palka Desain yang masa 10 tahunnya berakhir ~2025 & tidak diperpanjang.
  **Ini merek lain yang lebih tua — BUKAN "Palka Desain". "Palka Desain" sendiri tetap AKTIF.**
- **"Didaftar"** = terdaftar & **aktif/dilindungi**.

### 2.3 Penilaian risiko (diperbarui dengan data PDKI)

| | **PALKA** (untuk SaaS) | **FALKA** (untuk SaaS) |
|---|---|---|
| Konflik di **Kelas 42** (kelas inti SaaS) | "Palka Desain" ada di kelas 42 **tapi beda bidang** (desain interior) | **Kelas 42 tampak KOSONG** (Falka di 25/35) |
| Argumen lolos | "Tidak sejenis" (desain interior ≠ software) — kuat, tapi **ranah diskresi pemeriksa**; kata dominan "PALKA" identik | Beda kelas total → nyaris tak ada dasar tolak di kelas 42 |
| Risiko sisa | Provisional refusal / oposisi yang harus diargumentasikan (kelas sama + kata dominan sama) | Nama dipakai **brand fashion online aktif** → potensi tabrakan *namespace* di ranah niaga + perhatikan **Kelas 35** bila didaftar |
| Daya pembeda | Kata umum KBBI (ruang muat) → **sugestif** untuk inventaris (cocok tematik tapi lebih lemah) | **Kata ciptaan** → daya pembeda terkuat |
| Biaya rebrand kode | Perlu rebrand (`@falka/*`, kunci R2, dll.) | **Nol** (codebase sudah "falka") |
| **Risiko keseluruhan** | **🟡 SEDANG** | **🟢 RENDAH–SEDANG** |

**Kesimpulan:** dengan data PDKI ini, **"palka" cukup layak diperjuangkan** (bukan risiko tinggi),
karena jasa "Palka Desain" (desain interior/arsitektur) **tidak sejenis** dengan SaaS inventaris/
kasir meski sama-sama Kelas 42. Secara hukum murni, **"falka" sedikit lebih bersih** di Kelas 42,
tetapi namanya kini berbagi dengan brand fashion online aktif (dan target user adalah seller online,
sehingga ada potensi kebingungan namespace yang justru tidak ada pada "palka").

### 2.4 Bila lanjut dengan "PALKA" — langkah mitigasi

1. **Cek nama polos "palka"** (bukan "palka desain") di PDKI untuk **semua kelas, khususnya 9, 35,
   42**, termasuk tab **Fonetik**. Pastikan tak ada PALKA lain di ranah software/niaga.
2. **Daftar sebagai logo + wordmark yang distinktif** — logo sendiri yang **berbeda jelas** dari
   monogram "Pd" milik Palka Desain.
3. **Tulis uraian barang/jasa Kelas 42 yang spesifik software** (lihat Bagian 3) untuk
   memaksimalkan jarak dari "desain interior".
4. **Daftar di Kelas 42 (+ 9 untuk app, + 35 untuk fitur bisnis/retail)**, cek konflik per kelas.
5. **Minta clearance opinion konsultan KI** khusus soal *sejenis* vs Palka Desain sebelum membayar
   (biaya non-refundable: UMK Rp500rb/kelas).
6. **Opsi aman-ganda:** daftar "palka" (pilihan utama); bila kena provisional refusal yang sulit,
   **jatuh ke "falka"** (sudah jadi nama codebase) sebagai cadangan.

### 2.5 Biaya & waktu pendaftaran merek

- **Biaya** (PP 45/2024): UMK **Rp500.000/kelas**, umum **Rp1.800.000/kelas** (online). Non-refundable
  meski ditolak. ⚠️ Ada wacana kenaikan tarif umum → Rp3,5 jt/kelas pada 2026 (UMK tetap Rp500rb) —
  konfirmasi sebelum mengandalkan.
- **Waktu:** ~9–18+ bulan (pemeriksaan formalitas → publikasi/oposisi 2 bulan → pemeriksaan
  substantif).
- **Konsultan KI** wajib hanya untuk pemohon luar negeri; untuk dalam negeri opsional tapi sangat
  disarankan untuk kasus borderline seperti "palka".

### 2.6 Due diligence yang masih harus dilakukan

- Penelusuran PDKI menyeluruh: nama polos + **varian fonetik** (Palka, Falka, Falca, Palca, Valka,
  Phalka) × **kelas 9/35/42** × status **terdaftar + pending**.
- Cek **uraian barang/jasa** tiap merek mirip (untuk uji "sejenis").
- Cek ketersediaan **domain** (.id/.com/.co.id) & **handle sosial media**.

---

## Bagian 3 — Draf uraian barang/jasa (siap pakai)

> ⚠️ Ini draf. Saat mengisi formulir DJKI, **cocokkan dengan daftar baku** di
> Sistem Klasifikasi Merek (`skm.dgip.go.id`) — DJKI lebih cepat memeriksa bila wording memakai
> istilah dari daftar mereka. Konsultan KI bisa merapikan ini. Pilih item yang relevan; tidak perlu
> semua. Uraian sengaja **spesifik software** agar jelas **tidak sejenis** dengan "Palka Desain".

### Kelas 42 — INTI (SaaS / perangkat lunak non-unduh) — **wajib daftar**

- Perangkat lunak sebagai layanan [SaaS] yang menampilkan perangkat lunak untuk manajemen
  inventaris dan pengendalian stok.
- Perangkat lunak sebagai layanan [SaaS] yang menampilkan perangkat lunak untuk sistem kasir/
  titik penjualan (point-of-sale/POS).
- Perangkat lunak sebagai layanan [SaaS] untuk manajemen pesanan, pembelian, dan pengembalian
  barang (retur).
- Perangkat lunak sebagai layanan [SaaS] untuk integrasi dan sinkronisasi data dengan lokapasar/
  pasar elektronik (marketplace).
- Penyediaan perangkat lunak daring yang tidak dapat diunduh untuk manajemen ritel dan rantai
  pasok.
- Perangkat lunak sebagai layanan [SaaS] untuk pembuatan dan pencetakan label kode QR dan kode
  batang (barcode).
- Desain dan pengembangan perangkat lunak komputer.
- Platform sebagai layanan [PaaS].
- Komputasi awan (cloud computing); penyediaan penggunaan sementara perangkat lunak daring yang
  tidak dapat diunduh.
- Layanan penyimpanan data elektronik (cloud) untuk pengarsipan basis data, rekaman video, dan
  dokumen elektronik.
- Pemberian nasihat dan konsultasi di bidang teknologi informasi [TI].

### Kelas 9 — software/app yang DAPAT DIUNDUH (bila ada app seluler)

- Perangkat lunak aplikasi seluler yang dapat diunduh untuk manajemen inventaris dan kasir.
- Perangkat lunak komputer yang dapat diunduh untuk manajemen ritel, point-of-sale, dan pemindaian
  kode batang/kode QR.
- Perangkat lunak yang dapat diunduh untuk sinkronisasi stok dengan pasar elektronik (marketplace).
- Aplikasi perangkat lunak yang dapat diunduh untuk pemindai kode batang (barcode scanner) dan
  kode QR.

### Kelas 35 — jasa bisnis berbasis software (opsional, cek konflik dulu)

> Catatan: jaga agar wording **bukan** "ritel pakaian" (itu ranah Falka). Fokus ke manajemen
> bisnis/inventaris/data — yang berbeda jenis dari ritel fashion.
>
> ⚠️ **Hasil penelusuran 2026-06:** kelas 35 ternyata lebih ramai — **PARKA** (kelas 35) punya jasa
> "manajemen bisnis online / order penjualan via aplikasi program komputer" yang **sejenis** + bunyi
> mirip (PALKA≈PARKA, beda huruf L/R). **Rekomendasi: prioritaskan kelas 42 (+9); kelas 35 hanya
> dengan opini konsultan KI / uraian dipersempit / ditunda.** Detail: `penelusuran-merek-palka-plan-id.md`.

- Layanan manajemen usaha dan administrasi usaha terkomputerisasi.
- Manajemen dan pengendalian persediaan/stok secara terkomputerisasi untuk pihak ketiga.
- Layanan pemrosesan data administratif dan manajemen basis data.
- Layanan pemrosesan administratif pesanan pembelian.
- Penyediaan informasi bisnis dan pelaporan penjualan/laba untuk pelaku usaha.
- Pembukuan dan akuntansi.

---

## Bagian 4 — Alternatif nama (cadangan)

> ⚠️ **Wajib diverifikasi.** Tidak satu pun nama di bawah ini sudah dicek di PDKI. Sebelum dipakai,
> telusuri tiap kandidat di **PDKI (kelas 9/35/42 + tab Fonetik)** dan cek **domain + handle
> sosmed**. Daftar ini hanya pemantik ide. Prioritaskan **kata ciptaan (coined)** karena daya
> pembeda & perlindungannya paling kuat.

### Jembatan dari "Palka" (mempertahankan resonansi, lebih distinktif)

Jika kamu suka nuansa "palka" (ruang muat/penyimpanan ≈ inventaris) tapi ingin menghindari benturan
kata-dominan dengan "Palka Desain", **ubah jadi kata ciptaan** yang lebih jauh:

| Nama | Catatan |
|---|---|
| **Palkara** | Coined; mempertahankan akar "palka" tapi menjadi kata baru yang lebih distinktif & kecil kemungkinan bentrok |
| **Palkan** | Coined, pendek; perlu cek kedekatan dengan "palka" pada tab Fonetik |
| **Muatra** | Coined dari "muat" (mengangkut/menampung) — tetap tematik kargo/stok, tapi kata baru |

### Kata ciptaan (coined/fanciful) — daya pembeda terkuat

| Nama | Nuansa | Catatan risiko |
|---|---|---|
| **Velora** | Lembut, modern, netral | Coined; cek bentuk mirip |
| **Tarka** | Pendek, tegas | "Tarka" punya makna di bahasa lain (Sanskerta/kuliner) — cek |
| **Stokara** | Dari "stok" → sugestif inventaris, tapi berbentuk coined | Cek kedekatan dgn merek ber-"stok" |
| **Lejara** | Dari "ledger/lejar" (buku besar) → tematik akuntansi/stok | Coined |
| **Catara** | Dari "catat" (mencatat) → tematik pencatatan transaksi | Coined |
| **Kanwa** | Pendek, netral, mudah diucapkan | Coined |
| **Sarka** | Tegas, dua suku kata | Hindari kedekatan dgn kata lain; cek Fonetik |

### Sugestif/tematik (lebih mudah "nyambung", tapi daya pembeda lebih lemah)

| Nama | Nuansa | Catatan |
|---|---|---|
| **Niago** | Dari "niaga" (perdagangan) | Sugestif perdagangan; kemungkinan banyak yang mirip → cek ketat |
| **Kelora** | Dari "kelola" (mengelola) | Sugestif manajemen |
| **Lumbung** | Lumbung padi = tempat menyimpan stok | Kata umum (lemah, seperti palka) & mungkin sudah dipakai fintech |

> **Rekomendasi pemakaian daftar ini:** kalau ingin paling aman & kuat secara merek, pilih **kata
> ciptaan murni** (mis. *Palkara*, *Velora*, *Lejara*). Kalau ingin mempertahankan "rasa palka"
> sambil menurunkan risiko, **Palkara** adalah jalan tengah yang menarik.

---

## Sumber utama

**Badan usaha & pajak:** [DJP — PP 20/2026](https://www.pajak.go.id/id/artikel/pp-202026-tarif-pph-05-bagi-umkm-orang-pribadi-berlaku-selamanya) ·
[CNBC — CV & PT keluar dari 0,5%](https://www.cnbcindonesia.com/news/20260530090155-4-738881/aturan-pph-final-umkm-05-direvisi-cv-dan-pt-tak-masuk-kriteria) ·
[DJP — tarif efektif PPN 11%](https://www.pajak.go.id/en/node/113455) ·
[DJP — ambang PKP](https://www.pajak.go.id/en/node/8899) ·
[OSS — panduan KBLI/RBA](https://oss.go.id/)

**PSE:** [PP 71/2019 (BPK)](https://peraturan.bpk.go.id/Details/122030/pp-no-71-tahun-2019) ·
[Permenkominfo 5/2020 (BPK)](https://peraturan.bpk.go.id/Details/203049/permenkominfo-no-5-tahun-2020) ·
[Hukumonline — cara daftar PSE](https://www.hukumonline.com/klinik/a/to-avoid-blocking-here-s-how-to-register-for-private-pse-lt63e1f8d7bd4a8/)

**UU PDP & ITE:** [Library of Congress — UU PDP](https://www.loc.gov/item/global-legal-monitor/2022-12-18/indonesia-personal-data-protection-act-enters-into-force/) ·
[SSEK — putusan MK soal DPO](https://ssek.com/blog/strengthening-oversight-in-indonesias-data-protection-constitutional-court-decision-on-the-appointment-of-data-protection-officers/) ·
[Baker McKenzie — transfer data lintas batas](https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/asia-pacific/indonesia/topics/international-data-transfer) ·
[AHP — UU ITE 1/2024](https://www.ahp.id/the-revamped-electronic-information-and-transaction-law-a-new-years-transformation/)

**Pembayaran/PMSE/HKI:** [SSEK — regulasi sistem pembayaran BI](https://ssek.com/blog/indonesia-legal-update-bi-regulations-on-payment-systems/) ·
[BI — QRIS](https://www.bi.go.id/en/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/qris/default.aspx) ·
[WIPO Lex — UU Hak Cipta 28/2014](https://www.wipo.int/wipolex/en/legislation/details/15600) ·
[UU 30/2000 Rahasia Dagang (BPK)](https://peraturan.bpk.go.id/Home/Details/45002)

**Merek:** [WIPO Lex — UU 20/2016](https://www.wipo.int/wipolex/en/legislation/details/16513) ·
[Hukumonline — persamaan pada pokoknya](https://www.hukumonline.com/klinik/a/arti-persamaan-pada-pokoknya-dalam-uu-merek-dan-indikasi-geografis-lt560aad4d30945/) ·
[Hukumonline — penolakan beda kelas](https://www.hukumonline.com/klinik/a/penolakan-merek-yang-berada-pada-kelas-berbeda-lt5e0b236499c60/) ·
[PDKI](https://pdki-indonesia.dgip.go.id/) ·
[Sistem Klasifikasi Merek DJKI](https://skm.dgip.go.id/) ·
[KBBI — "palka"](https://kbbi.web.id/palka)

---

## Disclaimer

Dokumen ini disusun dari riset sumber publik (2023–2026) dan **bukan** nasihat hukum, pajak, atau
kekayaan intelektual yang mengikat. Regulasi & tarif dapat berubah; status merek di PDKI harus
diverifikasi langsung. Sebelum mendirikan badan usaha, mendaftarkan merek, atau memutuskan
kebutuhan lisensi pembayaran, **konsultasikan dengan penasihat hukum, konsultan pajak, dan
konsultan KI terdaftar di Indonesia.** Dua hal yang paling memerlukan konsultasi profesional:
(1) **lisensi pembayaran** (pastikan app tidak masuk aliran dana), dan (2) **clearance merek "palka"**
(ambil teks resmi uraian barang/jasa "Palka Desain" untuk menilai *sejenis*).
