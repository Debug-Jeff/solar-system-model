package diskcache

import (
	"errors"
	"os"
	"path/filepath"
)

var ErrInvalidKey = errors.New("diskcache: key escapes cache root")

type Cache struct {
	Root string
}

func New(root string) *Cache {
	os.MkdirAll(root, 0o755)
	return &Cache{Root: root}
}

func (c *Cache) path(key string) (string, error) {
	rel := filepath.FromSlash(key)
	if !filepath.IsLocal(rel) {
		return "", ErrInvalidKey
	}
	return filepath.Join(c.Root, rel), nil
}

func (c *Cache) Get(key string) ([]byte, bool) {
	p, err := c.path(key)
	if err != nil {
		return nil, false
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return nil, false
	}
	return data, true
}

func (c *Cache) Put(key string, data []byte) error {
	p, err := c.path(key)
	if err != nil {
		return err
	}
	dir := filepath.Dir(p)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Chmod(tmpName, 0o644); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, p); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}
