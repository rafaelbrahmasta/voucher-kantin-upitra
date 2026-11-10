# Voucher Kantin UPITRA

Backend Go + HTML dari server + PostgreSQL. Rancangan lengkap ada di
*Proposal Sistem Voucher Kantin UPITRA* (26 Okt 2026).

## Struktur folder

```
voucher-kantin/
  cmd/
    web/            server web (titik masuk utama)
    issue-vouchers/ job harian: buat voucher baru + kirim email (09.55 Senin-Jumat)
  internal/
    config/         baca environment / .env
    token/          token QR, HMAC, kode pendek   (sudah ada unit test)
    mail/           antarmuka Mailer: log, SMTP (nanti: Graph)  (sudah ada unit test)
    db/             connection pool PostgreSQL
    voucher/        logika inti: scan atomik
    issuer/         logika job terbit voucher harian  (sudah ada unit test)
    report/         query baca untuk halaman tenant dan dashboard  (unit test)
    idfmt/          format tanggal, jam, rupiah gaya Indonesia  (unit test)
    server/         router dan handler HTTP
  web/
    templates/      HTML: kerangka tenant, kerangka admin, satu file per halaman
    static/         app.css, admin.css, scan.js, jsqr.min.js (pembaca QR cadangan)
  migrations/       SQL skema (0001 = DDL dari proposal)
  deploy/           docker-compose (PostgreSQL + Mailpit), data contoh dev
```

Folder yang akan ditambah sesuai timeline: job tutup hari 16.05 dan lainnya, `internal/auth/`, `internal/finance/`, `internal/audit/`.

## Prasyarat

- Go 1.22 atau lebih baru (`go version`)
- Docker Desktop (untuk PostgreSQL + Mailpit), atau PostgreSQL terpasang sendiri

## Menjalankan di komputermu

```bash
# 1. Konfigurasi
cp .env.example .env            # Windows: copy .env.example .env

# 2. Database + inbox email palsu (Mailpit)
docker compose -f deploy/docker-compose.yml up -d

# 3. Unduh package (chi, pgx, go-qrcode) dan buat go.sum
go mod tidy

# 4. Uji
go test ./...

# 5. Jalankan server
go run ./cmd/web
#   -> http://localhost:8080          (halaman beranda)
#   -> http://localhost:8080/healthz  (harus {"status":"ok"})

# 6. Di terminal lain: buat voucher uji dan kirim email
go run ./cmd/issue-vouchers -open -print
#   -> buka http://localhost:8025 untuk melihat emailnya (QR + kode cadangan)
```

### Halaman yang tersedia (hanya mode dev, tanpa login)

| Alamat | Untuk | Isi |
|---|---|---|
| `/scan` | Tenant (HP) | Kamera pembaca QR, layar hasil hijau/merah, ketik kode cadangan |
| `/today` | Tenant | Riwayat scan hari ini dan total (scan yang dibatalkan dicoret) |
| `/admin` | Biro Keuangan / admin | Ringkasan harian: voucher terbit, terpakai, persentase, nilai penggantian, pemakaian per tenant, transaksi terbaru |
| `/admin/transaksi` | Biro Keuangan / admin | Semua transaksi, filter tanggal, tenant, unit, nama/NIP, 50 baris per halaman; kolom Menu bila tenant memilih menu |
| `/admin/tenant` | Admin master | Daftar tenant: tambah, ubah, nonaktifkan, hapus (hanya yang belum punya transaksi) |
| `/admin/tenant/{id}` | Admin master | Data tenant, **kode koneksi HP**, putuskan HP, dan **CRUD menu kantin** tenant itu |
| `/masuk` | Tenant (HP) | Memasukkan kode dari admin (atau membuka tautan/QR dari admin) untuk menghubungkan HP ke tenant |

Cara mencoba: jalankan `go run ./cmd/web`, buat voucher dengan
`go run ./cmd/issue-vouchers -open -print`, lalu buka halaman di atas.

- **Kamera di laptop:** buka `http://localhost:8080/scan`. `localhost` dianggap aman oleh browser,
  jadi kamera boleh dipakai. Tampilkan QR dari layar HP lain, atau dari email voucher.
- **Kamera di HP:** browser hanya mengizinkan kamera lewat HTTPS, jadi butuh tunnel
  (Cloudflare Tunnel atau ngrok) menuju `localhost:8080`.
- Halaman-halaman ini **tertutup (404) jika `APP_ENV` bukan `dev`**, karena belum ada login.
- Pembaca QR memakai `BarcodeDetector` bawaan browser; jika tidak ada, `jsQR` (Apache-2.0,
  github.com/cozmo/jsQR) dimuat hanya di halaman scan.

### Mencoba scan

`issue-vouchers -print` mencetak isi QR (`UPV1....`) dan kode cadangan. Lalu:

```bash
curl -X POST localhost:8080/api/scan -H "Content-Type: application/json" \
     -d '{"qr":"UPV1.xxxx.yyyy"}'
```

- Pertama kali: `{"result":"ok", "staff":"Dr. Rina Kusuma", ...}`
- Kedua kali: `{"result":"used", "tenant":"Kantin Dev", ...}`
- Payload ngawur: `{"result":"invalid"}`

(PowerShell: pakai `curl.exe` dan escape tanda kutip, atau uji lewat Postman.)

Kode cadangan: `-d '{"code":"K7M4-QXP8"}'` ke `/api/scan/code`.

Mulai dari nol: `docker compose -f deploy/docker-compose.yml down -v`, lalu `up -d` lagi.

### Tanpa Docker

```bash
createdb voucher
psql -d voucher -f migrations/0001_init.sql
psql -d voucher -f deploy/dev_seed.sql
```
Lalu sesuaikan `DATABASE_URL` di `.env`, dan pakai `MAIL_DRIVER=log` (email hanya dicatat).

## Admin master: tenant, koneksi HP, menu

Jalankan migrasi dulu (aman diulang): `psql -d voucher -f migrations/0002_admin_master.sql`.
Migrasi ini juga membuatkan akun `users` (peran tenant) untuk tenant yang belum punya, karena
`vouchers.scanned_by_user_id` wajib terisi saat scan. Akun itu bernama `hp-tenant-<id>` dan
`password_hash`-nya `!` (bukan hash argon2), jadi tidak bisa dipakai login dengan password.
Form tenant mengikuti DDL: nama pemilik wajib (`owner_name NOT NULL`), bank dan rekening opsional.
Tenant baru otomatis dibuatkan akun itu dalam satu perintah SQL yang atomik.
Menu contoh (opsional): `psql -d voucher -f deploy/dev_menu_seed.sql`.

**Menghubungkan HP tenant ke tenant-nya**

1. Admin buka `/admin/tenant`, pilih tenant, klik **Buat kode koneksi**. Kode dan QR tampil **sekali** (yang disimpan hanya hash-nya).
2. Tenant membuka `/masuk` di HP lalu mengetik kode, atau memindai QR itu dengan kamera HP. HP diingat 30 hari lewat cookie bertanda tangan.
3. Scan memakai akun `users` milik tenant itu (bukan `DEV_USER_ID`; `DEV_USER_ID` hanya cadangan di mode dev). Sejak itu `/scan`, `/today`, dan `/api/*` memakai tenant dari cookie. **Jika tidak ada cookie, mode dev tetap memakai `DEV_TENANT_ID`** seperti sebelumnya; cookie yang rusak/kedaluwarsa/diputus tidak jatuh ke tenant dev, HP diarahkan ke `/masuk`.
4. HP hilang atau berganti tangan: **Putuskan semua HP** (menaikkan versi sesi). Menonaktifkan tenant juga memutus semua HP-nya. Kode salah dibatasi 8 percobaan per menit per alamat.

**Perbedaan dari proposal (perlu diseragamkan saat login sungguhan dibuat)**

- Proposal: username + password + kunci perangkat (`users`, `tenant_devices`, `sessions`). Sekarang: kode koneksi dari admin + cookie bertanda tangan, dengan versi sesi di `tenants.session_version` untuk memutus HP. Tabel `tenant_devices` dan `sessions` belum terisi. Pencairan nanti butuh `tenant_device_id`, jadi saat itu kode koneksi dijadikan langkah "admin menyetujui perangkat" dan baris `tenant_devices` dibuat.
- Menu kantin (`menu_items`, `voucher_items`) tidak ada di proposal; ini fitur tambahan.

**Menu kantin**

- Admin mengelola menu per tenant (nama, harga, urutan, tersedia/tidak). Di HP tenant, halaman Scan punya tombol **Pilih menu** (daftar dengan tombol + dan −).
- Pilihan dikirim bersama scan. Server mengambil nama dan harga dari database, bukan dari HP, lalu menyimpannya (salinan) di `voucher_items` **hanya jika voucher berhasil dipakai**. Gagal mencatat menu tidak membatalkan scan.
- Layar hasil menampilkan pesanan, total, dan sisa bayar setelah potongan voucher. Daftar transaksi admin punya kolom Menu.
- Memilih menu bersifat opsional; scan tanpa menu bekerja seperti sebelumnya.

## Job terbit voucher harian

`cmd/issue-vouchers` membuat **voucher baru dengan token baru** untuk setiap staf aktif
(voucher kemarin tidak di-refresh, ia kedaluwarsa). Aturannya:

- Akhir pekan dan tanggal di tabel `holidays` dilewati.
- Aman dijalankan ulang: staf yang emailnya sudah terkirim dilewati; yang emailnya
  gagal diberi token baru lalu dikirim lagi (token lama mati).
- Email gagal dicoba 3 kali; jika masih gagal, exit code 1 (untuk peringatan).

```bash
go run ./cmd/issue-vouchers -open -print   # uji: berlaku sekarang, cetak QR (dev saja)
go run ./cmd/issue-vouchers -date 2026-11-09   # tanggal tertentu
```

Uji hari libur: `INSERT INTO holidays VALUES ('2026-11-09', 'Uji');` lalu jalankan
dengan `-date 2026-11-09` (tanpa `-open`/`-force`), harus muncul `dilewati`.

Di server kampus dijadwalkan dengan systemd timer (`deploy/systemd/`). Di Windows untuk uji
cukup dijalankan manual atau lewat Task Scheduler.

## Email: Mailpit atau Gmail dummy

| Tujuan | Pengaturan `.env` |
|---|---|
| Mailpit (default, aman) | `MAIL_DRIVER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`, user/pass kosong |
| Gmail dummy | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=akun@gmail.com`, `SMTP_PASS=<App Password>`, `MAIL_FROM=Voucher Kantin <akun@gmail.com>` |
| Tidak kirim, hanya catat | `MAIL_DRIVER=log` |

Gmail butuh verifikasi 2 langkah, lalu buat **App Password** (bukan password biasa).
Ganti email staf contoh di `deploy/dev_seed.sql` dengan alamat yang bisa kamu baca.
Saat izin Microsoft 365 turun, tambahkan `GraphMailer` di `internal/mail/` yang
memenuhi antarmuka `Mailer`; logika voucher tidak berubah.

## Yang sudah ada dan yang belum

Sudah (diuji):
- Token QR + HMAC + kode pendek (`go test ./internal/token`)
- Pembuat email multipart dengan QR inline (`go test ./internal/mail`)
- Skema 10 tabel dan query scan atomik (diuji di PostgreSQL: 20 scan bersamaan
  pada satu voucher hanya 1 yang berhasil)
- Server, `/healthz`, endpoint scan mode dev
- Halaman scan tenant (kamera), tab Hari ini, dashboard ringkasan, dan daftar transaksi

Belum (sesuai timeline):
- Login tenant + pendaftaran HP, login Microsoft, CSRF, rate limit (M6-M7, M10)
- Job tutup hari 16.05 dan batalkan payout basi (M8-M9)
- Penjadwalan otomatis terbit voucher (systemd timer di server kampus; contoh ada di `deploy/systemd/`)
- Pencairan tunai dua pihak, kuitansi, laporan kas, ekspor Excel/PDF
- Halaman admin: kelola staf, hari libur, kirim ulang, void; tab Pencairan untuk tenant (kelola tenant dan menu sudah ada)
- Service worker untuk halaman scan (cache saat sinyal lemah)
- Audit log berantai hash (tabel sudah ada, isinya belum ditulis)
- Hak akses database `voucher_app` (untuk produksi)

## Catatan keamanan

- `/api/scan` hanya aktif jika `APP_ENV=dev`. Tenant diambil dari cookie koneksi HP, atau `DEV_TENANT_ID` bila belum ada cookie. User pemindai masih `DEV_USER_ID`. Halaman admin (termasuk kelola tenant) belum punya login. Jangan dipakai di produksi.
- Ganti `QR_KEY` dan `SHORT_KEY` di produksi (`openssl rand -hex 32`). Jangan commit `.env`.
- Constraint domain email `@upitra.ac.id` pada tabel `staff` dihapus dari migrasi
  agar bisa memakai email dummy; validasinya harus ditambahkan di kode impor staf.
