# Quantum Composer — MVP (v0.1) Blueprint

This document captures the finalized blueprint for the Quantum Composer MVP.1 — compact, safe, and focused on a click-to-place frontend with a FastAPI + Qiskit backend.

---

## 1. Overview

- Purpose: Small web-based composer for building up to 4-qubit circuits and returning the statevector-derived probabilities and phases.
- UX: Click-to-place gate placement; rotation gates open a small angle modal; a single `Simulate` button sends a safe JSON representation to the backend.

---

## 2. Core Constraints

- Grid: Maximum **4 qubits** (wires). Time steps per wire capped at **10 gates**.
- Gate roster: `H`, `X`, `Y`, `Z`, `CX`, `CCX`, `S`, `T`, `R_x`, `R_y`, `R_z`.
- Multi-qubit gate requirements:

  - `CX` (CNOT): requires **2 distinct qubits** — one control and one target.
  - `CCX` (Toffoli): requires **3 distinct qubits** — two controls and one target.

  When users place `cx` or `ccx` on the grid the frontend must ensure there are enough available qubits in that timestep column to host the gate. If multiple valid placements exist (e.g., the user drops on a column that has empty cells in more than the minimum required rows), show a lightweight selector allowing the user to pick which qubit(s) act as control(s) and which act as the target. The UI must also provide a way to change control/target assignment after placement (context menu or small inline controls).

- Rotation gates (`R_x`, `R_y`, `R_z`) require a user-provided angle $\theta$ via a small modal before placement.
- Interaction: Click-to-place only; an explicit `Simulate` button triggers the backend.
---

## 3. Tech Stack

- Frontend: React (recommended) or plain JS/HTML for minimal prototype.
- Backend: FastAPI (Python).
- Quantum engine: Qiskit (`Statevector` from `qiskit.quantum_info`).

---

## 4. JSON Bridge (Frontend → Backend)

- The frontend sends a JSON array in execution order. Each object maps to a single gate placement.
- Example payload:

```json
[
  {"gate": "h", "target": 0},
  {"gate": "cx", "control": 0, "target": 1},
  {"gate": "rz", "target": 2, "angle": 1.57}
]
```

- Gate keys expected (lowercase): `h`, `x`, `y`, `z`, `s`, `t`, `cx`, `ccx`, `rx`, `ry`, `rz`.
 - Gate keys expected (lowercase): `h`, `x`, `y`, `z`, `s`, `t`, `cx`, `ccx`, `rx`, `ry`, `rz`.

Gate-specific required fields:

- `cx`: requires `control` and `target` integer indices.
- `ccx`: requires `control1`, `control2`, and `target` integer indices.

Example `cx` object:

```json
{"gate":"cx","control":0,"target":1}
```

Example `ccx` object:

```json
{"gate":"ccx","control1":0,"control2":1,"target":2}
```

---

## 5. Backend Engine Logic (behavior)

1. Receive POST `/simulate` with JSON payload (see API spec below).
2. Validate payload schema using Pydantic.
3. Build a Qiskit `QuantumCircuit` for `n` qubits (n = number of qubits in grid, max 4).
4. Map each gate object to the corresponding Qiskit call (safe mapping; do NOT eval user strings). Example mapping:

   - `h`  -> `qc.h(target)`
   - `x`  -> `qc.x(target)`
   - `y`  -> `qc.y(target)`
   - `z`  -> `qc.z(target)`
   - `s`  -> `qc.s(target)`
   - `t`  -> `qc.t(target)`
   - `cx` -> `qc.cx(control, target)`
   - `ccx`-> `qc.ccx(ctrl1, ctrl2, target)`
   - `rx` -> `qc.rx(angle, target)`
   - `ry` -> `qc.ry(angle, target)`
   - `rz` -> `qc.rz(angle, target)`

5. Once circuit is built, call `Statevector.from_instruction(qc)` to obtain the statevector.
6. Iterate through the statevector amplitudes (length $2^n$, max $16$ for 4 qubits) and compute per-amplitude:

   - Probability: $|a + bi|^2 = a^2 + b^2$
   - Phase (radians): $\mathrm{atan2}(b, a)$

   Use $\mathrm{atan2}(b, a)$ (safer than $\arctan(b/a)$) to properly handle quadrants.

7. Package results into JSON and return to frontend.

---

## 6. API Spec (recommended)

- Endpoint: `POST /simulate`
- Request JSON: array of gate objects (see section 4). Frontend must include `qubit_count` or server must infer from payload and validate it is ≤ 4.

- Example request body (3-qubit program):

```json
{
  "qubit_count": 3,
  "program": [
    {"gate": "h", "target": 0},
    {"gate": "cx", "control": 0, "target": 1},
    {"gate": "rz", "target": 2, "angle": 1.5708}
  ]
}
```

- Successful response (200):

- Successful response (200):

```json
{
  "qubit_count": 3,
  "statevector": ["0.7071+0.0000j", "0.0000+0.0000j", "0.0000+0.0000j", "0.7071+0.0000j", ...],
  "probabilities": [0.5, 0.0, 0.0, 0.5, ...],
  "phases": [0.0, 0.0, 0.0, 0.0, ...]
}
```

Error responses (examples):

```json
400 Bad Request
{
  "error": "qubit_count must be <= 4"
}

400 Bad Request
{
  "error": "cx requires distinct control and target indices within 0..qubit_count-1"
}

400 Bad Request
{
  "error": "ccx requires control1, control2, and target; all must be distinct"
}
```

Notes:
- `statevector` entries can be returned as strings (for JSON safety) or as two-field objects `{ "re": ..., "im": ... }`.
- `probabilities` and `phases` arrays are the same length as the statevector ($2^{\text{qubit_count}}$).

---

## 7. Data Validation Rules

- Reject any `target` or `control` index outside `0..qubit_count-1`.
- Reject more than 10 gates per wire (return 400 with a concise error message).
- Reject `qubit_count > 4`.
- For rotation gates (`rx`, `ry`, `rz`) require numeric `angle` present; validate it's finite.

- Reject any `target` or `control` index outside `0..qubit_count-1`.
- For `cx`: require `control` and `target` fields; they must be integers, inside `0..qubit_count-1`, and `control != target`.
- For `ccx`: require `control1`, `control2`, and `target` fields; all must be integers inside `0..qubit_count-1` and pairwise distinct.
- Reject more than 10 gates per wire (return 400 with a concise error message).
- Reject `qubit_count > 4`.
- For rotation gates (`rx`, `ry`, `rz`) require numeric `angle` present; validate it's finite.

---

## 8. Security & Safety Notes

- Do not evaluate or import user-provided code; use a controlled map from gate names to functions.
- Limit resources: timeouts per request and max qubits/gates caps are enforced.
- Sanitize and validate all input with Pydantic.

---

## 9. Frontend Implementation Notes

- Grid: use CSS Grid where rows = qubits, columns = timesteps (0..9).
- Click-to-place: clicking a cell toggles a placement modal for rotations (angle input) or direct placement for single-parameter gates.
- UI should serialize the grid into the ordered JSON array (left-to-right, top-to-bottom or by timestep order) before sending.
- Show a small confirmation before `Simulate` if user placed more than 20 total gates (UX safety).

Additional placement and control UX for multi-qubit gates:

- When a user drags/drops or click-places a `cx` or `ccx` into a timestep column the frontend must verify there are enough empty or compatible cells in that column to host the gate across the necessary qubit rows. If not, show a validation hint and prevent placement.
- If the drop location is ambiguous (multiple possible sets of qubits could host the gate), open a compact selector listing available qubit indices so the user can explicitly choose which qubits become control(s) and target. The selector should default to the most intuitive mapping (e.g., use the clicked row as target for click-to-place `cx`) but always allow manual override.
- After placement, allow users to change the control/target assignment via a small context menu on the gate tile ("Change controls/target"). Changes update the serialized program immediately.
- Visual affordance: draw vertical connectors between qubits for `cx`/`ccx` so users can tell which qubits are linked at a glance.

---

## 10. Dependencies & Local Run (minimal)

- Python: 3.10+ recommended.
- Core packages:

```sh
pip install fastapi uvicorn qiskit pydantic
```

- Run the backend (example):

```sh
uvicorn main:app --reload --port 8000
```

Where `main.py` implements the FastAPI app with the `POST /simulate` route.

---

## 11. Example Implementation Sketch (server mapping)

- Pseudocode mapping (implement in `main.py`):

```python
# validate payload
# qc = QuantumCircuit(qubit_count)
# for op in program:
#   if op['gate']=='h': qc.h(op['target'])
#   ...
# sv = Statevector.from_instruction(qc)
# for amp in sv.data:
#   re, im = amp.real, amp.imag
#   prob = re*re + im*im
#   phase = math.atan2(im, re)
# return JSON
```

---

## 12. Example Payloads

- Single-qubit rotation:

```json
[{"gate":"rz","target":0,"angle":3.1415}]
```

- Small entangled pair (2 qubits):

```json
[{"gate":"h","target":0},{"gate":"cx","control":0,"target":1}]
```

---

## 13. Next Steps

- Implement FastAPI skeleton and gate-mapping (backend).
- Build simple React grid UI with click-to-place and angle modal.
- Wire simulate button to call `/simulate` and render probability/phase charts.

---

## 14. Contact / Notes

- This file serves as the single-source-of-truth for the MVP. Update it as APIs or UX decisions change.
