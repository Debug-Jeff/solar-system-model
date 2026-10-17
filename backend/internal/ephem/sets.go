package ephem

type BodySpec struct {
	ID          string
	Command     string
	Center      string
	CenterName  string
	PeriodDays  float64
	Kind        string
	StepMinutes int
	WindowDays  int
}

func moon(id, command, center, centerName string, periodDays float64) BodySpec {
	return BodySpec{ID: id, Command: command, Center: center, CenterName: centerName, PeriodDays: periodDays, Kind: "moon"}
}

func craft(id, command, center, centerName string, stepMinutes, windowDays int) BodySpec {
	return BodySpec{ID: id, Command: command, Center: center, CenterName: centerName, Kind: "spacecraft", StepMinutes: stepMinutes, WindowDays: windowDays}
}

var Sets = map[string][]BodySpec{
	"moons-earth": {
		moon("moon", "301", "500@399", "earth", 27.321661),
		craft("jwst", "-170", "500@399", "earth", 1440, 30),
	},
	"moons-mars": {
		moon("phobos", "401", "500@499", "mars", 0.31891),
		moon("deimos", "402", "500@499", "mars", 1.26244),
		craft("mro", "-74", "500@499", "mars", 10, 10),
	},
	"moons-jupiter": {
		moon("io", "501", "500@599", "jupiter", 1.769138),
		moon("europa", "502", "500@599", "jupiter", 3.551181),
		moon("ganymede", "503", "500@599", "jupiter", 7.154553),
		moon("callisto", "504", "500@599", "jupiter", 16.689017),
		craft("juno-probe", "-61", "500@599", "jupiter", 10, 10),
	},
	"moons-saturn": {
		moon("mimas", "601", "500@699", "saturn", 0.942422),
		moon("enceladus", "602", "500@699", "saturn", 1.370218),
		moon("tethys", "603", "500@699", "saturn", 1.887802),
		moon("dione", "604", "500@699", "saturn", 2.736915),
		moon("rhea", "605", "500@699", "saturn", 4.5175),
		moon("titan", "606", "500@699", "saturn", 15.945421),
		moon("iapetus", "608", "500@699", "saturn", 79.3215),
	},
	"moons-uranus": {
		moon("ariel", "701", "500@799", "uranus", 2.520379),
		moon("umbriel", "702", "500@799", "uranus", 4.144177),
		moon("titania", "703", "500@799", "uranus", 8.705872),
		moon("oberon", "704", "500@799", "uranus", 13.463239),
		moon("miranda", "705", "500@799", "uranus", 1.413479),
	},
	"moons-neptune": {
		moon("triton", "801", "500@899", "neptune", 5.876854),
	},
	"moons-pluto": {
		moon("charon", "901", "500@999", "pluto", 6.387221),
	},
	"spacecraft": {
		craft("parker", "-96", "500@10", "sun", 60, 30),
		craft("europa-clipper", "-159", "500@10", "sun", 1440, 30),
		craft("lucy", "-49", "500@10", "sun", 1440, 30),
		craft("psyche-probe", "-255", "500@10", "sun", 1440, 30),
		craft("voyager-1", "-31", "500@10", "sun", 1440, 30),
		craft("voyager-2", "-32", "500@10", "sun", 1440, 30),
		craft("new-horizons", "-98", "500@10", "sun", 1440, 30),
		craft("osiris-apex", "-64", "500@10", "sun", 1440, 30),
		craft("solar-orbiter", "-144", "500@10", "sun", 1440, 30),
		craft("bepicolombo", "-121", "500@10", "sun", 1440, 30),
		craft("juice", "-28", "500@10", "sun", 1440, 30),
		craft("hera", "-91", "500@10", "sun", 1440, 30),
	},
}
