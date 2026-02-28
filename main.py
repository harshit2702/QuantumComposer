"""Quantum Composer – FastAPI backend (MVP v0.1)"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"
from pydantic import BaseModel, validator

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

# ── Pydantic models ────────────────────────────────────────────────

ALLOWED_GATES = {"h", "x", "y", "z", "s", "t", "cx", "ccx", "rx", "ry", "rz"}
ROTATION_GATES = {"rx", "ry", "rz"}
MAX_QUBITS = 4
MAX_GATES_PER_WIRE = 10


class GateOp(BaseModel):
    gate: str
    target: int
    control: Optional[int] = None
    control1: Optional[int] = None
    control2: Optional[int] = None
    angle: Optional[float] = None

    @validator("gate")
    def gate_must_be_allowed(cls, v: str) -> str:
        v = v.lower()
        if v not in ALLOWED_GATES:
            raise ValueError(f"unsupported gate '{v}'")
        return v

    @validator("angle")
    def angle_must_be_finite(cls, v: Optional[float], values: dict) -> Optional[float]:
        gate = values.get("gate", "")
        if gate in ROTATION_GATES:
            if v is None:
                raise ValueError(f"{gate} requires an 'angle' field")
            if not math.isfinite(v):
                raise ValueError("angle must be finite")
        return v


class SimulateRequest(BaseModel):
    qubit_count: int
    program: List[GateOp]

    @validator("qubit_count")
    def qubit_count_in_range(cls, v: int) -> int:
        if v < 1 or v > MAX_QUBITS:
            raise ValueError(f"qubit_count must be between 1 and {MAX_QUBITS}")
        return v


# ── FastAPI app ────────────────────────────────────────────────────

app = FastAPI(title="Quantum Composer Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ────────────────────────────────────────────────────────

def _check(idx: int, n: int, label: str, step: int) -> None:
    """Validate a qubit index is within range."""
    if not (0 <= idx < n):
        raise HTTPException(
            status_code=400,
            detail=f"{label}={idx} out of range 0..{n-1} (step {step})",
        )


def build_circuit(req: SimulateRequest) -> QuantumCircuit:
    n = req.qubit_count
    qc = QuantumCircuit(n)
    wire_counts = [0] * n

    for i, op in enumerate(req.program):
        gate = op.gate  # already lowercased by validator

        # ── single-qubit gates ──────────────────────────────────
        if gate in {"h", "x", "y", "z", "s", "t"} | ROTATION_GATES:
            _check(op.target, n, "target", i)

            if gate == "h":
                qc.h(op.target)
            elif gate == "x":
                qc.x(op.target)
            elif gate == "y":
                qc.y(op.target)
            elif gate == "z":
                qc.z(op.target)
            elif gate == "s":
                qc.s(op.target)
            elif gate == "t":
                qc.t(op.target)
            elif gate == "rx":
                qc.rx(op.angle, op.target)
            elif gate == "ry":
                qc.ry(op.angle, op.target)
            elif gate == "rz":
                qc.rz(op.angle, op.target)

            wire_counts[op.target] += 1

        # ── CX (CNOT) ──────────────────────────────────────────
        elif gate == "cx":
            if op.control is None:
                raise HTTPException(400, f"cx requires 'control' (step {i})")
            _check(op.control, n, "control", i)
            _check(op.target, n, "target", i)
            if op.control == op.target:
                raise HTTPException(400, f"cx control and target must differ (step {i})")
            qc.cx(op.control, op.target)
            wire_counts[op.control] += 1
            wire_counts[op.target] += 1

        # ── CCX (Toffoli) ──────────────────────────────────────
        elif gate == "ccx":
            if op.control1 is None or op.control2 is None:
                raise HTTPException(400, f"ccx requires 'control1' and 'control2' (step {i})")
            for lbl, idx in [("control1", op.control1), ("control2", op.control2), ("target", op.target)]:
                _check(idx, n, lbl, i)
            if len({op.control1, op.control2, op.target}) != 3:
                raise HTTPException(400, f"ccx control1, control2, target must be distinct (step {i})")
            qc.ccx(op.control1, op.control2, op.target)
            wire_counts[op.control1] += 1
            wire_counts[op.control2] += 1
            wire_counts[op.target] += 1

        # ── per-wire cap ────────────────────────────────────────
        for q, cnt in enumerate(wire_counts):
            if cnt > MAX_GATES_PER_WIRE:
                raise HTTPException(400, f"gate limit ({MAX_GATES_PER_WIRE}) exceeded on qubit {q}")

    return qc


# ── Endpoint ───────────────────────────────────────────────────────

@app.post("/simulate")
def simulate(req: SimulateRequest):
    qc = build_circuit(req)
    sv = Statevector.from_instruction(qc)

    statevector = []
    probabilities = []
    phases = []

    for amp in sv.data:
        re = float(amp.real)
        im = float(amp.imag)
        prob = re * re + im * im
        phase = math.atan2(im, re)
        statevector.append({"re": round(re, 8), "im": round(im, 8)})
        probabilities.append(round(prob, 8))
        phases.append(round(phase, 8))

    return {
        "qubit_count": req.qubit_count,
        "statevector": statevector,
        "probabilities": probabilities,
        "phases": phases,
    }


# ── Serve frontend ────────────────────────────────────────────────

@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")

@app.get("/test")
def test_page():
    return FileResponse(FRONTEND_DIR / "test.html")


app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="static")
