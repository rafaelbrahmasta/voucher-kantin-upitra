package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIScanPairAndMe(t *testing.T) {
	s, _, _ := newMasterServer(t, "dev")
	h := s.Handler()

	// 1. Initial /api/scan/me without cookie (in dev mode falls back to DevTenantID 1)
	req := httptest.NewRequest(http.MethodGet, "/api/scan/me", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var meRes map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &meRes); err != nil {
		t.Fatal(err)
	}
	if meRes["authenticated"] != true || meRes["tenantId"] != float64(1) {
		t.Fatalf("expected authenticated=true, tenantId=1, got %v", meRes)
	}

	// 2. Pair to tenant 2 via mode demo (tenant_id: 2)
	pairBody, _ := json.Marshal(map[string]any{"tenant_id": 2})
	pairReq := httptest.NewRequest(http.MethodPost, "/api/scan/pair", bytes.NewReader(pairBody))
	pairReq.Header.Set("Content-Type", "application/json")
	pairRec := httptest.NewRecorder()
	h.ServeHTTP(pairRec, pairReq)
	if pairRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", pairRec.Code, pairRec.Body.String())
	}

	// Extract cookie
	cookies := pairRec.Result().Cookies()
	var sessCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == sessionCookie {
			sessCookie = c
			break
		}
	}
	if sessCookie == nil {
		t.Fatal("session cookie not set")
	}

	// 3. /api/scan/me with the session cookie -> should be tenant 2!
	req2 := httptest.NewRequest(http.MethodGet, "/api/scan/me", nil)
	req2.AddCookie(sessCookie)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec2.Code)
	}
	var meRes2 map[string]any
	if err := json.Unmarshal(rec2.Body.Bytes(), &meRes2); err != nil {
		t.Fatal(err)
	}
	if meRes2["authenticated"] != true || meRes2["tenantId"] != float64(2) {
		t.Fatalf("expected authenticated=true, tenantId=2, got %v", meRes2)
	}

	// 4. Pair with valid code
	codeBody, _ := json.Marshal(map[string]any{"code": goodCode})
	codeReq := httptest.NewRequest(http.MethodPost, "/api/scan/pair", bytes.NewReader(codeBody))
	codeReq.Header.Set("Content-Type", "application/json")
	codeRec := httptest.NewRecorder()
	h.ServeHTTP(codeRec, codeReq)
	if codeRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", codeRec.Code, codeRec.Body.String())
	}

	// 5. Check /api/scan/tenants
	tenantsReq := httptest.NewRequest(http.MethodGet, "/api/scan/tenants", nil)
	tenantsRec := httptest.NewRecorder()
	h.ServeHTTP(tenantsRec, tenantsReq)
	if tenantsRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", tenantsRec.Code)
	}
}
