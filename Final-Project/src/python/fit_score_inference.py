import hashlib
import json
import os
import re
import sys
import zipfile
from pathlib import Path

import joblib
import numpy as np
import tensorflow as tf


MODEL_ZIP = Path(os.environ.get("FIT_SCORE_MODEL_BUNDLE", "fit_score_model_bundle.zip"))
MODEL_DIR = Path(os.environ.get("FIT_SCORE_MODEL_DIR", "model_assets"))
MODEL_FILE = MODEL_DIR / "fit_score_model.keras"
SCALER_FILE = MODEL_DIR / "scaler.joblib"
DIM = 384


def ensure_model_assets() -> None:
    if MODEL_FILE.exists() and SCALER_FILE.exists():
        return
    if not MODEL_ZIP.exists():
        raise FileNotFoundError(f"Model bundle not found: {MODEL_ZIP}")
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(MODEL_ZIP, "r") as archive:
        archive.extractall(MODEL_DIR)


def hashed_text_vector(text: str, dim: int = DIM) -> np.ndarray:
    tokens = re.findall(r"[a-z0-9+#.]{2,}", text.lower())
    vector = np.zeros(dim, dtype=np.float32)
    for token in tokens:
        digest = hashlib.sha1(token.encode("utf-8")).hexdigest()
        idx = int(digest[:8], 16) % dim
        vector[idx] += 1.0
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm
    return vector


def build_features(resume_text: str, job_text: str) -> np.ndarray:
    resume_vec = hashed_text_vector(resume_text)
    job_vec = hashed_text_vector(job_text)
    diff_vec = np.abs(resume_vec - job_vec)
    combined = (resume_vec * 0.5) + (job_vec * 0.2) + (diff_vec * 0.3)
    return combined.astype(np.float32)


def run_inference(resume_text: str, job_text: str) -> float:
    ensure_model_assets()
    scaler = joblib.load(SCALER_FILE)
    model = tf.keras.models.load_model(MODEL_FILE)

    features = build_features(resume_text, job_text).reshape(1, DIM)
    scaled = scaler.transform(features)
    prediction = float(model.predict(scaled, verbose=0).reshape(-1)[0])

    # Handle both 0..1 and 0..100 model outputs.
    if prediction <= 1.5:
        prediction *= 100.0
    prediction = max(0.0, min(100.0, prediction))
    return round(prediction, 2)


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        resume_text = (payload.get("resumeText") or "").strip() or " "
        job_text = (payload.get("jobText") or "").strip() or " "
        score = run_inference(resume_text, job_text)
        print(json.dumps({"overallScore": score}))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
