"""Explainable NGO ranking API. Model scores are enabled only with 100+ resolved requests."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

FEATURES = ["distance_fit", "quantity_fit", "urgency", "requirement_fit", "acceptance_rate"]
MIN_ROWS = 100
app = FastAPI(title="FoodLoop Matching API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FOODLOOP_ALLOWED_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)
model: RandomForestClassifier | None = None
model_rows = 0


class Candidate(BaseModel):
    id: str
    name: str
    distance_km: float = Field(ge=0)
    distance_known: bool = True
    available_capacity: float = Field(ge=0)
    acceptance_rate: float = Field(ge=0, le=1)
    requirement_fit: float = Field(ge=0, le=1)
    category_match: bool = True


class MatchRequest(BaseModel):
    quantity: float = Field(gt=0)
    hours_to_deadline: float = Field(ge=0)
    candidates: list[Candidate]


class Recommendation(BaseModel):
    id: str
    name: str
    score: int
    method: Literal["scikit-learn", "rule-based"]
    reasons: list[str]


def features_for(candidate: Candidate, quantity: float, hours: float) -> list[float]:
    quantity_fit = min(candidate.available_capacity / quantity, 1.0)
    urgency = max(0.0, min(1.0, 1.0 - hours / 24.0))
    distance_fit = max(0.0, 1.0 - candidate.distance_km / 25.0) if candidate.distance_known else 0.5
    return [distance_fit, quantity_fit, urgency, candidate.requirement_fit, candidate.acceptance_rate]


def explain(candidate: Candidate, features: list[float]) -> list[str]:
    distance_fit, quantity_fit, urgency, requirement, acceptance = features
    reasons = []
    if candidate.distance_known and candidate.distance_km <= 3: reasons.append(f"Nearby pickup ({candidate.distance_km:.1f} km)")
    if not candidate.distance_known: reasons.append("Distance not configured; neutral distance score")
    if quantity_fit >= .9: reasons.append("Capacity fits the full quantity")
    elif quantity_fit > 0: reasons.append(f"Can use about {quantity_fit:.0%} of the quantity")
    if urgency >= .7: reasons.append("High-urgency pickup window")
    if requirement >= .7: reasons.append("Matches stated food requirements")
    if acceptance >= .8: reasons.append(f"Strong acceptance history ({acceptance:.0%})")
    return reasons or ["Eligible recipient; no strong historical signal yet"]


def rule_score(features: list[float]) -> float:
    distance_fit, quantity_fit, urgency, requirement, acceptance = features
    return 100 * (.30 * distance_fit + .25 * quantity_fit + .20 * urgency + .15 * requirement + .10 * acceptance)


def load_model() -> None:
    global model, model_rows
    path = Path(os.getenv("FOODLOOP_TRAINING_CSV", "training_data.csv"))
    if not path.exists(): return
    df = pd.read_csv(path)
    required = set(FEATURES + ["accepted"])
    if not required.issubset(df.columns): return
    df = df.dropna(subset=list(required))
    model_rows = len(df)
    if model_rows < MIN_ROWS or df["accepted"].nunique() < 2: return
    model = RandomForestClassifier(n_estimators=180, min_samples_leaf=3, class_weight="balanced", random_state=42)
    model.fit(df[FEATURES], df["accepted"].astype(int))


@app.on_event("startup")
def startup() -> None:
    load_model()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": "scikit-learn" if model else "rule-based", "training_rows": model_rows, "minimum_rows": MIN_ROWS}


@app.post("/recommend", response_model=list[Recommendation])
def recommend(request: MatchRequest) -> list[Recommendation]:
    ranked = []
    for candidate in request.candidates:
        if not candidate.category_match or candidate.available_capacity <= 0: continue
        features = features_for(candidate, request.quantity, request.hours_to_deadline)
        if model:
            score = float(model.predict_proba(pd.DataFrame([features], columns=FEATURES))[0][1] * 100)
            method = "scikit-learn"
        else:
            score = rule_score(features)
            method = "rule-based"
        ranked.append(Recommendation(id=candidate.id, name=candidate.name, score=round(score), method=method, reasons=explain(candidate, features)))
    return sorted(ranked, key=lambda item: item.score, reverse=True)
