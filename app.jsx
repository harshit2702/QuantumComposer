/* Quantum Composer – React Frontend (Redesigned) */

const { useState, useCallback, useEffect, useRef } = React;

// ── Constants ──────────────────────────────────────────────────────
const MAX_QUBITS = 4;
const MAX_STEPS  = 10;

const SINGLE_GATES   = ["H", "X", "Y", "Z", "S", "T"];
const ROTATION_GATES = ["Rx", "Ry", "Rz"];
const MULTI_GATES    = ["CX", "CCX"];
const ALL_GATES      = [...SINGLE_GATES, ...ROTATION_GATES, ...MULTI_GATES];

const USE_SERVER_FALLBACK = false;

const API_URL = "/simulate";
const STORAGE_KEY = "qc_saved_circuits";
const DEBOUNCE_MS = 800;

// ── Phase helpers ──────────────────────────────────────────────────

function phaseToPi(rad) {
  if (Math.abs(rad) < 1e-6) return "0";
  const ratio = rad / Math.PI;
  if (Math.abs(ratio - 1) < 1e-4) return "π";
  if (Math.abs(ratio + 1) < 1e-4) return "−π";
  if (Math.abs(ratio - 0.5) < 1e-4) return "π/2";
  if (Math.abs(ratio + 0.5) < 1e-4) return "−π/2";
  if (Math.abs(ratio - 0.25) < 1e-4) return "π/4";
  if (Math.abs(ratio + 0.25) < 1e-4) return "−π/4";
  if (Math.abs(ratio - 0.75) < 1e-4) return "3π/4";
  if (Math.abs(ratio + 0.75) < 1e-4) return "−3π/4";
  return (ratio >= 0 ? "" : "−") + Math.abs(ratio).toFixed(3) + "π";
}

function phaseToColor(rad) {
  let norm = ((rad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let hue;
  if (norm <= Math.PI / 2) {
    hue = 220 + (norm / (Math.PI / 2)) * 60;
  } else if (norm <= Math.PI) {
    hue = 280 + ((norm - Math.PI / 2) / (Math.PI / 2)) * 80;
  } else if (norm <= 3 * Math.PI / 2) {
    hue = 0 + ((norm - Math.PI) / (Math.PI / 2)) * 50;
  } else {
    hue = 50 + ((norm - 3 * Math.PI / 2) / (Math.PI / 2)) * 170;
  }
  return `hsl(${hue % 360}, 75%, 55%)`;
}

// ── Grid helpers ───────────────────────────────────────────────────
function emptyGrid(nQubits) {
  return Array.from({ length: nQubits }, () => Array(MAX_STEPS).fill(null));
}

function buildProgram(grid) {
  const program = [];
  const seen = new Set();
  for (let col = 0; col < MAX_STEPS; col++) {
    for (let row = 0; row < grid.length; row++) {
      const cell = grid[row][col];
      if (!cell) continue;
      const g = cell.gate.toLowerCase();
      if (g === "cx") {
        const key = `cx-${col}-${cell.control}-${cell.target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        program.push({ gate: g, control: cell.control, target: cell.target });
      } else if (g === "ccx") {
        const key = `ccx-${col}-${cell.control1}-${cell.control2}-${cell.target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        program.push({ gate: g, control1: cell.control1, control2: cell.control2, target: cell.target });
      } else if (["rx", "ry", "rz"].includes(g)) {
        program.push({ gate: g, target: row, angle: cell.angle });
      } else {
        program.push({ gate: g, target: row });
      }
    }
  }
  return program;
}

function gridHasGates(grid) {
  return grid.some(row => row.some(c => c !== null));
}

// ── LocalStorage ───────────────────────────────────────────────────
function loadSaved() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
function persistSaved(list) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

// ── Angle Modal ────────────────────────────────────────────────────
function AngleModal({ gate, onConfirm, onCancel }) {
  const [angle, setAngle] = useState("1.5708");
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Set angle for {gate}</h3>
        <p>θ (radians)</p>
        <input type="number" step="0.01" value={angle} onChange={e => setAngle(e.target.value)} autoFocus />
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={() => onConfirm(parseFloat(angle))}>Place</button>
        </div>
      </div>
    </div>
  );
}

// ── Multi-qubit Gate Modal ─────────────────────────────────────────
function MultiGateModal({ gate, qubitCount, onConfirm, onCancel }) {
  const isCCX = gate.toLowerCase() === "ccx";
  const [target, setTarget]     = useState(0);
  const [control, setControl]   = useState(1);
  const [control1, setControl1] = useState(0);
  const [control2, setControl2] = useState(1);
  const [tgt, setTgt]           = useState(2);
  const qubits = Array.from({ length: qubitCount }, (_, i) => i);

  if (isCCX) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h3>Place CCX (Toffoli)</h3>
          <label>Control 1: <select value={control1} onChange={e => setControl1(+e.target.value)}>{qubits.map(q => <option key={q} value={q}>q{q}</option>)}</select></label>
          <label>Control 2: <select value={control2} onChange={e => setControl2(+e.target.value)}>{qubits.map(q => <option key={q} value={q}>q{q}</option>)}</select></label>
          <label>Target: <select value={tgt} onChange={e => setTgt(+e.target.value)}>{qubits.map(q => <option key={q} value={q}>q{q}</option>)}</select></label>
          {(new Set([control1, control2, tgt]).size !== 3) && <p className="error-hint">All three must be distinct qubits.</p>}
          <div className="modal-actions">
            <button onClick={onCancel}>Cancel</button>
            <button className="primary" disabled={new Set([control1, control2, tgt]).size !== 3} onClick={() => onConfirm({ control1, control2, target: tgt })}>Place</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Place CX (CNOT)</h3>
        <label>Control: <select value={control} onChange={e => setControl(+e.target.value)}>{qubits.map(q => <option key={q} value={q}>q{q}</option>)}</select></label>
        <label>Target: <select value={target} onChange={e => setTarget(+e.target.value)}>{qubits.map(q => <option key={q} value={q}>q{q}</option>)}</select></label>
        {control === target && <p className="error-hint">Control and target must be different.</p>}
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={control === target} onClick={() => onConfirm({ control, target })}>Place</button>
        </div>
      </div>
    </div>
  );
}

// ── Save Modal ─────────────────────────────────────────────────────
function SaveModal({ onSave, onCancel }) {
  const [name, setName] = useState("");
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Save Circuit</h3>
        <p>Give this circuit a name</p>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="My Bell State" />
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Phase Legend ────────────────────────────────────────────────────
function PhaseLegend() {
  const stops = [
    { label: "0", color: phaseToColor(0) },
    { label: "π/2", color: phaseToColor(Math.PI / 2) },
    { label: "π", color: phaseToColor(Math.PI) },
    { label: "3π/2", color: phaseToColor(3 * Math.PI / 2) },
  ];
  return (
    <div className="phase-legend">
      <span className="phase-legend-label">Phase →</span>
      {stops.map((s, i) => (
        <span key={i} className="phase-swatch">
          <span className="swatch" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// ── Results Panel ──────────────────────────────────────────────────
function Results({ data }) {
  if (!data) return null;
  const n = data.qubit_count;
  const labels = data.probabilities.map((_, i) => "|" + i.toString(2).padStart(n, "0") + "⟩");
  const maxProb = Math.max(...data.probabilities, 0.001);

  return (
    <div className="results">
      <h2>Simulation Results</h2>
      <h3>Probabilities</h3>
      <PhaseLegend />
      <div className="bar-chart">
        {data.probabilities.map((p, i) => (
          <div className="bar-group" key={i}>
            <div className="bar" style={{ height: `${(p / maxProb) * 160}px`, background: p > 1e-8 ? phaseToColor(data.phases[i]) : "var(--border)" }}>
              <span className="bar-val">{(p * 100).toFixed(1)}%</span>
            </div>
            <span className="bar-label">{labels[i]}</span>
          </div>
        ))}
      </div>

      <h3>Phases &amp; Amplitudes</h3>
      <div className="phase-table">
        <table>
          <thead><tr><th>State</th><th>Phase (rad)</th><th>Phase (π)</th><th>Amplitude</th></tr></thead>
          <tbody>
            {data.statevector.map((sv, i) => (
              <tr key={i}>
                <td>{labels[i]}</td>
                <td>{data.phases[i].toFixed(4)}</td>
                <td className="phase-pi">
                  <span className="swatch-inline" style={{ background: phaseToColor(data.phases[i]) }} />
                  {phaseToPi(data.phases[i])}
                </td>
                <td>{sv.re.toFixed(4)} {sv.im >= 0 ? "+" : "−"} {Math.abs(sv.im).toFixed(4)}i</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Typewriter Effect ──────────────────────────────────────────────
const TYPEWRITER_WORDS = ["Superposition", "Entanglement", "Interference", "Simulation"];
function useTypewriter(words, typeSpeed = 100, deleteSpeed = 60, pauseMs = 1800) {
  const [text, setText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = words[wordIndex];
    let timer;
    if (!isDeleting && text === current) {
      timer = setTimeout(() => setIsDeleting(true), pauseMs);
    } else if (isDeleting && text === "") {
      setIsDeleting(false);
      setWordIndex((wordIndex + 1) % words.length);
    } else {
      timer = setTimeout(() => {
        setText(current.substring(0, text.length + (isDeleting ? -1 : 1)));
      }, isDeleting ? deleteSpeed : typeSpeed);
    }
    return () => clearTimeout(timer);
  }, [text, isDeleting, wordIndex, words, typeSpeed, deleteSpeed, pauseMs]);

  return text;
}

// ── Hero Section ───────────────────────────────────────────────────
function HeroSection({ onGetStarted }) {
  const typed = useTypewriter(TYPEWRITER_WORDS);
  return (
    <section className="hero" id="hero">
      <div className="hero-bg" />
      <div className="hero-content">
        <p className="hero-intro">Open-Source Quantum Computing</p>
        <h1 className="hero-headline">
          Explore<br />
          <span className="hero-accent">{typed}<span className="typewriter-cursor" /></span>
        </h1>
        <p className="hero-sub">
          Build, visualize, and simulate quantum circuits right in your browser.
          No installations. No servers. Pure quantum exploration.
        </p>
        <button className="hero-cta" onClick={onGetStarted}>
          Launch Composer →
        </button>
      </div>
    </section>
  );
}

// ── How to Use Section ─────────────────────────────────────────────
function HowToUse() {
  return (
    <div className="page-section" id="howto">
      <div className="howto-section">
        <h2>How to Use</h2>
        <p className="howto-subtitle">Get started with Quantum Composer in minutes</p>

        <div className="howto-grid">
          <div className="howto-card">
            <span className="howto-card-icon">1️⃣</span>
            <h3>Choose Your Qubits</h3>
            <p>
              Select 1–4 qubits from the dropdown at the top of the composer.
              Each qubit starts in the <code>|0⟩</code> state. More qubits = more
              computational states to explore.
            </p>
          </div>

          <div className="howto-card">
            <span className="howto-card-icon">2️⃣</span>
            <h3>Place Quantum Gates</h3>
            <p>
              Click a gate button (like <code>H</code>, <code>X</code>, <code>CX</code>) then click
              a cell on the circuit grid to place it. You can also <strong>drag & drop</strong> gates
              directly onto the grid.
            </p>
          </div>

          <div className="howto-card">
            <span className="howto-card-icon">3️⃣</span>
            <h3>Simulate & Visualize</h3>
            <p>
              Hit <strong>▶ Simulate</strong> to run your circuit. You'll see probability
              distributions, phase information, and full statevector amplitudes.
              Enable <strong>Auto</strong> mode for live updates as you build.
            </p>
          </div>

          <div className="howto-card">
            <span className="howto-card-icon">💾</span>
            <h3>Save & Load Circuits</h3>
            <p>
              Save your circuits locally and reload them anytime. Great for
              experimenting with different configurations or comparing results.
            </p>
          </div>

          <div className="howto-card">
            <span className="howto-card-icon">🖱️</span>
            <h3>Edit & Remove</h3>
            <p>
              <strong>Right-click</strong> any placed gate to remove it.
              Click an empty cell to place the currently selected gate.
              Use the <strong>Clear</strong> button to reset the entire circuit.
            </p>
          </div>

          <div className="howto-card">
            <span className="howto-card-icon">🔄</span>
            <h3>Rotation Gates</h3>
            <p>
              Gates like <code>Rx</code>, <code>Ry</code>, <code>Rz</code> prompt you
              for an angle in radians. Use <code>π/2 ≈ 1.5708</code> or
              <code>π/4 ≈ 0.7854</code> for common rotations.
            </p>
          </div>
        </div>

        <div className="gate-ref">
          <h3>Gate Reference</h3>
          <table className="gate-ref-table">
            <thead>
              <tr><th>Gate</th><th>Type</th><th>Description</th></tr>
            </thead>
            <tbody>
              <tr><td className="gate-name">H</td><td>Single</td><td>Hadamard — creates equal superposition</td></tr>
              <tr><td className="gate-name">X</td><td>Single</td><td>Pauli-X — bit flip (quantum NOT)</td></tr>
              <tr><td className="gate-name">Y</td><td>Single</td><td>Pauli-Y — bit + phase flip</td></tr>
              <tr><td className="gate-name">Z</td><td>Single</td><td>Pauli-Z — phase flip</td></tr>
              <tr><td className="gate-name">S</td><td>Single</td><td>S gate — π/2 phase shift</td></tr>
              <tr><td className="gate-name">T</td><td>Single</td><td>T gate — π/4 phase shift</td></tr>
              <tr><td className="gate-name">Rx</td><td>Rotation</td><td>Rotation around X-axis by angle θ</td></tr>
              <tr><td className="gate-name">Ry</td><td>Rotation</td><td>Rotation around Y-axis by angle θ</td></tr>
              <tr><td className="gate-name">Rz</td><td>Rotation</td><td>Rotation around Z-axis by angle θ</td></tr>
              <tr><td className="gate-name">CX</td><td>Multi</td><td>Controlled-NOT (CNOT) — entangles two qubits</td></tr>
              <tr><td className="gate-name">CCX</td><td>Multi</td><td>Toffoli — 3-qubit controlled-controlled-NOT</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────
function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [qubitCount, setQubitCount] = useState(2);
  const [grid, setGrid]           = useState(emptyGrid(2));
  const [selectedGate, setGate]   = useState("H");
  const [modal, setModal]         = useState(null);
  const [results, setResults]     = useState(null);
  const [error, setError]         = useState(null);
  const [loading, setLoading]     = useState(false);
  const [autoSim, setAutoSim]     = useState(false);
  const debounceRef = useRef(null);
  const [saved, setSaved]         = useState(loadSaved);
  const [showSave, setShowSave]   = useState(false);
  const [showLoad, setShowLoad]   = useState(false);
  const [dragging, setDragging]   = useState(null);

  // ── simulate ───────────────────────────────────────────────────
  const doSimulate = useCallback(async (g, qc) => {
    const theGrid = g || grid;
    const theQC   = qc || qubitCount;
    if (!gridHasGates(theGrid)) return;
    setError(null);
    setLoading(true);
    const program = buildProgram(theGrid);
    try {
      // Use client-side simulator (instant, no network)
      const body = QSim.simulate(theQC, program);
      setResults(body);
    } catch (e) {
      if (USE_SERVER_FALLBACK) {
        // Fallback to server if client sim fails and fallback enabled
        try {
          const resp = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ qubit_count: theQC, program }),
          });
          const body = await resp.json();
          if (!resp.ok) { setError(body.detail || JSON.stringify(body)); setResults(null); }
          else { setResults(body); }
        } catch (e2) { setError("Simulation error: " + e.message); setResults(null); }
      } else {
        setError("Client simulation error: " + e.message);
        setResults(null);
      }
    }
    finally { setLoading(false); }
  }, [grid, qubitCount]);

  // ── auto-sim debounce ──────────────────────────────────────────
  useEffect(() => {
    if (!autoSim) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSimulate(grid, qubitCount), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [grid, qubitCount, autoSim]);

  const changeQubits = useCallback((n) => { setQubitCount(n); setGrid(emptyGrid(n)); setResults(null); setError(null); }, []);

  // ── place gate ─────────────────────────────────────────────────
  const placeGate = useCallback((gateName, row, col) => {
    if (ROTATION_GATES.includes(gateName)) { setModal({ type: "angle", row, col, gate: gateName }); return; }
    if (MULTI_GATES.includes(gateName)) { setModal({ type: "multi", row, col, gate: gateName }); return; }
    setGrid(prev => {
      const next = prev.map(r => [...r]);
      if (next[row][col] && next[row][col].gate === gateName) next[row][col] = null;
      else next[row][col] = { gate: gateName };
      return next;
    });
  }, []);

  const handleCellClick = useCallback((row, col) => placeGate(selectedGate, row, col), [selectedGate, placeGate]);

  const confirmAngle = useCallback((angle) => {
    if (!modal || isNaN(angle)) { setModal(null); return; }
    setGrid(prev => { const n = prev.map(r => [...r]); n[modal.row][modal.col] = { gate: modal.gate, angle }; return n; });
    setModal(null);
  }, [modal]);

  const confirmMulti = useCallback((params) => {
    if (!modal) return;
    const g = modal.gate.toLowerCase();
    setGrid(prev => {
      const next = prev.map(r => [...r]);
      for (let r = 0; r < next.length; r++) { if (next[r][modal.col] && next[r][modal.col].gate.toLowerCase() === g) next[r][modal.col] = null; }
      if (g === "cx") {
        next[params.control][modal.col] = { gate: "CX", role: "ctrl", control: params.control, target: params.target };
        next[params.target][modal.col]  = { gate: "CX", role: "tgt",  control: params.control, target: params.target };
      } else {
        next[params.control1][modal.col] = { gate: "CCX", role: "ctrl1", control1: params.control1, control2: params.control2, target: params.target };
        next[params.control2][modal.col] = { gate: "CCX", role: "ctrl2", control1: params.control1, control2: params.control2, target: params.target };
        next[params.target][modal.col]   = { gate: "CCX", role: "tgt",   control1: params.control1, control2: params.control2, target: params.target };
      }
      return next;
    });
    setModal(null);
  }, [modal]);

  const clearGrid = useCallback(() => { setGrid(emptyGrid(qubitCount)); setResults(null); setError(null); }, [qubitCount]);

  const removeCell = useCallback((row, col) => {
    setGrid(prev => {
      const next = prev.map(r => [...r]);
      const cell = next[row][col];
      if (cell && (cell.gate === "CX" || cell.gate === "CCX")) {
        for (let r = 0; r < next.length; r++) { if (next[r][col] && next[r][col].gate === cell.gate) next[r][col] = null; }
      } else next[row][col] = null;
      return next;
    });
  }, []);

  // ── save / load ────────────────────────────────────────────────
  const saveCircuit = useCallback((name) => {
    const entry = { name, qubitCount, grid, ts: Date.now() };
    const updated = [entry, ...saved].slice(0, 20);
    setSaved(updated); persistSaved(updated); setShowSave(false);
  }, [qubitCount, grid, saved]);

  const loadCircuit = useCallback((entry) => { setQubitCount(entry.qubitCount); setGrid(entry.grid); setResults(null); setError(null); setShowLoad(false); }, []);
  const deleteSaved = useCallback((idx) => { const u = saved.filter((_, i) => i !== idx); setSaved(u); persistSaved(u); }, [saved]);

  // ── drag & drop ────────────────────────────────────────────────
  const handleDragStart = useCallback((gate, e) => { setDragging(gate); e.dataTransfer.setData("text/plain", gate); e.dataTransfer.effectAllowed = "copy"; }, []);
  const handleDragOver  = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }, []);
  const handleDrop = useCallback((row, col, e) => {
    e.preventDefault();
    const gate = e.dataTransfer.getData("text/plain");
    if (gate && ALL_GATES.includes(gate)) placeGate(gate, row, col);
    setDragging(null);
  }, [placeGate]);
  const handleDragEnd = useCallback(() => setDragging(null), []);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <React.Fragment>
      {/* ── Sticky Nav Bar ── */}
      <nav className="navbar">
        <span className="nav-logo" onClick={() => setActiveTab("home")}>⚛ Quantum Composer</span>
        <ul className="nav-links">
          <li><button className={`nav-link ${activeTab === "home" ? "active" : ""}`} onClick={() => setActiveTab("home")}>Home</button></li>
          <li><button className={`nav-link ${activeTab === "composer" ? "active" : ""}`} onClick={() => setActiveTab("composer")}>Composer</button></li>
          <li><button className={`nav-link ${activeTab === "howto" ? "active" : ""}`} onClick={() => setActiveTab("howto")}>How to Use</button></li>
        </ul>
      </nav>

      {/* ── Home / Hero ── */}
      {activeTab === "home" && (
        <HeroSection onGetStarted={() => setActiveTab("composer")} />
      )}

      {/* ── Composer Tab ── */}
      {activeTab === "composer" && (
        <div className="page-section">
          <div className="app">
            <div className="composer-header">
              <h1>⚛ Quantum Composer</h1>
              <span className="subtitle">Up to {MAX_QUBITS} qubits · {MAX_STEPS} steps · Client-side simulation</span>
            </div>

            <div className="controls">
              <label>Qubits:
                <select value={qubitCount} onChange={e => changeQubits(+e.target.value)}>
                  {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>

              <div className="gate-palette">
                {ALL_GATES.map(g => (
                  <button key={g} className={`gate-btn ${selectedGate === g ? "active" : ""}`}
                    onClick={() => setGate(g)} draggable onDragStart={e => handleDragStart(g, e)} onDragEnd={handleDragEnd}>
                    {g}
                  </button>
                ))}
              </div>

              <label className="auto-toggle" title="Auto-simulate on change (debounced)">
                <input type="checkbox" checked={autoSim} onChange={e => setAutoSim(e.target.checked)} />
                Auto
              </label>

              <button className="icon-btn" onClick={() => setShowSave(true)} title="Save circuit">💾</button>
              <button className="icon-btn" onClick={() => setShowLoad(true)} title="Load circuit">📂</button>
              <button className="clear-btn" onClick={clearGrid}>Clear</button>
              <button className="sim-btn" onClick={() => doSimulate()} disabled={loading}>
                {loading ? "Running…" : "▶ Simulate"}
              </button>
            </div>

            {/* Circuit Grid */}
            <div className="circuit-grid" style={{ gridTemplateColumns: `60px repeat(${MAX_STEPS}, 1fr)` }}>
              <div className="grid-header">Wire</div>
              {Array.from({ length: MAX_STEPS }, (_, c) => <div className="grid-header" key={c}>t{c}</div>)}

              {grid.map((row, ri) => (
                <React.Fragment key={ri}>
                  <div className="wire-label">q{ri}</div>
                  {row.map((cell, ci) => {
                    let display = "";
                    let cls = "cell";
                    if (cell) {
                      const g = cell.gate;
                      if (g === "CX" || g === "CCX") {
                        if (cell.role === "tgt") { display = "⊕"; cls += " cell-target"; }
                        else { display = "●"; cls += " cell-control"; }
                      } else if (["Rx","Ry","Rz"].includes(g)) {
                        display = `${g}(${cell.angle != null ? cell.angle.toFixed(2) : "?"})`;
                        cls += " cell-rotation";
                      } else {
                        display = g;
                        cls += " cell-gate";
                      }
                      cls += " cell-placed";
                    } else {
                      cls += " cell-empty";
                    }
                    return (
                      <div key={ci} className={cls + (dragging && !cell ? " drop-ready" : "")}
                        onClick={() => cell ? null : handleCellClick(ri, ci)}
                        onContextMenu={e => { e.preventDefault(); removeCell(ri, ci); }}
                        onDragOver={cell ? undefined : handleDragOver}
                        onDrop={cell ? undefined : e => handleDrop(ri, ci, e)}
                        title={cell ? "Right-click to remove" : `Place ${selectedGate} (or drag)`}>
                        {display}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>

            <p className="hint">Click or drag a gate onto the grid · Right-click to remove</p>

            {error && <div className="error-box">⚠ {error}</div>}
            <Results data={results} />
          </div>
        </div>
      )}

      {/* ── How to Use Tab ── */}
      {activeTab === "howto" && <HowToUse />}

      {/* ── Footer ── */}
      <footer className="site-footer">
        Quantum Composer · Built for learning & exploration
      </footer>

      {/* ── Modals (always available) ── */}
      {modal && modal.type === "angle" && <AngleModal gate={modal.gate} onConfirm={confirmAngle} onCancel={() => setModal(null)} />}
      {modal && modal.type === "multi" && <MultiGateModal gate={modal.gate} qubitCount={qubitCount} onConfirm={confirmMulti} onCancel={() => setModal(null)} />}
      {showSave && <SaveModal onSave={saveCircuit} onCancel={() => setShowSave(false)} />}

      {showLoad && (
        <div className="modal-overlay">
          <div className="modal modal-wide">
            <h3>Saved Circuits</h3>
            {saved.length === 0 && <p>No saved circuits yet.</p>}
            <div className="saved-list">
              {saved.map((s, i) => (
                <div key={i} className="saved-item">
                  <span className="saved-name">{s.name}</span>
                  <span className="saved-meta">{s.qubitCount}q · {new Date(s.ts).toLocaleDateString()}</span>
                  <button className="primary" onClick={() => loadCircuit(s)}>Load</button>
                  <button onClick={() => deleteSaved(i)}>🗑</button>
                </div>
              ))}
            </div>
            <div className="modal-actions"><button onClick={() => setShowLoad(false)}>Close</button></div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);