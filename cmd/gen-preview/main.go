package main

import (
	"encoding/base64"
	"fmt"
	"os"

	"github.com/skip2/go-qrcode"
)

func main() {
	qrPayload := "UPV1.4iDjbmAw2Eo1sFVMb-8gSQ.b4VQRiG24WWb4FgY_4rQcw"
	code := "CV70-7TT6"
	name := "Rafael Bramasta"
	unit := "Fakultas Teknologi Informasi"

	png, err := qrcode.Encode(qrPayload, qrcode.Medium, 240)
	if err != nil {
		fmt.Printf("err: %v\n", err)
		return
	}

	b64QR := base64.StdEncoding.EncodeToString(png)

	htmlContent := fmt.Sprintf(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Pratinjau Email Voucher Kantin UPITRA</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f1f5f9; padding: 2rem; color: #1e293b; margin: 0; }
  .email-card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #e2e8f0; }
  .email-header { background: #004085; color: #ffffff; padding: 1.25rem 1.5rem; display: flex; align-items: center; justify-content: space-between; }
  .email-header h1 { margin: 0; font-size: 1.15rem; font-weight: 700; letter-spacing: -0.01em; }
  .badge { background: #ffc107; color: #000; font-weight: 700; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 99px; }
  .email-body { padding: 1.75rem 1.5rem; text-align: center; }
  .greeting { font-size: 1.05rem; margin-bottom: 0.5rem; text-align: left; }
  .amount-box { background: #f0fdf4; border: 2px dashed #22c55e; border-radius: 10px; padding: 1rem; margin: 1.25rem 0; }
  .amount-title { color: #15803d; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
  .amount-val { color: #166534; font-size: 1.75rem; font-weight: 800; margin: 0.25rem 0 0 0; }
  .qr-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 1rem; display: inline-block; margin: 0.5rem 0 1rem 0; }
  .qr-box img { display: block; border-radius: 6px; }
  .code-container { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 1rem; margin: 1rem 0; }
  .code-label { font-size: 0.8rem; color: #64748b; margin-bottom: 0.25rem; }
  .code-val { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 1.4rem; font-weight: 700; color: #0f172a; letter-spacing: 0.1em; }
  .expiry-note { font-size: 0.85rem; color: #475569; margin: 0.75rem 0; line-height: 1.4; }
  .email-footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 1rem 1.5rem; font-size: 0.75rem; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
<div class="email-card">
  <div class="email-header">
    <h1>Kantin Digital UPITRA</h1>
    <span class="badge">Voucher Harian</span>
  </div>
  <div class="email-body">
    <p class="greeting">Halo <b>%s</b> (%s),</p>
    <p style="text-align:left; color:#475569; margin-top:0">Ini voucher makan Anda untuk hari ini dari Universitas Pignatelli Triputra.</p>

    <div class="amount-box">
      <p class="amount-title">Subsidi Voucher Makan</p>
      <p class="amount-val">Potongan Rp5.000</p>
    </div>

    <div class="qr-box">
      <img src="data:image/png;base64,%s" width="220" height="220" alt="QR Voucher">
    </div>

    <div class="code-container">
      <div class="code-label">Kode Cadangan (Bila kamera kasir tidak bisa scan):</div>
      <div class="code-val">%s</div>
    </div>

    <p class="expiry-note">
      Berlaku di semua stan kantin kampus sampai pukul <b>16.00 WIB</b>.<br>
      Tunjukkan QR Code ini ke kasir stan kantin saat memesan. Hanya bisa dipakai 1 kali.
    </p>
  </div>
  <div class="email-footer">
    Email otomatis dari Sistem Voucher Kantin UPITRA · Mohon tidak membalas email ini.
  </div>
</div>
</body>
</html>`, name, unit, b64QR, code)

	_ = os.WriteFile("preview_email_voucher.html", []byte(htmlContent), 0644)
	fmt.Println("File preview_email_voucher.html berhasil dibuat.")
}
