# Sistem Voucher Kantin UPITRA (Rust + React)

Aplikasi digitalisasi voucher makan harian karyawan & dosen Universitas Pignatelli Triputra (UPITRA).
Sistem ini menggunakan arsitektur modern berkinerja tinggi: **Rust (Axum)** untuk backend API & worker penerbit voucher, serta **React (Vite + Tailwind CSS)** untuk frontend SPA kasir stan dan portal administrasi/keuangan.

---

## 🏛️ Arsitektur Proyek

```
voucher-kantin/
├── backend-rust/       # Backend service berkinerja tinggi (Rust + Axum + SQLx + Tokio)
│   ├── src/
│   │   ├── main.rs           # Web server HTTP Axum & router terproteksi middleware
│   │   ├── lib.rs            # Core library & shared state
│   │   ├── bin/
│   │   │   └── issue_vouchers.rs # CLI/Cron Worker penerbitan voucher harian
│   │   ├── crypto.rs         # Kriptografi QR (HMAC-SHA256), short codes, & sesi cookie
│   │   ├── db.rs             # Database pool, auto-migrations, & query atomik
│   │   ├── issuer.rs         # Logika penerbitan voucher harian & filter hari libur
│   │   ├── rate_limit.rs     # In-memory rate limiter anti brute-force
│   │   └── routes/           # Modul REST API:
│   │       ├── auth.rs       # Autentikasi sesi staf, admin & kasir + middleware
│   │       ├── scan.rs       # Verifikasi voucher QR, kode darurat, & pairing kasir
│   │       ├── admin.rs      # Portal Admin IT: staf, stan/tenant, & transaksi
│   │       └── finance.rs    # Portal Keuangan: ringkasan harian & pencairan stan
│   ├── Cargo.toml      # Dependensi Rust (Axum, SQLx 0.8, Tokio, Serde, dll)
│   └── Cargo.lock
├── frontend/           # Frontend SPA (React 19, TypeScript, Tailwind CSS, Lucide Icons)
│   ├── src/            # Komponen halaman: Kasir Scan, Login, Admin IT, Keuangan
│   ├── dist/           # Bundle hasil build produksi (disajikan langsung oleh backend Rust)
│   ├── package.json
│   └── vite.config.ts
├── migrations/         # Skema database PostgreSQL (0001, 0002, 0003)
├── deploy/             # Docker compose (PostgreSQL + Mailpit) & data seed
├── run-rust.ps1        # Script kilat menjalankan server Rust di Windows
└── README.md
```

---

## 🔐 Manajemen Pengguna & Keamanan Kredensial

Demi keamanan dan kepatuhan audit (mencegah kredensial default publik dan kata sandi plaintext), seluruh akun administrasi menggunakan enkripsi hashing **Argon2id** dan dapat diinisialisasi secara aman via CLI:

### Membuat Akun Admin / Keuangan (CLI Aman):
Jalankan perintah berikut di folder `backend-rust`:
```bash
# Membuat Akun Admin Super IT:
cargo run --bin create_user -- admin admin.it "Admin Super IT" "KataSandiKuat#2026"

# Membuat Akun Biro Keuangan:
cargo run --bin create_user -- finance admin.finance "Biro Keuangan UPITRA" "KataSandiKeuangan#2026"
```

| Peran | URL Portal | Metode Masuk | Keterangan |
|---|---|---|---|
| **Admin Super IT** | `http://localhost:8080/admin/masuk` | Username + Password (Argon2id) / Microsoft SSO | Dibuat melalui CLI aman `create_user` |
| **Biro Keuangan** | `http://localhost:8080/finance/masuk` | Username + Password (Argon2id) / Microsoft SSO | Dibuat melalui CLI aman `create_user` |
| **Kasir Stan** | `http://localhost:8080/scan/masuk` | *Kode Pairing 10 Karakter* | Didapat dari tombol **"Kode Pairing"** di menu Stan Admin IT |


---

## 🚀 Prasyarat

- **Rust & Cargo** (v1.75+ atau v1.100+)
- **Node.js & npm** (v18+) untuk build frontend
- **PostgreSQL** (v14+) atau Docker Desktop

---

## 🛠️ Cara Menjalankan

### 1. Database PostgreSQL
Jalankan container PostgreSQL & Mailpit:
```bash
docker compose -f deploy/docker-compose.yml up -d
```
*(Seluruh skema migrasi `0001`, `0002`, `0003` dan data contoh dev otomatis dijalankan).*

### 2. Konfigurasi Lingkungan (`.env`)
Salin file `.env.example` ke `.env` di direktori utama:
```bash
copy .env.example .env
```
Pastikan `DATABASE_URL` dan konfigurasi port terisi:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/voucher?sslmode=disable
PORT=8080
APP_ENV=dev
```

### 3. Jalankan Backend Server
Cukup jalankan script powershell:
```powershell
.\run-rust.ps1
```
Atau langsung lewat Cargo:
```bash
cd backend-rust
cargo run
```
Server akan aktif di: **`http://localhost:8080`**

---

## 🎟️ Penerbitan Voucher Harian (Job / Worker)

Untuk menerbitkan voucher harian (Senin-Jumat, mengecualikan hari libur kalender):

### Opsi A: Lewat Dashboard Admin IT
Buka `http://localhost:8080/admin`, lalu klik tombol **"Terbitkan Voucher"** di bagian atas (secara default hanya menerbitkan staf yang belum memiliki voucher atau yang pengiriman emailnya tertunda/gagal).

### Opsi B: Lewat CLI / Systemd Timer
```bash
cd backend-rust

# Mode default (hanya staf yang belum punya voucher atau email_sent_at masih NULL):
cargo run --bin issue_vouchers

# Opsi --force (-f): HANYA melewati pengecekan akhir pekan/hari libur nasional.
# Voucher yang emailnya sudah terkirim (email_sent_at IS NOT NULL) TIDAK akan dibuat ulang tokennya.
cargo run --bin issue_vouchers -- --force

# Opsi --resend (-r): Sengaja membuat ulang token untuk seluruh voucher berstatus 'issued'
# meskipun emailnya sudah terkirim (misal pembaruan massal jatah hari ini).
cargo run --bin issue_vouchers -- --resend

# Kombinasi force dan resend pada tanggal tertentu:
cargo run --bin issue_vouchers -- --date 2026-11-20 --force --resend
```

---

## 💰 Regulasi Cut-Off & Pencairan Kas Stan (16:00 WIB)

1. **Aturan Jam Cut-off (16:00 WIB):**
   - Pencairan dana kasir stan untuk transaksi **hari ini** baru dapat dilakukan **setelah pukul 16:00 WIB** (waktu operasional voucher kampus ditutup). Hal ini menjamin seluruh transaksi telah terekam lengkap dan tidak ada voucher yang tertinggal atau digunakan setelah klaim dibuat.
   - Pencairan dana untuk **tanggal kemarin atau hari sebelumnya** dapat diverifikasi dan dicairkan kapan saja.
   - Pencairan untuk tanggal di masa depan ditolak dengan error `HTTP 400 Bad Request`.
2. **Integritas Transaksi & Anti Race Condition:**
   - Seluruh pencairan dibungkus dalam transaksi database atomik dengan penguncian baris serial (`SELECT ... FOR UPDATE`) pada tabel `tenants`, `settlements`, dan baris `vouchers` yang belum terikat ke `settlement_id`.
   - Pencegahan pencairan ganda menggunakan `INSERT` murni tanpa `ON CONFLICT DO UPDATE`. Upaya klaim duplikat otomatis menghasilkan `HTTP 409 Conflict`.
   - Format nomor tanda terima klaim dibuat deterministik: `PAY-YYYYMMDD-<tenant_id>`. Format tanggal klien divalidasi ketat `YYYY-MM-DD`.

---

## 🛡️ Fitur Keamanan yang Diterapkan

1. **Proteksi Middleware Sesi (RBAC):** Seluruh rute `/api/admin/*` dan `/api/finance/*` dilindungi middleware yang memverifikasi tanda tangan HMAC cookie sesi (`admin_sess` dan `finance_sess`). Akses tanpa izin otomatis ditolak dengan `HTTP 401 Unauthorized`. Pemisahan peran ketat memastikan Admin IT tidak dapat mencairkan dana keuangan stan.
2. **Kredensial Terverifikasi:** Login admin dan keuangan memverifikasi username dan hash password pada tabel `users`.
3. **Pemberitahuan Kadaluwarsa & Konfirmasi Kirim Ulang:** Pada portal Admin Staf, tombol kirim ulang voucher akan menampilkan konfirmasi tegas *"QR lama akan tidak berlaku. Lanjutkan?"* jika voucher telah terkirim sebelumnya. Pembuatan ulang token otomatis ditolak jika staf nonaktif, voucher sudah berstatus `used`, atau telah melewati batas 16:00 WIB.
4. **Isolasi Kegagalan Batch Penerbitan:** Kesalahan database pada satu staf tidak menghentikan penerbitan staf lainnya. Staf yang gagal dicatat ke daftar error rincian dan dilaporkan lewat metrik `failed_count`.
5. **Pairing Kasir Anti-Spoofing:** Kasir hanya bisa terhubung dengan memasukkan kode aktivasi 10 karakter yang sah dari Admin IT. Mode bypass stan langsung telah dinonaktifkan.
6. **Perlindungan Brute-Force (Rate Limiter):** Endpoint verifikasi kode voucher darurat dan kode pairing kasir dibatasi maksimal 8 percobaan salah per menit per IP (`HTTP 429 Too Many Requests`).
7. **Jejak Audit Finansial (Tamper-Evident):** Seluruh aktivitas krusial (penerbitan voucher, kirim ulang, pairing kasir, pembaruan rekening, dan pencairan kas) dicatat ke tabel `audit_log` dengan hash kriptografi berantai (prev_hash & row_hash).
8. **Integritas Transaksi & Audit:** Staf dan stan yang memiliki riwayat voucher tidak dapat di-hard delete untuk menjaga akurasi laporan keuangan kampus (tersedia opsi Deaktivasi / Nonaktifkan).
9. **Pencatatan Menu Pemesanan:** Rincian pesanan menu saat pemindaian voucher otomatis dicatat secara atomik ke tabel `voucher_items`.

---

## 🧪 Menjalankan Pengujian (Unit & Integration Tests)

### Unit Tests
```bash
cd backend-rust
cargo test --lib
```

### Integration Tests (8 Skenario Audit & Keamanan C4.1 - C4.8)
Tes integrasi memerlukan variabel lingkungan `TEST_DATABASE_URL` ke database PostgreSQL khusus tes (nama database wajib memuat kata `test` demi keamanan):
```bash
cd backend-rust
cargo test --test audit_and_security_tests -- --include-ignored
```

---

## 📦 Build Frontend

```bash
cd frontend
npm install
npm run build
```
Hasil build otomatis tersimpan di `frontend/dist/` dan langsung disajikan oleh server Axum Rust.
