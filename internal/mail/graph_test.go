package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"voucher-kantin/internal/config"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestGraphMailer_Send(t *testing.T) {
	var tokenCalls int
	var sendCalls int

	mockTransport := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "/token") {
			tokenCalls++
			if err := r.ParseForm(); err != nil {
				t.Fatalf("parse form: %v", err)
			}
			if r.PostFormValue("grant_type") != "client_credentials" {
				t.Errorf("grant_type = %v", r.PostFormValue("grant_type"))
			}
			if r.PostFormValue("client_id") != "test-client-id" {
				t.Errorf("client_id = %v", r.PostFormValue("client_id"))
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(`{"access_token":"mock-access-token-123","expires_in":3600}`)),
			}, nil
		}

		if strings.HasSuffix(r.URL.Path, "/sendMail") {
			sendCalls++
			if r.Header.Get("Authorization") != "Bearer mock-access-token-123" {
				t.Errorf("auth header = %v", r.Header.Get("Authorization"))
			}
			bodyBytes, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read body: %v", err)
			}
			var payload struct {
				Message struct {
					Subject      string `json:"subject"`
					ToRecipients []struct {
						EmailAddress struct {
							Address string `json:"address"`
						} `json:"emailAddress"`
					} `json:"toRecipients"`
					Attachments []struct {
						Name      string `json:"name"`
						ContentID string `json:"contentId"`
						IsInline  bool   `json:"isInline"`
					} `json:"attachments"`
				} `json:"message"`
			}
			if err := json.Unmarshal(bodyBytes, &payload); err != nil {
				t.Fatalf("unmarshal json: %v", err)
			}
			if payload.Message.Subject != "Voucher Hari Ini" {
				t.Errorf("subject = %v", payload.Message.Subject)
			}
			if len(payload.Message.ToRecipients) != 1 || payload.Message.ToRecipients[0].EmailAddress.Address != "dosen@upitra.ac.id" {
				t.Errorf("recipient = %v", payload.Message.ToRecipients)
			}
			if len(payload.Message.Attachments) != 1 || payload.Message.Attachments[0].ContentID != "qr" {
				t.Errorf("attachment = %v", payload.Message.Attachments)
			}

			return &http.Response{
				StatusCode: http.StatusAccepted,
				Body:       io.NopCloser(bytes.NewReader(nil)),
			}, nil
		}

		return &http.Response{
			StatusCode: http.StatusNotFound,
			Body:       io.NopCloser(bytes.NewReader(nil)),
		}, nil
	})

	mailer := &GraphMailer{
		TenantID:      "test-tenant",
		ClientID:      "test-client-id",
		ClientSecret:  "test-secret",
		MailFrom:      "voucher@upitra.ac.id",
		TokenEndpoint: "https://mock.local/token",
		APIEndpoint:   "https://mock.local/sendMail",
		HTTPClient:    &http.Client{Transport: mockTransport},
		Log:           slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	msg := Message{
		To:      "dosen@upitra.ac.id",
		Subject: "Voucher Hari Ini",
		HTML:    "<p>Voucher Anda</p>",
		Inline: []InlineImage{
			{
				CID:         "qr",
				ContentType: "image/png",
				Data:        []byte{1, 2, 3, 4},
			},
		},
	}

	// Kirim pertama (harus ambil token lalu send)
	if err := mailer.Send(context.Background(), msg); err != nil {
		t.Fatalf("Send error: %v", err)
	}

	// Kirim kedua (token harus dicache, tidak panggil /token lagi)
	if err := mailer.Send(context.Background(), msg); err != nil {
		t.Fatalf("Send error 2: %v", err)
	}

	if tokenCalls != 1 {
		t.Errorf("expected 1 token call due to caching, got %d", tokenCalls)
	}
	if sendCalls != 2 {
		t.Errorf("expected 2 send calls, got %d", sendCalls)
	}
}

func TestGraphMailer_TokenError(t *testing.T) {
	mockTransport := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusBadRequest,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"error":"invalid_client","error_description":"client secret invalid"}`)),
		}, nil
	})

	mailer := &GraphMailer{
		TenantID:      "test-tenant",
		ClientID:      "test-client-id",
		ClientSecret:  "bad-secret",
		MailFrom:      "voucher@upitra.ac.id",
		TokenEndpoint: "https://mock.local/token",
		HTTPClient:    &http.Client{Transport: mockTransport},
		Log:           slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	err := mailer.Send(context.Background(), Message{To: "a@b.com"})
	if err == nil || !strings.Contains(err.Error(), "client secret invalid") {
		t.Fatalf("expected client secret error, got: %v", err)
	}
}

func TestNew_Graph(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	// Missing fields
	_, err := New(config.MailConfig{Driver: "graph"}, config.MSConfig{}, logger)
	if err == nil {
		t.Fatal("expected error for missing Entra ID configs")
	}

	// Missing MailFrom
	_, err = New(config.MailConfig{Driver: "graph"}, config.MSConfig{
		TenantID:     "t",
		ClientID:     "c",
		ClientSecret: "s",
	}, logger)
	if err == nil {
		t.Fatal("expected error for missing MailFrom")
	}

	// Valid graph config
	m, err := New(config.MailConfig{Driver: "graph"}, config.MSConfig{
		TenantID:     "t",
		ClientID:     "c",
		ClientSecret: "s",
		MailFrom:     "voucher@upitra.ac.id",
	}, logger)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := m.(*GraphMailer); !ok {
		t.Fatalf("expected *GraphMailer, got %T", m)
	}
}
