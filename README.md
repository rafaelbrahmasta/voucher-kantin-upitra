# Sistem Voucher Kantin UPITRA (Rust + React)

Aplikasi digitalisasi voucher makan harian karyawan & dosen Universitas Pignatelli Triputra (UPITRA).
Sistem ini menggunakan arsitektur modern berkinerja tinggi: **Rust (Axum)** untuk backend API & service, serta **React (Vite + Tailwind CSS)** untuk frontend SPA kasir stan dan portal administrasi/keuangan.

---

## 🏛️ Arsitektur Proyek

```
voucher-kantin/
├── backend-rust/       # Backend service berkinerja tinggi (Rust + Axum + SQLx + Tokio)
│   ├── src/
│   │   ├── main.rs     # Titik masuk server HTTP Axum & konfigurasi router
│   │   ├── crypto.rs   # Kriptografi QR (HMAC-SHA256), short codes, & sesi cookie
│   │   ├── state.rs    # Shared AppState & koneksi database PostgreSQL pool
│   │   └── routes/     # Modul REST API:
│   │       ├── auth.rs       # Autentikasi sesi staf, admin & kasir
│   │       ├── scan.rs       # Verifikasi voucher QR, kode darurat, & pairing HP kasir
│   │       ├── admin.rs      # Portal Admin IT: staf, stan/tenant, & transaksi
│   │       └── finance.rs    # Portal Keuangan: ringkasan harian & pencairan stan
│   ├── Cargo.toml      # Dependensi Rust (Axum, SQLx 0.8, Tokio, Serde, dll)
│   └── Cargo.lock
├── frontend/           # Frontend SPA (React 19, TypeScript, Tailwind CSS, Lucide Icons)
│   ├── src/            # Komponen halaman: Kasir Scan, Login, Admin IT, Keuangan
│   ├── dist/           # Bundle hasil build produksi (disajikan langsung oleh backend Rust)
│   ├── package.json
│   └── vite.config.ts
├── migrations/         # Skema database PostgreSQL (DDL & indeks performa)
├── deploy/             # Docker compose (PostgreSQL) & data seed dev
├── run-rust.ps1        # Script kilat menjalankan server Rust di Windows
└── README.md
```

---

## 🚀 Prasyarat

- **Rust & Cargo** (v1.75+ atau v1.100+)
- **Node.js & npm** (v18+) untuk build frontend
- **PostgreSQL** (v14+) atau Docker Desktop

---

## 🛠️ Cara Menjalankan

### 1. Database PostgreSQL
Pastikan database PostgreSQL sudah aktif dan skema migrasi sudah dijalankan:
```bash
docker compose -f deploy/docker-compose.yml up -d
```
Atau jika memakai PostgreSQL lokal:
```bash
createdb voucher
psql -d voucher -f migrations/0001_init.sql
psql -d voucher -f migrations/0002_admin_master.sql
psql -d voucher -f deploy/dev_seed.sql
psql -d voucher -f deploy/dev_menu_seed.sql
```

### 2. Konfigurasi Lingkungan (`.env`)
Salin file `.env.example` ke `.env` di direktori utama:
```bash
copy .env.example .env
```
Pastikan `DATABASE_URL` mengarah ke database PostgreSQL Anda:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/voucher?sslmode=disable
PORT=8080
```

### 3. Jalankan Backend Rust
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

## 💻 Portal & Antarmuka

| URL | Peran | Deskripsi |
|---|---|---|
| `http://localhost:8080/scan` | Kasir Stan Kantin | Pemindai kamera QR voucher & input kode darurat |
| `http://localhost:8080/scan/masuk` | Kasir Stan Kantin | Hubungkan kasir stan via Kode Pairing 10 karakter |
| `http://localhost:8080/admin` | Admin IT | Kelola Stan/Tenant, Data Staf, Riwayat Transaksi |
| `http://localhost:8080/finance` | Biro Keuangan | Dashboard Rekap Harian, Pencairan Stan (Payouts) |
| `http://localhost:8080/healthz` | System Monitor | Health check endpoint (`{"status":"ok"}`) |

---

## 🧪 Menjalankan Pengujian (Unit Tests)

Backend Rust telah dilengkapi unit test untuk validasi kriptografi token QR, HMAC signing, Crockford base32 decoding, dan proteksi replay attack:

```bash
cd backend-rust
cargo test
```

---

## 📦 Build Frontend (Jika Ada Perubahan UI)

```bash
cd frontend
npm install
npm run build
```
Hasil build otomatis tersimpan di `frontend/dist/` dan langsung disajikan oleh server Axum Rust.
