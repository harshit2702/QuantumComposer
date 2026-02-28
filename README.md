# Quantum Composer – MVP v0.1

A lightweight web-based quantum circuit composer: build circuits up to 4 qubits / 10 gates per wire, simulate with Qiskit's `Statevector`, and visualise probabilities and phases — all in one page.

## Quick Start

```bash
# 1. Create a virtual environment & install deps
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Run the server
uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000** in your browser.

## Project Structure

```
QuantumComposer/
├── main.py                  # FastAPI backend + Qiskit engine
├── requirements.txt         # Python dependencies
├── MVP_Quantum_Composer.md  # Full spec / blueprint
├── README.md                # This file
└── frontend/
    ├── index.html           # Entry point (loads React via CDN)
    ├── app.jsx              # React app (circuit grid, modals, results)
    └── styles.css           # Dark-theme styles
```

## Supported Gates

| Gate | Type | Extra fields |
|------|------|-------------|
| H, X, Y, Z, S, T | Single-qubit | `target` |
| Rx, Ry, Rz | Rotation | `target`, `angle` (radians) |
| CX (CNOT) | 2-qubit | `control`, `target` |
| CCX (Toffoli) | 3-qubit | `control1`, `control2`, `target` |

## API

**POST** `/simulate`

```json
{
  "qubit_count": 2,
  "program": [
    {"gate": "h", "target": 0},
    {"gate": "cx", "control": 0, "target": 1}
  ]
}
```

**Response** (200):

```json
{
  "qubit_count": 2,
  "statevector": [{"re": 0.70710678, "im": 0.0}, ...],
  "probabilities": [0.5, 0.0, 0.0, 0.5],
  "phases": [0.0, 0.0, 0.0, 0.0]
}
```

## Frontend Usage

1. Select qubit count (1–4).
2. Pick a gate from the palette.
3. Click an empty cell on the circuit grid to place it.
   - **Rotation gates** → angle modal pops up.
   - **CX / CCX** → control/target selector pops up.
4. Right-click any placed gate to remove it.
5. Hit **▶ Simulate** to send the circuit and view results.

## Tech Stack

- **Backend:** FastAPI + Qiskit (`Statevector`)
- **Frontend:** React 18 (CDN, no build step) + Babel standalone
- **Zero Node.js tooling required** — just Python.
