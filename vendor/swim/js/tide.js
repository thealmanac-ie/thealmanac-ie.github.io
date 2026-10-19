// Harmonic tide prediction (no network). Shared by the page and by tools/fit_tides.mjs,
// so the constants are fitted and used with exactly the same astronomy.
//
// Model: h(t) = Z0 + sum_k f_k(t) * H_k * cos(V_k(t) + u_k(t) - g_k)
//   V_k  = Doodson argument from mean lunar time and the mean longitudes (Meeus/Schureman),
//   f, u = nodal corrections (standard Schureman-derived approximations, as tabulated in
//          e.g. Pugh, "Tides, Surges and Mean Sea-Level", 1987, Table 4.3),
//   H, g = amplitude/phase fitted to Marine Institute predictions for Roonagh (see README).

const D2R = Math.PI / 180;

// name: [tau, s, h, p, N', p1, quarter-turn phase offset, nodal group]
// Doodson numbers from the standard tables (e.g. Pugh 1987, Table 4.1 / IHO constituent list).
export const CONSTITUENTS = {
  SA: [0, 0, 1, 0, 0, -1, 0, 'one'],
  SSA: [0, 0, 2, 0, 0, 0, 0, 'one'],
  MM: [0, 1, 0, -1, 0, 0, 0, 'Mm'],
  MSF: [0, 2, -2, 0, 0, 0, 0, 'MSf'],
  MF: [0, 2, 0, 0, 0, 0, 0, 'Mf'],
  '2Q1': [1, -3, 0, 2, 0, 0, -1, 'O1'],
  SIG1: [1, -3, 2, 0, 0, 0, -1, 'O1'],
  Q1: [1, -2, 0, 1, 0, 0, -1, 'O1'],
  RHO1: [1, -2, 2, -1, 0, 0, -1, 'O1'],
  O1: [1, -1, 0, 0, 0, 0, -1, 'O1'],
  PI1: [1, 1, -3, 0, 0, 1, -1, 'one'],
  P1: [1, 1, -2, 0, 0, 0, -1, 'one'],
  S1: [1, 1, -1, 0, 0, 0, 2, 'one'],
  K1: [1, 1, 0, 0, 0, 0, 1, 'K1'],
  PSI1: [1, 1, 1, 0, 0, -1, 1, 'one'],
  PHI1: [1, 1, 2, 0, 0, 0, 1, 'one'],
  THE1: [1, 2, -2, 1, 0, 0, 1, 'J1'],
  J1: [1, 2, 0, -1, 0, 0, 1, 'J1'],
  SO1: [1, 3, -2, 0, 0, 0, 1, 'J1'],
  OO1: [1, 3, 0, 0, 0, 0, 1, 'OO1'],
  OQ2: [2, -3, 0, 1, 0, 0, 0, 'O1^2'],
  EPS2: [2, -3, 2, 1, 0, 0, 0, 'M2'],
  '2N2': [2, -2, 0, 2, 0, 0, 0, 'M2'],
  MU2: [2, -2, 2, 0, 0, 0, 0, 'M2'],
  N2: [2, -1, 0, 1, 0, 0, 0, 'M2'],
  NU2: [2, -1, 2, -1, 0, 0, 0, 'M2'],
  M2: [2, 0, 0, 0, 0, 0, 0, 'M2'],
  MKS2: [2, 0, 2, 0, 0, 0, 0, 'M2K2'],
  LAM2: [2, 1, -2, 1, 0, 0, 2, 'M2'],
  L2: [2, 1, 0, -1, 0, 0, 2, 'L2'],
  T2: [2, 2, -3, 0, 0, 1, 0, 'one'],
  S2: [2, 2, -2, 0, 0, 0, 0, 'one'],
  R2: [2, 2, -1, 0, 0, -1, 2, 'one'],
  K2: [2, 2, 0, 0, 0, 0, 0, 'K2'],
  MSN2: [2, 3, -2, -1, 0, 0, 0, 'M2^2u0'],
  ETA2: [2, 3, 0, -1, 0, 0, 0, 'K2'],
  '2SM2': [2, 4, -4, 0, 0, 0, 0, 'M2inv'],
  MO3: [3, -1, 0, 0, 0, 0, -1, 'M2O1'],
  M3: [3, 0, 0, 0, 0, 0, 2, 'M3'],
  SO3: [3, 1, -2, 0, 0, 0, -1, 'O1'],
  MK3: [3, 1, 0, 0, 0, 0, 1, 'M2K1'],
  SK3: [3, 3, -2, 0, 0, 0, 1, 'K1'],
  MN4: [4, -1, 0, 1, 0, 0, 0, 'M2^2'],
  M4: [4, 0, 0, 0, 0, 0, 0, 'M2^2'],
  SN4: [4, 1, -2, 1, 0, 0, 0, 'M2'],
  MS4: [4, 2, -2, 0, 0, 0, 0, 'M2'],
  MK4: [4, 2, 0, 0, 0, 0, 0, 'M2K2'],
  S4: [4, 4, -4, 0, 0, 0, 0, 'one'],
  SK4: [4, 4, -2, 0, 0, 0, 0, 'K2'],
  '2MN6': [6, -1, 0, 1, 0, 0, 0, 'M2^3'],
  M6: [6, 0, 0, 0, 0, 0, 0, 'M2^3'],
  MSN6: [6, 1, -2, 1, 0, 0, 0, 'M2^2'],
  '2MS6': [6, 2, -2, 0, 0, 0, 0, 'M2^2'],
  '2MK6': [6, 2, 0, 0, 0, 0, 0, 'M2^2K2'],
  '2SM6': [6, 4, -4, 0, 0, 0, 0, 'M2'],
  MSK6: [6, 4, -2, 0, 0, 0, 0, 'M2K2'],
  M8: [8, 0, 0, 0, 0, 0, 0, 'M2^4'],
};

// Astronomical arguments in degrees at time tMs (UTC milliseconds).
export function astro(tMs) {
  const T = (tMs / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const s = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;
  const h = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const p = 83.3532465 + 4069.0137287 * T - 0.01032 * T * T;
  const N = 125.04452 - 1934.136261 * T + 0.0020708 * T * T;
  const p1 = 282.93768 + 1.7194577 * T + 0.0004569 * T * T;
  const ut = (((tMs / 3600000) % 24) + 24) % 24;
  const tau = 15 * ut + h - s - 180; // mean lunar time (Greenwich convention)
  return { tau, s, h, p, N, p1 };
}

// Nodal factor f and phase u (degrees) for each nodal group, from N (and p for L2/M1).
export function nodal(a) {
  const N = a.N * D2R, c = Math.cos, sn = Math.sin;
  const fM2 = 1.0004 - 0.0373 * c(N) + 0.0002 * c(2 * N), uM2 = -2.14 * sn(N);
  const fO1 = 1.0089 + 0.1871 * c(N) - 0.0147 * c(2 * N) + 0.0014 * c(3 * N), uO1 = 10.8 * sn(N) - 1.34 * sn(2 * N) + 0.19 * sn(3 * N);
  const fK1 = 1.006 + 0.115 * c(N) - 0.0088 * c(2 * N) + 0.0006 * c(3 * N), uK1 = -8.86 * sn(N) + 0.68 * sn(2 * N) - 0.07 * sn(3 * N);
  const fK2 = 1.0246 + 0.2863 * c(N) + 0.0083 * c(2 * N) - 0.0015 * c(3 * N), uK2 = -17.74 * sn(N) + 0.68 * sn(2 * N) - 0.04 * sn(3 * N);
  const fJ1 = 1.1029 + 0.1676 * c(N) - 0.017 * c(2 * N) + 0.0016 * c(3 * N), uJ1 = -12.94 * sn(N) + 1.34 * sn(2 * N) - 0.19 * sn(3 * N);
  const fOO1 = 1.1027 + 0.6504 * c(N) + 0.0317 * c(2 * N) - 0.0014 * c(3 * N), uOO1 = -36.68 * sn(N) + 4.02 * sn(2 * N) - 0.57 * sn(3 * N);
  const fMm = 1.0 - 0.13 * c(N) + 0.0013 * c(2 * N);
  const fMf = 1.0429 + 0.4135 * c(N) - 0.004 * c(2 * N), uMf = -23.74 * sn(N) + 2.68 * sn(2 * N) - 0.38 * sn(3 * N);
  // L2 (Schureman 1958, eqs. 213-215): depends on the lunar perigee p as well as N.
  const A = 2 * Math.atan(1.01883 * Math.tan(N / 2)), B = 2 * Math.atan(0.64412 * Math.tan(N / 2));
  const xi = N - (A + B) / 2;                      // radians
  const cosI = 0.9137 - 0.03569 * c(N), t2 = (1 - cosI) / (1 + cosI); // tan^2(I/2)
  const P = a.p * D2R - xi;
  const invRa = Math.sqrt(Math.max(0, 1 - 12 * t2 * c(2 * P) + 36 * t2 * t2));
  const R = Math.atan2(sn(2 * P), 1 / (6 * t2) - c(2 * P)) / D2R;
  const fL2 = fM2 * invRa, uL2 = uM2 - R;
  return {
    one: [1, 0], M2: [fM2, uM2], O1: [fO1, uO1], K1: [fK1, uK1], K2: [fK2, uK2], J1: [fJ1, uJ1], OO1: [fOO1, uOO1],
    Mm: [fMm, 0], Mf: [fMf, uMf], MSf: [fM2, -uM2], L2: [fL2, uL2],
    'M2^2': [fM2 * fM2, 2 * uM2], 'M2^2u0': [fM2 * fM2, 0], 'M2^3': [fM2 ** 3, 3 * uM2], 'M2^4': [fM2 ** 4, 4 * uM2], M3: [fM2 ** 1.5, 1.5 * uM2],
    M2inv: [fM2, -uM2], M2K2: [fM2 * fK2, uM2 + uK2], 'M2^2K2': [fM2 * fM2 * fK2, 2 * uM2 + uK2],
    M2O1: [fM2 * fO1, uM2 + uO1], M2K1: [fM2 * fK1, uM2 + uK1], 'O1^2': [fO1 * fO1, 2 * uO1],
  };
}

// Equilibrium argument V (degrees) of a constituent at astro args a.
export function argV(c, a) {
  return c[0] * a.tau + c[1] * a.s + c[2] * a.h + c[3] * a.p - c[4] * a.N + c[5] * a.p1 + 90 * c[6];
}

// Build a predictor from fitted constants {Z0, cons: [[name, H, g], ...]}.
// The astronomy changes slowly, so f/u are cached per UTC hour.
export function makePredictor(model) {
  const cons = model.cons.map(([name, H, g]) => ({ c: CONSTITUENTS[name], H, g: g * D2R }));
  let cacheHour = NaN, cache = null;
  function terms(tMs) {
    const hour = Math.floor(tMs / 3600000);
    if (hour !== cacheHour) {
      const a0 = astro(hour * 3600000), nod = nodal(a0);
      cache = cons.map((k) => {
        const [f, u] = nod[k.c[7]];
        // phase at the start of the hour and the constituent speed (deg/hour)
        const V0 = argV(k.c, a0);
        return { fH: f * k.H, ph: (V0 + u) * D2R - k.g, w: speedOf(k.c) * D2R };
      });
      cacheHour = hour;
    }
    return cache;
  }
  return function predict(tMs) {
    const dt = (tMs - Math.floor(tMs / 3600000) * 3600000) / 3600000;
    let hgt = model.Z0;
    for (const k of terms(tMs)) hgt += k.fH * Math.cos(k.ph + k.w * dt);
    return hgt;
  };
}

// Constituent speed in degrees per hour from its Doodson numbers.
const RATES = { tau: 14.4920521, s: 0.5490165, h: 0.0410686, p: 0.0046418, N: 0.0022064, p1: 0.0000020 };
export function speedOf(c) {
  return c[0] * RATES.tau + c[1] * RATES.s + c[2] * RATES.h + c[3] * RATES.p + c[4] * RATES.N + c[5] * RATES.p1;
}

// High and low waters between t0 and t1 (ms), found on a 6-minute grid and refined
// with a parabola through the three samples around each turning point.
export function extremes(predict, t0, t1, stepMin = 6) {
  const step = stepMin * 60000, out = [];
  let a = predict(t0 - step), b = predict(t0);
  for (let t = t0; t <= t1; t += step) {
    const c = predict(t + step);
    if ((b > a && b >= c) || (b < a && b <= c)) {
      const den = a - 2 * b + c;
      const x = den !== 0 ? 0.5 * (a - c) / den : 0;
      const tt = t + x * step;
      out.push({ t: tt, h: predict(tt), high: b > a });
    }
    a = b; b = c;
  }
  return out;
}
