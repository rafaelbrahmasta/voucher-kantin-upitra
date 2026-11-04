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
    server/         router dan handler HTTP
  web/
    templates/      HTML (base.html + satu file per halaman)
    static/         CSS (dan nanti scan.js, sw.js)
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
- Server, `/healthz`, template dasar, endpoint scan mode dev

Belum (sesuai timeline):
- Login tenant + pendaftaran HP, login Microsoft, CSRF, rate limit (M6-M7, M10)
- Job tutup hari 16.05 dan batalkan payout basi (M8-M9)
- Penjadwalan otomatis terbit voucher (systemd timer di server kampus; contoh ada di `deploy/systemd/`)
- Halaman scan dengan kamera, dashboard, pencairan, kuitansi, admin
- Audit log berantai hash (tabel sudah ada, isinya belum ditulis)
- Hak akses database `voucher_app` (untuk produksi)

## Catatan keamanan

- `/api/scan` hanya aktif jika `APP_ENV=dev` dan memakai tenant dari `DEV_TENANT_ID`
  tanpa login. Jangan pernah dipakai di produksi.
- Ganti `QR_KEY` dan `SHORT_KEY` di produksi (`openssl rand -hex 32`). Jangan commit `.env`.
- Constraint domain email `@upitra.ac.id` pada tabel `staff` dihapus dari migrasi
  agar bisa memakai email dummy; validasinya harus ditambahkan di kode impor staf.
