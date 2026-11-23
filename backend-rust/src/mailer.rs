use base64::engine::general_purpose::STANDARD as B64_STD;
use base64::Engine;
use qrcode::QrCode;
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use crate::config::Config;

pub struct VoucherEmailData<'a> {
    pub staff_name: &'a str,
    pub staff_email: &'a str,
    pub date_str: &'a str,
    pub qr_payload: &'a str,
    pub short_code: &'a str,
}

/// Menghasilkan gambar QR Code format PNG dalam bentuk base64
pub fn generate_qr_png_base64(payload: &str) -> Result<String, String> {
    let code = QrCode::new(payload.as_bytes())
        .map_err(|e| format!("Gagal generate QR Code: {}", e))?;

    let image = code
        .render::<image::Luma<u8>>()
        .min_dimensions(320, 320)
        .max_dimensions(640, 640)
        .build();

    let mut png_bytes = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_bytes);
    image
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| format!("Gagal encode QR PNG: {}", e))?;

    Ok(B64_STD.encode(png_bytes))
}

/// Template Email Resmi UPITRA bertema Blue Sky & White
pub fn build_email_html(data: &VoucherEmailData, qr_png_b64: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voucher Makan Kantin UPITRA</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #f0f9ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 24px; border: 1px solid #bae6fd; box-shadow: 0 10px 25px -5px rgba(14, 165, 233, 0.1); overflow: hidden;">
    <!-- Header UPITRA -->
    <tr>
      <td style="padding: 28px 28px 20px 28px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); text-align: center;">
        <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; background-color: #ffffff; border-radius: 12px; font-weight: 900; font-size: 20px; color: #0284c7; margin-bottom: 8px;">UP</div>
        <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">Voucher Kantin UPITRA</h1>
        <p style="margin: 4px 0 0 0; color: #e0f2fe; font-size: 12px; font-weight: 500;">Universitas Pignatelli Triputra</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 24px 28px 20px 28px;">
        <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5;">Yth. Bapak/Ibu <strong>{}</strong>,</p>
        <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.6; color: #475569;">
          Berikut adalah voucher subsidi makan siang Anda untuk hari ini, <strong>{}</strong>. Silakan tunjukkan QR Code atau sebutkan Nomor Kode di bawah ini kepada kasir stan kantin kampus UPITRA.
        </p>

        <!-- Informasi Voucher -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; margin-bottom: 20px; padding: 14px 18px;">
          <tr>
            <td style="font-size: 12px; color: #64748b; padding-bottom: 6px;">Nominal Subsidi:</td>
            <td align="right" style="font-size: 16px; font-weight: 800; color: #0284c7; padding-bottom: 6px;">Rp 5.000</td>
          </tr>
          <tr>
            <td style="font-size: 12px; color: #64748b;">Jam Berlaku:</td>
            <td align="right" style="font-size: 13px; font-weight: 700; color: #0f172a;">10.00 – 16.00 WIB</td>
          </tr>
        </table>

        <!-- Kartu Utama: QR Code & Nomor Kode Berdampingan -->
        <div style="text-align: center; margin: 20px 0; padding: 22px 18px; background-color: #ffffff; border: 2px dashed #0284c7; border-radius: 20px;">
          <!-- Visual QR Code -->
          <div style="background-color: #ffffff; padding: 12px; display: inline-block; border-radius: 16px; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.12); border: 1px solid #e0f2fe;">
            <img src="data:image/png;base64,{}" alt="QR Code Voucher" width="220" height="220" style="display: block; margin: 0 auto; border-radius: 8px;" />
          </div>
          <p style="margin: 12px 0 16px 0; font-size: 12px; color: #0284c7; font-weight: 700;">
            📷 Arahkan QR Code di atas ke kamera kasir stan
          </p>

          <!-- Kotak Nomor Kode Voucher Resmi (Dibuatkan nomor kode berdampingan dengan QR) -->
          <div style="background-color: #f0fdf4; border: 1.5px solid #86efac; border-radius: 14px; padding: 14px 12px; text-align: center;">
            <span style="font-size: 11px; color: #166534; font-weight: 700; display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
              NOMOR KODE VOUCHER (PILIHAN CADANGAN / MANUAL):
            </span>
            <span style="font-family: Consolas, 'Courier New', monospace; font-size: 24px; font-weight: 900; letter-spacing: 4px; color: #15803d; display: block;">
              {}
            </span>
            <span style="font-size: 10px; color: #15803d; margin-top: 4px; display: block; font-weight: 500;">
              Sebutkan kode di atas jika kasir stan menginput manual / tanpa kamera
            </span>
          </div>
        </div>

        <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #94a3b8; text-align: center;">
          * Voucher ini hanya berlaku 1x transaksi pada tanggal yang tertera dan akan hangus otomatis setelah pukul 16.00 WIB.
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 16px 28px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #94a3b8;">
          © 2026 Biro Keuangan & Administrasi UPITRA<br>
          Universitas Pignatelli Triputra
        </p>
      </td>
    </tr>
  </table>
</body>
</html>"#,
        data.staff_name, data.date_str, qr_png_b64, data.short_code
    )
}

/// Pengirim Email Utama (Mendukung Microsoft Graph API, SMTP/Mailpit, dan Log)
pub async fn send_voucher_email(cfg: &Config, data: &VoucherEmailData<'_>) -> Result<(), String> {
    let qr_png_b64 = generate_qr_png_base64(data.qr_payload)?;

    match cfg.mail_driver.as_str() {
        "graph" => send_via_microsoft_graph(cfg, data, &qr_png_b64).await,
        "smtp" => send_via_smtp(cfg, data, &qr_png_b64).await,
        "fail" => Err("Simulasi kegagalan pengiriman email (MAIL_DRIVER=fail)".to_string()),
        _ => {
            // Mode "log" (default offline)
            tracing::info!(
                "✉️ [MAIL LOG] Mengirim voucher ke {} ({}) | Tanggal: {} | Kode: {}",
                data.staff_name,
                data.staff_email,
                data.date_str,
                data.short_code
            );

            // Cetak juga visual ASCII QR Code ke konsol log
            if let Ok(code) = QrCode::new(data.qr_payload.as_bytes()) {
                let string = code
                    .render::<char>()
                    .quiet_zone(false)
                    .module_dimensions(2, 1)
                    .build();
                tracing::info!(
                    "📱 [QR CODE PREVIEW UNTUK {} (Kode: {})]\n{}",
                    data.staff_name,
                    data.short_code,
                    string
                );
            }

            // Simpan file preview HTML lengkap (QR + Nomor Kode)
            let preview_html = build_email_html(data, &qr_png_b64);
            let preview_dir = std::path::Path::new("target/voucher_previews");
            if let Ok(()) = std::fs::create_dir_all(preview_dir) {
                let safe_email = data.staff_email.replace('@', "_at_").replace('.', "_");
                let file_path = preview_dir.join(format!("{}_{}.html", data.date_str, safe_email));
                let _ = std::fs::write(&file_path, preview_html);
                tracing::info!("📄 [PREVIEW FILE] Kartu voucher tersimpan di {}", file_path.display());
            }

            Ok(())
        }
    }
}

/// Pengiriman resmi via Microsoft Graph API (Outlook 365)
async fn send_via_microsoft_graph(
    cfg: &Config,
    data: &VoucherEmailData<'_>,
    qr_png_b64: &str,
) -> Result<(), String> {
    let tenant_id = cfg.ms_tenant_id.as_deref().ok_or("MS_TENANT_ID belum diatur di .env")?;
    let client_id = cfg.ms_client_id.as_deref().ok_or("MS_CLIENT_ID belum diatur di .env")?;
    let client_secret = cfg.ms_client_secret.as_deref().ok_or("MS_CLIENT_SECRET belum diatur di .env")?;
    let mail_from = cfg.ms_mail_from.as_deref().unwrap_or("voucher@upitra.ac.id");

    // 1. Dapatkan Access Token OAuth 2.0 Client Credentials
    let token_url = format!("https://login.microsoftonline.com/{}/oauth2/v2.0/token", tenant_id);
    let client = reqwest::Client::new();

    let token_res = client
        .post(&token_url)
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("scope", "https://graph.microsoft.com/.default"),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|e| format!("Gagal request OAuth token ke Microsoft: {}", e))?;

    if !token_res.status().is_success() {
        let err_text = token_res.text().await.unwrap_or_default();
        return Err(format!("Microsoft OAuth gagal: {}", err_text));
    }

    let token_json: serde_json::Value = token_res
        .json()
        .await
        .map_err(|e| format!("Gagal parse response token Microsoft: {}", e))?;

    let access_token = token_json["access_token"]
        .as_str()
        .ok_or("Access token tidak ditemukan di response Microsoft")?;

    // 2. Kirim Pesan Email via Microsoft Graph API /sendMail
    let send_url = format!("https://graph.microsoft.com/v1.0/users/{}/sendMail", mail_from);
    let html_content = build_email_html(data, qr_png_b64);

    let message_payload = json!({
        "message": {
            "subject": format!("Voucher Makan Kantin UPITRA - {}", data.date_str),
            "body": {
                "contentType": "HTML",
                "content": html_content
            },
            "toRecipients": [
                {
                    "emailAddress": {
                        "name": data.staff_name,
                        "address": data.staff_email
                    }
                }
            ],
            "attachments": [
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    "name": "qr-voucher.png",
                    "contentType": "image/png",
                    "contentBytes": qr_png_b64,
                    "isInline": true,
                    "contentId": "voucher-qr"
                }
            ]
        },
        "saveToSentItems": "false"
    });

    let send_res = client
        .post(&send_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&message_payload)
        .send()
        .await
        .map_err(|e| format!("Gagal mengirim email via Microsoft Graph API: {}", e))?;

    if !send_res.status().is_success() {
        let status = send_res.status();
        let err_text = send_res.text().await.unwrap_or_default();
        return Err(format!("Microsoft Graph sendMail gagal (HTTP {}): {}", status, err_text));
    }

    tracing::info!(
        "✅ [MS GRAPH] Email voucher sukses dikirim ke {} ({}) via Outlook 365",
        data.staff_name,
        data.staff_email
    );

    Ok(())
}

/// Pengiriman via SMTP lokal (Mailpit di localhost:1025) untuk uji coba development
async fn send_via_smtp(
    cfg: &Config,
    data: &VoucherEmailData<'_>,
    qr_png_b64: &str,
) -> Result<(), String> {
    let host = cfg.smtp_host.as_deref().unwrap_or("localhost");
    let port = cfg.smtp_port;
    let target = format!("{}:{}", host, port);

    let mut stream = TcpStream::connect(&target)
        .await
        .map_err(|e| format!("Gagal terhubung ke SMTP server {}: {}", target, e))?;

    let mut buf = [0u8; 1024];
    let n = stream.read(&mut buf).await.map_err(|e| format!("Gagal membaca banner SMTP: {}", e))?;
    let banner = String::from_utf8_lossy(&buf[..n]);
    if banner.starts_with('4') || banner.starts_with('5') {
        return Err(format!("SMTP server menolak koneksi: {}", banner.trim()));
    }

    // Helper kirim perintah SMTP dengan pengecekan kode balasan server
    async fn send_cmd(stream: &mut TcpStream, cmd: &str) -> Result<String, String> {
        stream.write_all(cmd.as_bytes()).await.map_err(|e| e.to_string())?;
        let mut b = [0u8; 1024];
        let n = stream.read(&mut b).await.map_err(|e| e.to_string())?;
        let res = String::from_utf8_lossy(&b[..n]).to_string();
        if res.starts_with('4') || res.starts_with('5') {
            return Err(format!("SMTP error pada '{}': {}", cmd.trim(), res.trim()));
        }
        Ok(res)
    }

    send_cmd(&mut stream, "HELO localhost\r\n").await?;

    // Jika kredensial SMTP tersedia, lakukan AUTH LOGIN
    if let (Some(ref user), Some(ref pass)) = (&cfg.smtp_user, &cfg.smtp_pass) {
        if !user.is_empty() && !pass.is_empty() {
            send_cmd(&mut stream, "AUTH LOGIN\r\n").await?;
            send_cmd(&mut stream, &format!("{}\r\n", B64_STD.encode(user.as_bytes()))).await?;
            send_cmd(&mut stream, &format!("{}\r\n", B64_STD.encode(pass.as_bytes()))).await?;
        }
    }

    send_cmd(&mut stream, &format!("MAIL FROM:<{}>\r\n", cfg.mail_from)).await?;
    send_cmd(&mut stream, &format!("RCPT TO:<{}>\r\n", data.staff_email)).await?;
    send_cmd(&mut stream, "DATA\r\n").await?;

    let boundary = "----=_Part_UPITRA_VOUCHER_2026";
    let html_content = build_email_html(data, qr_png_b64);

    let raw_email = format!(
        "From: {}\r\n\
         To: <{}>\r\n\
         Subject: Voucher Makan Kantin UPITRA - {}\r\n\
         MIME-Version: 1.0\r\n\
         Content-Type: multipart/related; boundary=\"{}\"\r\n\
         \r\n\
         --{}\r\n\
         Content-Type: text/html; charset=UTF-8\r\n\
         Content-Transfer-Encoding: 8bit\r\n\
         \r\n\
         {}\r\n\
         \r\n\
         --{}\r\n\
         Content-Type: image/png; name=\"qr-voucher.png\"\r\n\
         Content-Transfer-Encoding: base64\r\n\
         Content-ID: <voucher-qr>\r\n\
         Content-Disposition: inline; filename=\"qr-voucher.png\"\r\n\
         \r\n\
         {}\r\n\
         \r\n\
         --{}--\r\n\
         .\r\n",
        cfg.mail_from, data.staff_email, data.date_str, boundary, boundary, html_content, boundary, qr_png_b64, boundary
    );

    stream.write_all(raw_email.as_bytes()).await.map_err(|e| e.to_string())?;
    let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    let data_res = String::from_utf8_lossy(&buf[..n]);
    if data_res.starts_with('4') || data_res.starts_with('5') {
        return Err(format!("SMTP error setelah pengiriman DATA: {}", data_res.trim()));
    }
    let _ = send_cmd(&mut stream, "QUIT\r\n").await;

    tracing::info!(
        "✅ [SMTP/Mailpit] Email voucher sukses dikirim ke {} ({})",
        data.staff_name,
        data.staff_email
    );

    Ok(())
}
