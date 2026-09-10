// Orbits are drawn as true Keplerian ellipses with the Sun (or parent
// planet) at a focus, using each body's real eccentricity from
// planets.json — not just circles. The polar equation of an ellipse
// with the focus at the origin gives the orbital radius directly from
// the true anomaly (theta), so no separate offset/centering is needed:
//
//   r(theta) = a(1 - e^2) / (1 + e*cos(theta))
export function ellipticalPosition(theta, semiMajorAxis, eccentricity) {
  const r =
    (semiMajorAxis * (1 - eccentricity * eccentricity)) /
    (1 + eccentricity * Math.cos(theta))
  return { x: r * Math.cos(theta), z: r * Math.sin(theta) }
}

// Converts mean anomaly (which, unlike true anomaly, DOES advance at a
// constant rate — that's its definition) into eccentric anomaly by
// solving Kepler's equation M = E - e*sin(E) with Newton-Raphson. The
// seed E0 = M + e*sin(M) converges in only a handful of iterations even
// at comet-grade eccentricity (Halley: e = 0.967).
function eccentricAnomaly(meanAnomaly, eccentricity) {
  const m = ((meanAnomaly % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  let e = m + eccentricity * Math.sin(m)
  for (let i = 0; i < 8; i++) {
    const delta = (e - eccentricity * Math.sin(e) - m) / (1 - eccentricity * Math.cos(e))
    e -= delta
    if (Math.abs(delta) < 1e-9) break
  }
  return e
}

// Real orbital speed isn't constant — Kepler's second law means a body
// crawls near aphelion and whips through perihelion. This matters little
// for the near-circular planets (max eccentricity 0.21) but is the whole
// visual signature of a comet (Halley spends decades near 35 AU out and
// weeks tearing past the Sun at 0.6 AU). meanAnomaly advances linearly
// with time; this converts that into an actual position on the ellipse.
export function keplerianPosition(meanAnomaly, semiMajorAxis, eccentricity) {
  const E = eccentricAnomaly(meanAnomaly, eccentricity)
  const theta = 2 * Math.atan2(
    Math.sqrt(1 + eccentricity) * Math.sin(E / 2),
    Math.sqrt(1 - eccentricity) * Math.cos(E / 2)
  )
  const r = semiMajorAxis * (1 - eccentricity * Math.cos(E))
  return { x: r * Math.cos(theta), z: r * Math.sin(theta) }
}

// Builds the point ring used to draw a static orbit-path line.
export function ellipsePoints(semiMajorAxis, eccentricity, segments = 256) {
  const points = []
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    const { x, z } = ellipticalPosition(theta, semiMajorAxis, eccentricity)
    points.push(x, 0, z)
  }
  return points
}
