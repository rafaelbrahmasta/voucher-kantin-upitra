package mail

// GraphMailer mengirim email lewat Microsoft Graph API (application permission Mail.Send).
// Cocok untuk pengiriman otomatis (cron job) tanpa interaksi pengguna.
//
// Prasyarat di Azure Portal:
//  1. Entra ID → App registrations → Sistem Voucher Kantin UPITRA
//  2. API permissions → Add → Microsoft Graph → Application permissions → Mail.Send
//  3. Grant admin consent for Universitas Pignatelli Triputra
//  4. Set MS_MAIL_FROM=voucher@upitra.ac.id di .env

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// GraphMailer menggunakan client credentials flow untuk mendapatkan token,
// lalu memanggil https://graph.microsoft.com/v1.0/users/{from}/sendMail.
type GraphMailer struct {
	TenantID     string
	ClientID     string
	ClientSecret string
	MailFrom     string // UPN atau shared mailbox, mis. voucher@upitra.ac.id
	Log          *slog.Logger

	// Opsional, digunakan untuk unit testing/mocking
	TokenEndpoint string
	APIEndpoint   string
	HTTPClient    *http.Client

	mu         sync.Mutex
	cachedTok  string
	tokExpires time.Time
}

func (g *GraphMailer) client() *http.Client {
	if g.HTTPClient != nil {
		return g.HTTPClient
	}
	return http.DefaultClient
}

// token mengambil (atau memanfaatkan cache) access token dari Entra ID.
func (g *GraphMailer) token(ctx context.Context) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.cachedTok != "" && time.Now().Before(g.tokExpires) {
		return g.cachedTok, nil
	}

	endpoint := g.TokenEndpoint
	if endpoint == "" {
		endpoint = fmt.Sprintf(
			"https://login.microsoftonline.com/%s/oauth2/v2.0/token",
			url.PathEscape(g.TenantID),
		)
	}
	body := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {g.ClientID},
		"client_secret": {g.ClientSecret},
		"scope":         {"https://graph.microsoft.com/.default"},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint,
		strings.NewReader(body.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := g.client().Do(req)
	if err != nil {
		return "", fmt.Errorf("gagal ambil token Entra ID: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}
	if result.Error != "" {
		return "", fmt.Errorf("Entra ID: %s — %s", result.Error, result.ErrorDesc)
	}

	g.cachedTok = result.AccessToken
	// Simpan token dengan margin 60 detik
	g.tokExpires = time.Now().Add(time.Duration(result.ExpiresIn-60) * time.Second)
	return g.cachedTok, nil
}

// Send mengirim email lewat Graph API sendMail endpoint.
func (g *GraphMailer) Send(ctx context.Context, m Message) error {
	tok, err := g.token(ctx)
	if err != nil {
		return err
	}

	// Bangun payload JSON sesuai format Graph API sendMail
	type recipient struct {
		EmailAddress struct {
			Address string `json:"address"`
		} `json:"emailAddress"`
	}
	newRecipient := func(addr string) recipient {
		var r recipient
		r.EmailAddress.Address = addr
		return r
	}

	type attachment struct {
		OdataType   string `json:"@odata.type"`
		Name        string `json:"name"`
		ContentType string `json:"contentType"`
		ContentID   string `json:"contentId"`
		ContentBytes string `json:"contentBytes"` // base64
		IsInline    bool   `json:"isInline"`
	}

	var atts []attachment
	for _, img := range m.Inline {
		atts = append(atts, attachment{
			OdataType:    "#microsoft.graph.fileAttachment",
			Name:         img.CID + ".png",
			ContentType:  img.ContentType,
			ContentID:    img.CID,
			ContentBytes: base64.StdEncoding.EncodeToString(img.Data),
			IsInline:     true,
		})
	}

	msgPayload := map[string]any{
		"subject": m.Subject,
		"body": map[string]string{
			"contentType": "HTML",
			"content":     m.HTML,
		},
		"toRecipients": []recipient{newRecipient(m.To)},
	}
	if len(atts) > 0 {
		msgPayload["attachments"] = atts
	}

	payload := map[string]any{
		"message":         msgPayload,
		"saveToSentItems": true,
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	apiURL := g.APIEndpoint
	if apiURL == "" {
		apiURL = fmt.Sprintf(
			"https://graph.microsoft.com/v1.0/users/%s/sendMail",
			url.PathEscape(g.MailFrom),
		)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")

	resp, err := g.client().Do(req)
	if err != nil {
		return fmt.Errorf("Graph sendMail: %w", err)
	}
	defer resp.Body.Close()

	// 202 Accepted = sukses
	if resp.StatusCode == http.StatusAccepted {
		g.Log.Info("email terkirim via Graph API", "to", m.To, "subject", m.Subject)
		return nil
	}

	// Baca body error untuk logging
	errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("Graph sendMail HTTP %d: %s", resp.StatusCode, string(errBody))
}
