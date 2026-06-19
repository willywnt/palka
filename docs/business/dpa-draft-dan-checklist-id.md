# Perjanjian Pemrosesan Data (DPA) — Draf & Checklist (ID)

> ⚠️ **DRAF/TEMPLATE — bukan dokumen final & bukan nasihat hukum.** Isi `[placeholder]`, sesuaikan
> dengan praktik nyata, lalu **review oleh penasihat hukum Indonesia** sebelum dipakai. Mengacu pada
> **UU 27/2022 (UU PDP)**; klausul minimum final akan mengikuti **RPP PDP** saat terbit.
> Terakhir diperbarui: [tanggal].

Dokumen ini berisi **dua bagian**:

- **Bagian A — Draf DPA Merchant**: dipakai ketika **kamu (penyedia [NAMA PRODUK]) menjadi Prosesor**
  dan merchant (pelanggan) menjadi Pengendali. Lampirkan ke Syarat & Ketentuan / onboarding.
- **Bagian B — Checklist DPA Vendor**: dipakai ketika **kamu menjadi Pengendali/pelanggan** untuk
  memeriksa DPA standar vendor (Cloudflare R2, hosting/DB, email, analitik, dll).

---

# BAGIAN A — DRAF DPA MERCHANT (kamu = Prosesor)

**Perjanjian Pemrosesan Data Pribadi ("DPA")** ini merupakan bagian tak terpisahkan dari Syarat &
Ketentuan Layanan antara:

- **[NAMA BADAN USAHA]** ("Prosesor"), penyedia [NAMA PRODUK]; dan
- **Pelanggan** sebagaimana terdaftar pada Akun ("Pengendali").

## 1. Definisi & Peran

Istilah "Data Pribadi", "Pemrosesan", "Pengendali", "Prosesor", "Subjek Data" mengikuti UU PDP.
Sehubungan dengan **Data Pribadi pihak ketiga yang dimuat dalam Data Pelanggan** (mis. data pembeli/
pelanggan akhir, data pada video pengemasan), **Pengendali = Pelanggan** dan **Prosesor = [NAMA
BADAN USAHA]**. Prosesor memproses **hanya atas nama dan instruksi** Pengendali.

## 2. Objek, Jangka Waktu, Sifat & Tujuan

- **Objek & sifat:** pemrosesan Data Pribadi yang diperlukan untuk menyediakan Layanan (manajemen
  inventaris, kasir/POS, pesanan, retur, label, integrasi marketplace, penyimpanan video pengemasan).
- **Tujuan:** semata-mata penyediaan Layanan sesuai Syarat & Ketentuan.
- **Jangka waktu:** selama Akun aktif + periode retensi pada §10.
- Rincian pada **Lampiran 1**.

## 3. Instruksi Pengendali

Prosesor memproses Data Pribadi hanya sesuai **instruksi terdokumentasi** Pengendali (termasuk
penggunaan fitur Layanan), kecuali diwajibkan hukum. Prosesor memberi tahu bila menurutnya suatu
instruksi melanggar UU PDP.

## 4. Kerahasiaan

Prosesor memastikan personel yang berwenang mengakses Data Pribadi terikat **kewajiban kerahasiaan**
dan hanya mengakses seperlunya (need-to-know).

## 5. Keamanan

Prosesor menerapkan langkah teknis & organisasi yang wajar (lihat **Lampiran 2**): enkripsi saat
transit & saat disimpan, kontrol akses berbasis peran, pencatatan audit, pemisahan data antar-tenant
(organisasi), serta uji & pemulihan berkala.

## 6. Sub-prosesor

- Pengendali memberikan **persetujuan umum** kepada Prosesor untuk menggunakan sub-prosesor guna
  menyediakan Layanan. Daftar sub-prosesor terkini ada di **Lampiran 3** (mis. penyedia cloud
  **Cloudflare R2**, hosting/DB, email/notifikasi, analitik).
- Prosesor akan **memberi tahu** perubahan/penambahan sub-prosesor dan memberi kesempatan keberatan
  yang wajar.
- Prosesor mewajibkan sub-prosesor lewat kontrak dengan **kewajiban perlindungan data yang setara**
  dengan DPA ini, dan **tetap bertanggung jawab** atas kepatuhan sub-prosesornya.

## 7. Bantuan kepada Pengendali

Prosesor membantu Pengendali secara wajar untuk: (a) menanggapi **permintaan Subjek Data** (akses,
koreksi, hapus, dll); (b) memenuhi kewajiban keamanan, pemberitahuan kebocoran, dan penilaian dampak
(jika berlaku) — dengan mempertimbangkan sifat pemrosesan & informasi yang tersedia bagi Prosesor.

## 8. Pemberitahuan Insiden/Kebocoran

Prosesor memberi tahu Pengendali **tanpa penundaan yang tidak wajar setelah mengetahui** suatu
kegagalan pelindungan Data Pribadi, dengan informasi yang tersedia, guna membantu Pengendali
memenuhi kewajiban notifikasi **72 jam (3x24 jam)** berdasarkan Pasal 46 UU PDP.

## 9. Transfer Lintas Batas (Pasal 56)

Sebagian pemrosesan/penyimpanan dapat terjadi **di luar Indonesia** (mis. melalui penyedia cloud).
Prosesor memastikan transfer demikian disertai **perlindungan yang memadai & mengikat** (mis.
klausul/DPA dengan sub-prosesor) dan/atau dasar lain yang sah menurut UU PDP. Pengendali
mengakui & menyetujui pengaturan ini.

## 10. Pengembalian & Penghapusan

Saat Layanan berakhir, Prosesor — atas pilihan Pengendali — **mengembalikan atau menghapus** Data
Pribadi dalam jangka waktu **[mis. 30 hari]**, kecuali penyimpanan diwajibkan hukum. (Pengendali
dapat mengekspor data sebelum penghapusan.)

## 11. Audit

Prosesor menyediakan informasi yang wajar untuk membuktikan kepatuhan terhadap DPA ini, termasuk
**laporan/sertifikasi pihak ketiga** (mis. dari penyedia cloud) bila tersedia. Audit langsung
dilakukan dengan pemberitahuan wajar, pada jam kerja, dan tanpa mengganggu operasi/keamanan tenant lain.

## 12. Tanggung Jawab

Alokasi tanggung jawab mengikuti Syarat & Ketentuan (termasuk batasan tanggung jawab), sepanjang
diperbolehkan UU PDP & UU 8/1999. Masing-masing pihak bertanggung jawab atas perannya
(Pengendali atas dasar hukum & instruksi; Prosesor atas pemrosesan sesuai instruksi).

## 13. Hukum yang Berlaku

DPA ini diatur oleh **hukum Republik Indonesia** dan tunduk pada forum penyelesaian sengketa pada
Syarat & Ketentuan.

---

### Lampiran 1 — Rincian Pemrosesan
- **Kategori Subjek Data:** pelanggan/pembeli akhir merchant; pihak pada video pengemasan.
- **Jenis Data Pribadi:** nama, kontak, alamat pengiriman, rincian pesanan; citra/suara pada video.
- **Sifat & tujuan:** [isi]. **Jangka waktu:** [isi].

### Lampiran 2 — Langkah Keamanan (ringkas)
Enkripsi in-transit (TLS) & at-rest; RBAC + prinsip least-privilege; isolasi antar-organisasi;
log audit; manajemen rahasia/kunci; backup & pemulihan; pengelolaan kerentanan. [Sesuaikan.]

### Lampiran 3 — Daftar Sub-prosesor
| Sub-prosesor | Fungsi | Lokasi |
|---|---|---|
| Cloudflare (R2) | Penyimpanan objek/video & basis data | [global/region] |
| [Hosting/DB] | [fungsi] | [lokasi] |
| [Email/notifikasi] | [fungsi] | [lokasi] |
| [Analitik/monitoring] | [fungsi] | [lokasi] |

---

# BAGIAN B — CHECKLIST DPA VENDOR (kamu = Pengendali/pelanggan)

Gunakan untuk memeriksa DPA standar vendor (mis. **Cloudflare**, AWS, penyedia email/analitik)
sebelum mengirim data pribadi nyata ke mereka. Idealnya ✅ semua.

- [ ] **Vendor bertindak sebagai Prosesor** & berkomitmen memproses **hanya sesuai instruksimu**
      serta untuk menyediakan layanan (bukan tujuannya sendiri).
- [ ] **Kerahasiaan** personel vendor.
- [ ] **Langkah keamanan** memadai & spesifik: **enkripsi at-rest & in-transit**, kontrol akses,
      pengujian.
- [ ] **Sub-prosesor**: ada daftar + **pemberitahuan perubahan** + hak keberatan; flow-down terms.
- [ ] **Pemberitahuan kebocoran** kepadamu **tanpa penundaan wajar** (idealnya ada **SLA waktu**,
      mis. ≤48–72 jam) agar kamu bisa penuhi kewajiban 72 jam UU PDP.
- [ ] **Bantuan** untuk permintaan Subjek Data & untuk kepatuhanmu.
- [ ] **Transfer lintas batas (Pasal 56)**: ada mekanisme/komitmen perlindungan mengikat (mis. SCC/
      klausul perlindungan data) → ini yang menjadi **dasar transfer** datamu ke luar negeri.
- [ ] **Lokasi/region data**: tahu di mana data disimpan; ada **opsi region** bila perlu.
- [ ] **Pengembalian/penghapusan data** saat kontrak berakhir (+ jangka waktu).
- [ ] **Hak audit / laporan kepatuhan**: tersedia sertifikasi (mis. **ISO 27001 / SOC 2**) sebagai
      pengganti audit langsung.
- [ ] **Alokasi tanggung jawab** yang wajar.
- [ ] **Cara penerimaan**: tahu apakah DPA **berlaku otomatis** sebagai bagian ToS atau perlu
      **ditandatangani/di-accept** terpisah (banyak vendor: aktif lewat dashboard/klik).

> 📌 Untuk **Cloudflare** khususnya: pastikan DPA mereka **aktif untuk akun-mu** (biasanya bagian
> dari Self-Serve Subscription Agreement / dapat diterima via dashboard), cek **lampiran sub-prosesor**
> dan **mekanisme transfer internasional**-nya, serta **bucket R2** kamu tidak ter-set publik untuk
> data pribadi (bucket rekaman = privat, sesuai arsitektur).

---

## Disclaimer
Draf & checklist ini bukan nasihat hukum. Klausul minimum DPA menurut UU PDP akan dipertegas oleh
RPP PDP saat terbit. Konsultasikan dengan penasihat hukum/konsultan PDP sebelum memberlakukan.
