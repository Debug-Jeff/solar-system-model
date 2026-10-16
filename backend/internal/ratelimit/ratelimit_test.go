package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/time/rate"
)

func TestMiddlewareLimitsPerIP(t *testing.T) {
	l := New(rate.Limit(0.0001), 2, "")
	h := l.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	codes := func(remote string, n int) []int {
		var out []int
		for i := 0; i < n; i++ {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = remote
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			out = append(out, rec.Code)
		}
		return out
	}

	a := codes("10.0.0.1:1234", 3)
	if a[0] != 200 || a[1] != 200 || a[2] != http.StatusTooManyRequests {
		t.Fatalf("client A codes = %v", a)
	}
	if b := codes("10.0.0.2:1234", 1); b[0] != 200 {
		t.Fatalf("client B should have its own budget, got %v", b)
	}
}

func TestClientIPHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("True-Client-IP", "203.0.113.7")

	if got := New(1, 1, "").ClientIP(req); got != "10.0.0.1" {
		t.Fatalf("without header config got %q", got)
	}
	if got := New(1, 1, "True-Client-IP").ClientIP(req); got != "203.0.113.7" {
		t.Fatalf("with header config got %q", got)
	}
	req.Header.Set("True-Client-IP", "not-an-ip")
	if got := New(1, 1, "True-Client-IP").ClientIP(req); got != "10.0.0.1" {
		t.Fatalf("garbage header should fall back to RemoteAddr, got %q", got)
	}
}
