"""Gera o gabarito do F4C3 SC4N: o que cada modelo deve achar em cada foto.

Reimplementa em numpy exatamente o mesmo pre e pos-processamento de
js/face-scan/vision.js, roda os modelos com onnxruntime e grava
tests/face-scan/fixtures/expected.json. A pagina tests/face-scan/parity.html
compara o resultado do navegador com esse arquivo.

Tambem confere a implementacao contra as classes prontas do OpenCV
(FaceDetectorYN e FaceRecognizerSF), para garantir que o gabarito nao herda
um erro nosso.

Uso (precisa de numpy, opencv-python e onnxruntime):
    python tests/face-scan/make_expected.py foto1.jpg foto2.webp ...

As fotos sao copiadas para tests/face-scan/fixtures/ (fora do git). Para a
primeira foto tambem sao criadas versoes com "mascara" e "mascara + oculos"
desenhadas sobre os rostos, e a pessoa de maior rosto dela vira a referencia
de identidade.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "models"
FIXTURES = Path(__file__).resolve().parent / "fixtures"

# Mesmos valores de js/face-scan/vision.js
FACE_INPUT = 640
FACE_SCORE = 0.6
FACE_NMS = 0.3
PERSON_INPUT = 416
PERSON_SCORE = 0.35
PERSON_NMS = 0.45
SFACE_TEMPLATE = np.array(
    [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
     [41.5493, 92.3655], [70.7299, 92.2041]], np.float64)
SFACE_MATCH = 0.363

ort.set_default_logger_severity(3)
yunet = ort.InferenceSession(str(MODELS / "yunet_2023mar.onnx"))
yolox = ort.InferenceSession(str(MODELS / "yolox_nano.onnx"))
sface = ort.InferenceSession(str(MODELS / "sface_2021dec_int8.onnx"))


def letterbox(img, side, pad):
    """Reduz mantendo a proporcao e cola no canto superior esquerdo."""
    ratio = min(side / img.shape[0], side / img.shape[1])
    w, h = round(img.shape[1] * ratio), round(img.shape[0] * ratio)
    canvas = np.full((side, side, 3), pad, np.uint8)
    canvas[:h, :w] = cv2.resize(img, (w, h), interpolation=cv2.INTER_LINEAR)
    return canvas, ratio


def to_blob(img_bgr):
    return np.ascontiguousarray(img_bgr.transpose(2, 0, 1)[None].astype(np.float32))


def iou(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def nms(items, threshold):
    items = sorted(items, key=lambda d: d["score"], reverse=True)
    kept = []
    for item in items:
        if all(iou(item["box"], k["box"]) <= threshold for k in kept):
            kept.append(item)
    return kept


def detect_faces(img):
    blob_img, ratio = letterbox(img, FACE_INPUT, 0)
    outs = dict(zip([o.name for o in yunet.get_outputs()],
                    yunet.run(None, {"input": to_blob(blob_img)})))
    found = []
    for stride in (8, 16, 32):
        cols = FACE_INPUT // stride
        cls = outs[f"cls_{stride}"][0, :, 0]
        obj = outs[f"obj_{stride}"][0, :, 0]
        bbox = outs[f"bbox_{stride}"][0]
        kps = outs[f"kps_{stride}"][0]
        score = np.sqrt(np.clip(cls, 0, 1) * np.clip(obj, 0, 1))
        for idx in np.nonzero(score >= FACE_SCORE)[0]:
            r, c = divmod(int(idx), cols)
            cx = (c + bbox[idx, 0]) * stride
            cy = (r + bbox[idx, 1]) * stride
            w = np.exp(bbox[idx, 2]) * stride
            h = np.exp(bbox[idx, 3]) * stride
            pts = [[(kps[idx, 2 * n] + c) * stride / ratio,
                    (kps[idx, 2 * n + 1] + r) * stride / ratio] for n in range(5)]
            found.append({
                "box": [float((cx - w / 2) / ratio), float((cy - h / 2) / ratio),
                        float(w / ratio), float(h / ratio)],
                "score": float(score[idx]),
                "landmarks": [[float(x), float(y)] for x, y in pts],
            })
    return nms(found, FACE_NMS)


def detect_people(img):
    blob_img, ratio = letterbox(img, PERSON_INPUT, 114)
    out = yolox.run(None, {"images": to_blob(blob_img)})[0][0]
    found, offset = [], 0
    for stride in (8, 16, 32):
        cols = PERSON_INPUT // stride
        for idx in range(cols * cols):
            row = out[offset + idx]
            score = float(row[4] * row[5])  # objectness * classe 0 (pessoa)
            if score < PERSON_SCORE:
                continue
            r, c = divmod(idx, cols)
            cx = (row[0] + c) * stride
            cy = (row[1] + r) * stride
            w = np.exp(row[2]) * stride
            h = np.exp(row[3]) * stride
            found.append({
                "box": [float((cx - w / 2) / ratio), float((cy - h / 2) / ratio),
                        float(w / ratio), float(h / ratio)],
                "score": score,
            })
        offset += cols * cols
    return nms(found, PERSON_NMS)


def similarity_transform(src, dst):
    """Umeyama sem reflexao: matriz 2x3 que leva src em dst."""
    src, dst = np.asarray(src, np.float64), np.asarray(dst, np.float64)
    mu_s, mu_d = src.mean(0), dst.mean(0)
    s, d = src - mu_s, dst - mu_d
    var_s = (s ** 2).sum() / len(src)
    cov = d.T @ s / len(src)
    a, b = cov[0, 0] + cov[1, 1], cov[1, 0] - cov[0, 1]
    norm = np.hypot(a, b)
    cos, sin = a / norm, b / norm
    scale = norm / var_s
    rot = np.array([[cos, -sin], [sin, cos]]) * scale
    t = mu_d - rot @ mu_s
    return np.hstack([rot, t[:, None]])


def embed(img, face):
    m = similarity_transform(face["landmarks"], SFACE_TEMPLATE)
    aligned = cv2.warpAffine(img, m, (112, 112), flags=cv2.INTER_LINEAR)
    rgb = cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB)
    vec = sface.run(None, {"data": to_blob(rgb)})[0][0]
    return vec / np.linalg.norm(vec)


def largest(faces):
    return max(faces, key=lambda f: f["box"][2] * f["box"][3]) if faces else None


def draw_disguise(img, faces, glasses):
    out = img.copy()
    for f in faces:
        (rex, rey), (lex, ley), (nx, ny), (rmx, rmy), (lmx, lmy) = f["landmarks"]
        x, y, w, h = f["box"]
        # "Mascara": do meio do nariz ate o queixo
        top = int(ny - 0.1 * h)
        cv2.rectangle(out, (int(x), top), (int(x + w), int(y + h * 1.05)), (40, 40, 40), -1)
        if glasses:
            r = int(0.17 * w)
            for ex, ey in ((rex, rey), (lex, ley)):
                cv2.circle(out, (int(ex), int(ey)), r, (10, 10, 10), -1)
            cv2.line(out, (int(rex), int(rey)), (int(lex), int(ley)), (10, 10, 10), max(2, r // 4))
    return out


def opencv_sanity(img, path, faces, ref_vec):
    """Confere contagem e similaridade contra as classes prontas do OpenCV."""
    blob_img, ratio = letterbox(img, FACE_INPUT, 0)
    det = cv2.FaceDetectorYN.create(str(MODELS / "yunet_2023mar.onnx"), "",
                                    (FACE_INPUT, FACE_INPUT), FACE_SCORE, FACE_NMS, 5000)
    _, cv_faces = det.detect(blob_img)
    cv_count = 0 if cv_faces is None else len(cv_faces)
    note = f"  opencv FaceDetectorYN: {cv_count} rosto(s), nosso: {len(faces)}"
    if ref_vec is not None and cv_faces is not None and len(cv_faces):
        rec = cv2.FaceRecognizerSF.create(str(MODELS / "sface_2021dec_int8.onnx"), "")
        big = max(cv_faces, key=lambda f: f[2] * f[3])
        feat = rec.feature(rec.alignCrop(blob_img, big)).flatten()
        feat = feat / np.linalg.norm(feat)
        ours = embed(img, largest(faces)) if faces else None
        if ours is not None:
            note += f" | cos(opencv, nosso) do maior rosto = {float(feat @ ours):.3f}"
    print(note)


def analyze(img, ref_vec):
    faces = detect_faces(img)
    people = detect_people(img)
    sims = [float(embed(img, f) @ ref_vec) for f in faces] if ref_vec is not None else []
    for f, s in zip(faces, sims):
        f["similarity"] = s
    return {
        "width": img.shape[1],
        "height": img.shape[0],
        "faces": faces,
        "people": people,
        "best_similarity": max(sims) if sims else None,
        "recognized": bool(sims) and max(sims) >= SFACE_MATCH,
    }


def main(paths):
    if not paths:
        raise SystemExit(__doc__)
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / ".gitignore").write_text("*\n!.gitignore\n", encoding="utf-8")

    names = []
    for p in map(Path, paths):
        dest = FIXTURES / p.name
        if p.resolve() != dest.resolve():
            shutil.copyfile(p, dest)
        names.append(p.name)

    first = cv2.imdecode(np.fromfile(str(FIXTURES / names[0]), np.uint8), cv2.IMREAD_COLOR)
    first_faces = detect_faces(first)
    if not first_faces:
        raise SystemExit("Nenhum rosto na primeira foto; ela precisa servir de referencia.")
    reference_face = largest(first_faces)
    ref_vec = embed(first, reference_face)

    stem = Path(names[0]).stem
    for suffix, glasses in (("mascara", False), ("mascara_oculos", True)):
        name = f"{stem}_{suffix}.png"
        cv2.imencode(".png", draw_disguise(first, first_faces, glasses))[1].tofile(str(FIXTURES / name))
        names.append(name)

    expected = {
        "config": {
            "face": {"input": FACE_INPUT, "score": FACE_SCORE, "nms": FACE_NMS},
            "person": {"input": PERSON_INPUT, "score": PERSON_SCORE, "nms": PERSON_NMS},
            "sface_match": SFACE_MATCH,
        },
        "reference": {"image": names[0], "box": reference_face["box"]},
        "images": {},
    }
    for name in names:
        img = cv2.imdecode(np.fromfile(str(FIXTURES / name), np.uint8), cv2.IMREAD_COLOR)
        result = analyze(img, ref_vec)
        expected["images"][name] = result
        sim = result["best_similarity"]
        print(f"{name}: {len(result['faces'])} rosto(s), {len(result['people'])} pessoa(s), "
              f"identidade {'-' if sim is None else f'{sim:.3f}'}"
              f"{' (reconhecido)' if result['recognized'] else ''}")
        opencv_sanity(img, name, result["faces"], ref_vec)

    (FIXTURES / "expected.json").write_text(json.dumps(expected, indent=1), encoding="utf-8")
    print(f"\nGabarito salvo em {FIXTURES / 'expected.json'}")


if __name__ == "__main__":
    main(sys.argv[1:])
