package main

import (
	_ "embed"
	"log"
	"net/http"
	"time"

	"golang.org/x/time/rate"

	"solarsystem/backend/internal/celestrak"
	"solarsystem/backend/internal/config"
	"solarsystem/backend/internal/diskcache"
	"solarsystem/backend/internal/ephem"
	"solarsystem/backend/internal/handlers"
	"solarsystem/backend/internal/nasa"
	"solarsystem/backend/internal/ratelimit"
)

//go:embed data/planets.json
var planetsJSON []byte

func main() {
	cfg := config.Load()

	deps := handlers.New(nasa.NewClient(cfg.NasaAPIKey), diskcache.New("cache"), planetsJSON)
	deps.Horizons = ephem.NewHorizons()
	deps.Celestrak = celestrak.New()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", deps.Health)
	mux.HandleFunc("GET /api/planets", deps.Planets)
	mux.HandleFunc("GET /api/apod", deps.Apod)
	mux.HandleFunc("GET /api/epic", deps.Epic)
	mux.HandleFunc("GET /api/epic/image", deps.EpicImage)
	mux.HandleFunc("GET /api/gibs/earth-texture", deps.Gibs)
	mux.HandleFunc("GET /api/ephem/{set}", deps.Ephem)
	mux.HandleFunc("GET /api/satellites", deps.Satellites)

	limiter := ratelimit.New(rate.Limit(2), 20, cfg.ClientIPHeader)
	handler := handlers.Logging(handlers.CORS(limiter.Middleware(mux)))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      2 * time.Minute,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    16 << 10,
	}

	log.Printf("solar-system backend listening on :%s (NASA key configured: %v)", cfg.Port, cfg.NasaAPIKey != "DEMO_KEY")
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
