package diskcache

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestPutGetRoundTrip(t *testing.T) {
	c := New(t.TempDir())
	if err := c.Put("a/b/c.json", []byte("hello")); err != nil {
		t.Fatal(err)
	}
	got, ok := c.Get("a/b/c.json")
	if !ok || string(got) != "hello" {
		t.Fatalf("got %q %v", got, ok)
	}
	if err := c.Put("a/b/c.json", []byte("again")); err != nil {
		t.Fatal(err)
	}
	if got, _ := c.Get("a/b/c.json"); string(got) != "again" {
		t.Fatalf("overwrite failed: %q", got)
	}
}

func TestRejectsKeysOutsideRoot(t *testing.T) {
	parent := t.TempDir()
	root := filepath.Join(parent, "cache")
	c := New(root)
	os.WriteFile(filepath.Join(parent, "secret.jpg"), []byte("secret"), 0o644)

	for _, key := range []string{"../secret.jpg", "a/../../secret.jpg", "/etc/passwd", ""} {
		if _, ok := c.Get(key); ok {
			t.Errorf("Get(%q) escaped the cache root", key)
		}
		if err := c.Put(key, []byte("x")); !errors.Is(err, ErrInvalidKey) {
			t.Errorf("Put(%q) = %v, want ErrInvalidKey", key, err)
		}
	}
}

func TestPutLeavesNoTempFiles(t *testing.T) {
	root := t.TempDir()
	c := New(root)
	c.Put("k.bin", []byte("data"))
	entries, _ := os.ReadDir(root)
	if len(entries) != 1 || entries[0].Name() != "k.bin" {
		t.Fatalf("unexpected files: %v", entries)
	}
}
