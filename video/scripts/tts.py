"""Narração local com Piper: uma frase por arquivo, para saber o tempo exato de cada uma.

uso: python tts.py <modelo.onnx> <frases.json> <pasta_saida> [length_scale]
Imprime no stdout um JSON com a duração (s) de cada frase.
"""
import json
import sys
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

modelo, entrada, saida = sys.argv[1], sys.argv[2], Path(sys.argv[3])
escala = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
saida.mkdir(parents=True, exist_ok=True)
voz = PiperVoice.load(modelo)
cfg = SynthesisConfig(length_scale=escala)
frases = json.loads(Path(entrada).read_text(encoding="utf-8"))
duracoes = []
for i, frase in enumerate(frases):
    arq = saida / f"f{i:02d}.wav"
    with wave.open(str(arq), "wb") as w:
        voz.synthesize_wav(frase, w, syn_config=cfg)
    with wave.open(str(arq), "rb") as w:
        duracoes.append(w.getnframes() / w.getframerate())
print(json.dumps(duracoes))
