package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"

	"solarsystem/backend/internal/ephem"
)

type Options struct {
	OutDir       string
	ElementsPath string
	Vectors      ephem.VectorSource
	SBDB         *ephem.SBDB
	SmallBodies  string
	NeoWs        *ephem.NeoWs
	NasaKey      string
	Now          time.Time
}

type pendingFile struct {
	path string
	data []byte
}

func Run(ctx context.Context, opts Options) error {
	names := make([]string, 0, len(ephem.Sets))
	for name := range ephem.Sets {
		names = append(names, name)
	}
	sort.Strings(names)

	var pending []pendingFile
	for _, name := range names {
		file, err := ephem.BuildSet(ctx, opts.Vectors, name, opts.Now)
		if err != nil {
			return err
		}
		data, err := json.Marshal(file)
		if err != nil {
			return err
		}
		pending = append(pending, pendingFile{filepath.Join(opts.OutDir, name+".json"), data})
	}

	elements := map[string]ephem.Elements{}
	for id, designation := range ephem.SmallBodies {
		el, err := opts.SBDB.Elements(ctx, designation)
		if err != nil {
			return err
		}
		elements[id] = el
	}
	data, err := json.MarshalIndent(elements, "", "  ")
	if err != nil {
		return err
	}
	pending = append(pending, pendingFile{opts.ElementsPath, append(data, '\n')})

	if opts.SmallBodies != "" {
		small, err := ephem.BuildSmallBodies(ctx, opts.SBDB, opts.NeoWs, opts.NasaKey, opts.Now)
		if err != nil {
			return err
		}
		encoded, err := json.Marshal(small)
		if err != nil {
			return err
		}
		pending = append(pending, pendingFile{opts.SmallBodies, encoded})
	}

	return writeAll(pending)
}

func writeAll(files []pendingFile) error {
	temps := make([]string, len(files))
	for i, f := range files {
		if err := os.MkdirAll(filepath.Dir(f.path), 0o755); err != nil {
			return err
		}
		tmp, err := os.CreateTemp(filepath.Dir(f.path), ".snapshot-*")
		if err != nil {
			return err
		}
		temps[i] = tmp.Name()
		_, werr := tmp.Write(f.data)
		cerr := tmp.Close()
		if werr != nil || cerr != nil {
			removeAll(temps)
			return fmt.Errorf("writing %s failed", f.path)
		}
	}
	for i, f := range files {
		if err := os.Rename(temps[i], f.path); err != nil {
			removeAll(temps[i:])
			return err
		}
	}
	return nil
}

func removeAll(paths []string) {
	for _, p := range paths {
		if p != "" {
			_ = os.Remove(p)
		}
	}
}

func main() {
	out := flag.String("out", "../frontend/public/data/ephem", "directory for ephemeris set files")
	smallBodies := flag.String("smallbodies", "../frontend/public/data/smallbodies.json", "small-bodies file (empty to skip)")
	elementsPath := flag.String("elements", "../frontend/src/ephemeris/data/smallBodyElements.json", "small-body elements file")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	err := Run(ctx, Options{
		OutDir:       *out,
		ElementsPath: *elementsPath,
		Vectors:      ephem.NewHorizons(),
		SBDB:         ephem.NewSBDB(),
		SmallBodies:  *smallBodies,
		NeoWs:        ephem.NewNeoWs(),
		NasaKey:      os.Getenv("NASA_API_KEY"),
		Now:          time.Now(),
	})
	if err != nil {
		log.Fatalf("snapshot failed: %v", err)
	}
	log.Printf("snapshot written to %s and %s", *out, *elementsPath)
}
