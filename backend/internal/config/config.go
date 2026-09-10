package config

import (
	"bufio"
	"os"
	"strings"
)

type Config struct {
	NasaAPIKey string
	Port       string
}

// loadDotEnv reads KEY=VALUE pairs from a .env file into the process
// environment, skipping blank lines and #-comments. Existing env vars
// are never overwritten, so real environment variables still win.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, value)
		}
	}
}

func Load() Config {
	loadDotEnv(".env")

	cfg := Config{
		NasaAPIKey: os.Getenv("NASA_API_KEY"),
		Port:       os.Getenv("PORT"),
	}
	if cfg.NasaAPIKey == "" {
		cfg.NasaAPIKey = "DEMO_KEY"
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	return cfg
}
