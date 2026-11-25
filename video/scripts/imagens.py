"""Ilustrações locais com SD-Turbo (Stability AI Community License), só no processador.

Cada pedido vira uma gravura em preto e branco, sempre com o mesmo estilo; a cor neon e o pontilhado
entram depois, no vídeo, como em todas as outras cenas. Nada sai deste PC.

uso: python imagens.py <pedidos.json> <pasta_saida>
pedidos.json: ["assunto em inglês", ...]   →   grava i00.png, i01.png...
"""
import json
import os
import sys
import time
from pathlib import Path

os.environ['HF_HUB_OFFLINE'] = '1'
import torch
from diffusers import AutoPipelineForText2Image

torch.set_num_threads(min(10, os.cpu_count() or 4))
MODELO = Path.home() / '.w4k3' / 'imagem' / 'sd-turbo'
# o estilo é fixo: só o assunto muda de um vídeo para outro
ESTILO = ('linocut print illustration, stark black and white, high contrast, bold graphic shapes, deep black shadows, '
          'single clear subject, centered, plain background, no text, no letters, no logo, ')

def main():
    pedidos = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    saida = Path(sys.argv[2])
    saida.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    pipe = AutoPipelineForText2Image.from_pretrained(str(MODELO), torch_dtype=torch.float32, variant='fp16', local_files_only=True)
    pipe.set_progress_bar_config(disable=True)
    for i, assunto in enumerate(pedidos):
        g = torch.Generator().manual_seed(4242 + i)
        img = pipe(ESTILO + assunto, num_inference_steps=2, guidance_scale=0.0, width=512, height=512, generator=g).images[0]
        img.convert('L').save(saida / f'i{i:02d}.png')
        print(f'{i + 1}/{len(pedidos)} {time.time() - t0:.0f} s: {assunto}', file=sys.stderr, flush=True)
    print(json.dumps([f'i{i:02d}.png' for i in range(len(pedidos))]))


main()
