/**
 * quantum-sim.js — Client-side statevector simulator
 * Supports: H, X, Y, Z, S, T, Rx, Ry, Rz, CX, CCX
 * Max 4 qubits (16 amplitudes). All math in Float64.
 *
 * Usage:
 *   const result = QSim.simulate(qubitCount, program);
 *   // result = { qubit_count, statevector:[{re,im}], probabilities:[], phases:[] }
 */

var QSim = (function () {
  "use strict";

  // ── complex helpers ────────────────────────────────────────────
  function cmul(ar, ai, br, bi) { return [ar * br - ai * bi, ar * bi + ai * br]; }

  // ── gate matrices (row-major 2×2) ──────────────────────────────
  const S2 = Math.SQRT1_2; // 1/√2

  const GATES = {
    h:  [[S2, 0, S2, 0],  [S2, 0, -S2, 0]],       // [[S2,S2],[S2,-S2]]
    x:  [[0, 0, 1, 0],    [1, 0, 0, 0]],           // [[0,1],[1,0]]
    y:  [[0, 0, 0, -1],   [0, 1, 0, 0]],           // [[0,-i],[i,0]]
    z:  [[1, 0, 0, 0],    [0, 0, -1, 0]],          // [[1,0],[0,-1]]
    s:  [[1, 0, 0, 0],    [0, 0, 0, 1]],           // [[1,0],[0,i]]
    t:  [[1, 0, 0, 0],    [0, 0, S2, S2]],         // [[1,0],[0,e^(iπ/4)]]
  };

  // Rotation matrices built on the fly
  function rxMatrix(theta) {
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
    // [[cos,-i·sin],[-i·sin,cos]]
    return [[c, 0, 0, -s], [0, -s, c, 0]];
  }
  function ryMatrix(theta) {
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
    // [[cos,-sin],[sin,cos]]
    return [[c, 0, -s, 0], [s, 0, c, 0]];
  }
  function rzMatrix(theta) {
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
    // [[e^{-iθ/2},0],[0,e^{iθ/2}]]
    return [[c, -s, 0, 0], [0, 0, c, s]];
  }

  // ── apply single-qubit gate ────────────────────────────────────
  // mat = [[r00,i00,r01,i01],[r10,i10,r11,i11]]
  function applySingle(state, n, target, mat) {
    const dim = 1 << n;
    const step = 1 << target;
    for (let i = 0; i < dim; i++) {
      if (i & step) continue; // process pairs once
      const j = i | step;
      const ar = state[2 * i], ai = state[2 * i + 1];
      const br = state[2 * j], bi = state[2 * j + 1];

      const [nr0, ni0] = cmul(mat[0][0], mat[0][1], ar, ai);
      const [nr1, ni1] = cmul(mat[0][2], mat[0][3], br, bi);
      const [nr2, ni2] = cmul(mat[1][0], mat[1][1], ar, ai);
      const [nr3, ni3] = cmul(mat[1][2], mat[1][3], br, bi);

      state[2 * i]     = nr0 + nr1;
      state[2 * i + 1] = ni0 + ni1;
      state[2 * j]     = nr2 + nr3;
      state[2 * j + 1] = ni2 + ni3;
    }
  }

  // ── controlled-NOT (CX) ────────────────────────────────────────
  function applyCX(state, n, control, target) {
    const dim = 1 << n;
    const cBit = 1 << control;
    const tBit = 1 << target;
    for (let i = 0; i < dim; i++) {
      if (!(i & cBit)) continue;   // control must be 1
      if (i & tBit) continue;      // process pairs once (target=0)
      const j = i | tBit;
      // swap amplitudes at i and j
      const tr = state[2 * i], ti = state[2 * i + 1];
      state[2 * i]     = state[2 * j];
      state[2 * i + 1] = state[2 * j + 1];
      state[2 * j]     = tr;
      state[2 * j + 1] = ti;
    }
  }

  // ── Toffoli (CCX) ─────────────────────────────────────────────
  function applyCCX(state, n, c1, c2, target) {
    const dim = 1 << n;
    const c1Bit = 1 << c1;
    const c2Bit = 1 << c2;
    const tBit  = 1 << target;
    for (let i = 0; i < dim; i++) {
      if (!(i & c1Bit) || !(i & c2Bit)) continue;
      if (i & tBit) continue;
      const j = i | tBit;
      const tr = state[2 * i], ti = state[2 * i + 1];
      state[2 * i]     = state[2 * j];
      state[2 * i + 1] = state[2 * j + 1];
      state[2 * j]     = tr;
      state[2 * j + 1] = ti;
    }
  }

  // ── main simulate ─────────────────────────────────────────────
  function simulate(qubitCount, program) {
    if (qubitCount < 1 || qubitCount > 4) throw new Error("qubit_count must be 1–4");

    const dim = 1 << qubitCount;
    // state: interleaved [re0, im0, re1, im1, …]
    const state = new Float64Array(dim * 2);
    state[0] = 1; // |00…0⟩

    for (const op of program) {
      const g = op.gate.toLowerCase();

      if (g in GATES) {
        applySingle(state, qubitCount, op.target, GATES[g]);
      } else if (g === "rx") {
        applySingle(state, qubitCount, op.target, rxMatrix(op.angle));
      } else if (g === "ry") {
        applySingle(state, qubitCount, op.target, ryMatrix(op.angle));
      } else if (g === "rz") {
        applySingle(state, qubitCount, op.target, rzMatrix(op.angle));
      } else if (g === "cx") {
        applyCX(state, qubitCount, op.control, op.target);
      } else if (g === "ccx") {
        applyCCX(state, qubitCount, op.control1, op.control2, op.target);
      } else {
        throw new Error("Unsupported gate: " + g);
      }
    }

    // extract results
    const statevector = [];
    const probabilities = [];
    const phases = [];
    for (let i = 0; i < dim; i++) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      const prob = re * re + im * im;
      const phase = Math.atan2(im, re);
      statevector.push({ re: round8(re), im: round8(im) });
      probabilities.push(round8(prob));
      phases.push(round8(phase));
    }

    return { qubit_count: qubitCount, statevector, probabilities, phases };
  }

  function round8(v) { return Math.round(v * 1e8) / 1e8; }

  // public API
  return { simulate };
})();
