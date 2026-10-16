package handlers

import (
	"io"
	"log"
	"testing"
)

func captureLog(t *testing.T, w io.Writer) {
	prev := log.Writer()
	log.SetOutput(w)
	t.Cleanup(func() { log.SetOutput(prev) })
}
