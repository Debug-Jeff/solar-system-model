package ratelimit

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

const (
	idleTTL     = 10 * time.Minute
	pruneEvery  = time.Minute
	maxVisitors = 50_000
)

type visitor struct {
	limiter *rate.Limiter
	seen    time.Time
}

type Limiter struct {
	mu        sync.Mutex
	visitors  map[string]*visitor
	limit     rate.Limit
	burst     int
	ipHeader  string
	lastPrune time.Time
	now       func() time.Time
}

func New(limit rate.Limit, burst int, ipHeader string) *Limiter {
	return &Limiter{
		visitors: make(map[string]*visitor),
		limit:    limit,
		burst:    burst,
		ipHeader: ipHeader,
		now:      time.Now,
	}
}

func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	if now.Sub(l.lastPrune) > pruneEvery || len(l.visitors) >= maxVisitors {
		l.prune(now)
	}

	v, ok := l.visitors[key]
	if !ok {
		if len(l.visitors) >= maxVisitors {
			return false
		}
		v = &visitor{limiter: rate.NewLimiter(l.limit, l.burst)}
		l.visitors[key] = v
	}
	v.seen = now
	return v.limiter.AllowN(now, 1)
}

func (l *Limiter) prune(now time.Time) {
	for k, v := range l.visitors {
		if now.Sub(v.seen) > idleTTL {
			delete(l.visitors, k)
		}
	}
	l.lastPrune = now
}

func (l *Limiter) ClientIP(r *http.Request) string {
	if l.ipHeader != "" {
		if h := r.Header.Get(l.ipHeader); h != "" {
			first, _, _ := strings.Cut(h, ",")
			if ip := net.ParseIP(strings.TrimSpace(first)); ip != nil {
				return ip.String()
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (l *Limiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.Allow(l.ClientIP(r)) {
			w.Header().Set("Retry-After", "1")
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"too many requests"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
