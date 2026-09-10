package main

import (
	_ "embed"
	"log"
	"net/http"

	"solarsystem/backend/internal/config"
	"solarsystem/backend/internal/diskcache"
	"solarsystem/backend/internal/handlers"
	"solarsystem/backend/internal/nasa"
)

//go:embed data/planets.json
var planetsJSON []byte

func main() {
	cfg := config.Load()

	deps := &handlers.Deps{
		Nasa:        nasa.NewClient(cfg.NasaAPIKey),
		Cache:       diskcache.New("cache"),
		PlanetsJSON: planetsJSON,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", deps.Health)
	mux.HandleFunc("GET /api/planets", deps.Planets)
	mux.HandleFunc("GET /api/apod", deps.Apod)
	mux.HandleFunc("GET /api/epic", deps.Epic)
	mux.HandleFunc("GET /api/epic/image", deps.EpicImage)
	mux.HandleFunc("GET /api/gibs/earth-texture", deps.Gibs)

	handler := handlers.Logging(handlers.CORS(mux))

	log.Printf("solar-system backend listening on :%s (NASA key configured: %v)", cfg.Port, cfg.NasaAPIKey != "DEMO_KEY")
	if err := http.ListenAndServe(":"+cfg.Port, handler); err != nil {
		log.Fatal(err)
	}
}
