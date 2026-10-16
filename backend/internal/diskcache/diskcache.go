package diskcache

import (
	"os"
	"path/filepath"
)

type Cache struct {
	Root string
}

func New(root string) *Cache {
	os.MkdirAll(root, 0o755)
	return &Cache{Root: root}
}

func (c *Cache) path(key string) string {
	return filepath.Join(c.Root, filepath.FromSlash(key))
}

func (c *Cache) Get(key string) ([]byte, bool) {
	data, err := os.ReadFile(c.path(key))
	if err != nil {
		return nil, false
	}
	return data, true
}

func (c *Cache) Put(key string, data []byte) error {
	p := c.path(key)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}
