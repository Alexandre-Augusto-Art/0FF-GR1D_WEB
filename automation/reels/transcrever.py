"""Transcreve o áudio de um vídeo com faster-whisper (local, CPU ou GPU).

Uso: python transcrever.py <video> <saida.json> [modelo]
  modelo: small (padrão no CPU), medium ou large-v3 (com a 3090)
Grava {"idioma", "texto", "duracao"}. O idioma é detectado (reels em inglês ou português).
"""
import json
import sys

from faster_whisper import WhisperModel


def main():
    video, saida = sys.argv[1], sys.argv[2]
    nome = sys.argv[3] if len(sys.argv) > 3 else 'small'
    try:
        import ctranslate2
        gpu = ctranslate2.get_cuda_device_count() > 0
    except Exception:
        gpu = False
    modelo = WhisperModel(nome, device='cuda' if gpu else 'cpu', compute_type='float16' if gpu else 'int8')
    # vad_filter corta música e silêncio (reels costumam ter trilha por baixo)
    segs, info = modelo.transcribe(video, vad_filter=True, beam_size=5)
    texto = ' '.join(s.text.strip() for s in segs).strip()
    with open(saida, 'w', encoding='utf-8') as f:
        json.dump({'idioma': info.language, 'texto': texto, 'duracao': round(info.duration, 1)}, f, ensure_ascii=False)
    print(f'{info.language} {info.duration:.0f}s {len(texto.split())} palavras')


if __name__ == '__main__':
    main()
