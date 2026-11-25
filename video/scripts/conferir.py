"""Ouve cada fala com o Whisper (local) e devolve as palavras com o tempo. Fica aberto: recebe um caminho
de WAV (JSON) por linha e responde um JSON por linha, [{w, ini, fim}]. Roda no venv de .w4k3/reels.
"""
import json
import sys

from faster_whisper import WhisperModel

m = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=8)
print('pronto', flush=True)
for linha in sys.stdin:
    segs, _ = m.transcribe(json.loads(linha), language='pt', beam_size=5, word_timestamps=True, condition_on_previous_text=False)
    print(json.dumps([{'w': w.word.strip(), 'ini': round(float(w.start), 3), 'fim': round(float(w.end), 3)}
                      for s in segs for w in (s.words or [])]), flush=True)
