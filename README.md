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
Buka `http://localhost:8080/admin`, lalu klik tombol **"Terbitkan Voucher"** di bagian atas.

### Opsi B: Lewat CLI / Systemd Timer
```bash
cd backend-rust
cargo run --bin issue_vouchers

# Opsi paksa (force) untuk akhir pekan/hari libur:
cargo run --bin issue_vouchers -- --force

# Opsi tanggal tertentu:
cargo run --bin issue_vouchers -- --date 2026-11-17
```

---

## 🛡️ Fitur Keamanan yang Diterapkan

1. **Proteksi Middleware Sesi (RBAC):** Seluruh rute `/api/admin/*` dan `/api/finance/*` dilindungi middleware yang memverifikasi tanda tangan HMAC cookie sesi (`admin_sess` dan `finance_sess`). Akses tanpa izin otomatis ditolak dengan `HTTP 401 Unauthorized`.
2. **Kredensial Terverifikasi:** Login admin dan keuangan memverifikasi username dan hash password pada tabel `users`.
3. **Pairing Kasir Anti-Spoofing:** Kasir hanya bisa terhubung dengan memasukkan kode aktivasi 10 karakter yang sah dari Admin IT. Mode bypass stan langsung telah dinonaktifkan.
4. **Perlindungan Brute-Force (Rate Limiter):** Endpoint verifikasi kode voucher darurat dan kode pairing kasir dibatasi maksimal 8 percobaan salah per menit per IP (`HTTP 429 Too Many Requests`).
5. **Sensor Password Log Startup:** URL koneksi database yang tercetak di log terminal/file disamarkan (`postgres://user:***@host:port/db`).
6. **Integritas Transaksi & Audit:** Staf dan stan yang memiliki riwayat voucher tidak dapat di-hard delete untuk menjaga akurasi laporan keuangan kampus (tersedia opsi Deaktivasi / Nonaktifkan).
7. **Pencatatan Menu Pemesanan:** Rincian pesanan menu saat pemindaian voucher otomatis dicatat secara atomik ke tabel `voucher_items`.

---

## 🧪 Menjalankan Pengujian (Unit Tests)

```bash
cd backend-rust
cargo test
```

---

## 📦 Build Frontend

```bash
cd frontend
npm install
npm run build
```
Hasil build otomatis tersimpan di `frontend/dist/` dan langsung disajikan oleh server Axum Rust.
