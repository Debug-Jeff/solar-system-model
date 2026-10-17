package celestrak

import (
	"slices"
)

type Sat struct {
	ID    string
	NORAD int
	Group string
}

var Registry = []Sat{
	{"iss", 25544, "stations"},
	{"tiangong", 48274, "stations"},
	{"hubble", 20580, "science"},
	{"chandra", 25867, "science"},
	{"swift", 28485, "science"},
	{"fermi", 33053, "science"},
	{"landsat-8", 39084, "resource"},
	{"landsat-9", 49260, "resource"},
	{"terra", 25994, "resource"},
	{"aqua", 27424, "resource"},
	{"aura", 28376, "resource"},
	{"sentinel-2a", 40697, "resource"},
	{"sentinel-2b", 42063, "resource"},
	{"sentinel-6a", 46984, "resource"},
	{"icesat-2", 43613, "resource"},
	{"swot", 54754, "resource"},
	{"suomi-npp", 37849, "weather"},
	{"noaa-20", 43013, "weather"},
	{"noaa-21", 54234, "weather"},
	{"goes-16", 41866, "weather"},
	{"goes-18", 51850, "weather"},
	{"goes-19", 60133, "weather"},
	{"himawari-9", 41836, "weather"},
	{"gps-biii-1", 43873, "gps-ops"},
	{"gps-biii-6", 55268, "gps-ops"},
	{"galileo-27", 49809, "galileo"},
	{"galileo-28", 49810, "galileo"},
	{"iridium-106", 41917, "iridium-NEXT"},
	{"tdrs-13", 42915, "tdrss"},
}

func Groups() []string {
	out := make([]string, 0, len(Registry))
	for _, s := range Registry {
		out = append(out, s.Group)
	}
	slices.Sort(out)
	return slices.Compact(out)
}
