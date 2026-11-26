"""Narração expressiva local (Chatterbox pt-BR), uma frase por arquivo, conferida pelo Whisper.

Cada frase é gerada e ouvida de volta: se o Whisper entendeu outra coisa (palavra engolida, som inventado),
gera de novo com outra semente, até 4 vezes, e fica a melhor. Se nenhuma prestar, a frase sai na Supertonic
F2. A voz de referência (video/voz) foi desenhada por descrição no Qwen3-TTS VoiceDesign: não é voz de pessoa real.

uso: python voz.py <frases.json> <pasta_saida> <python_do_whisper ou ->
frases.json: [{"voz": texto falado, "tela": texto mostrado, "tom": 0 a 1}]
Última linha do stdout: JSON [{"dur": s, "nota": 0 a 1 ou null, "palavras": [{w, ini, fim}], "motor", "vezes"}]
"""
import difflib
import json
import os
import re
import subprocess
import sys
import types
import unicodedata
from pathlib import Path

os.environ['HF_HUB_OFFLINE'] = '1'      # nada sai deste PC
# o segmentador de chinês baixaria um modelo à toa
_m = types.ModuleType('spacy_pkuseg')
_m.pkuseg = lambda *a, **k: None
sys.modules['spacy_pkuseg'] = _m

import numpy as np
import soundfile as sf
import torch
from safetensors.torch import load_file
from chatterbox.mtl_tts import ChatterboxMultilingualTTS, MTLTokenizer, S3Gen, T3, T3Config, VoiceEncoder

torch.set_num_threads(min(10, os.cpu_count() or 4))
BASE = Path.home() / '.w4k3' / 'tts' / 'chatterbox'
D = BASE / 'modelo'
REF = Path(__file__).resolve().parent.parent / 'voz' / 'referencia.flac'
# exagero e apego ao texto medidos com o Whisper (2026-11-26): 0,4+0,3 x tom e 0,5 erram menos e variam mais o tom
BOA, RUIM, TENTATIVAS = 0.95, 0.8, 4


def carregar():
    ve = VoiceEncoder()
    ve.load_state_dict(load_file(D / 've.safetensors'))
    t3 = T3(T3Config.multilingual())
    t3.load_state_dict(load_file(D / 't3_pt_br.safetensors'))
    gen = S3Gen()
    gen.load_state_dict(load_file(D / 's3gen_v3.safetensors'), strict=False)
    tok = MTLTokenizer(str(D / 'grapheme_mtl_merged_expanded_v1.json'))
    m = ChatterboxMultilingualTTS(t3.eval(), gen.eval(), ve.eval(), tok, 'cpu')
    m.prepare_conditionals(str(REF), 0.7)
    return m


def norm(s):
    s = unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9 ]+', ' ', s).split()


def igual(a, b):
    return difflib.SequenceMatcher(None, ''.join(a), ''.join(b), autojunk=False).ratio()


class Ouvido:
    def __init__(self, py):
        self.p = None
        if py == '-' or not os.path.exists(py):
            return
        try:
            self.p = subprocess.Popen([py, str(Path(__file__).resolve().parent / 'conferir.py')], stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8')
            if self.p.stdout.readline().strip() != 'pronto':
                self.p = None
        except Exception:
            self.p = None

    def ouvir(self, arq):
        if not self.p:
            return None
        try:
            self.p.stdin.write(json.dumps(str(arq)) + '\n')
            self.p.stdin.flush()
            return json.loads(self.p.stdout.readline())
        except Exception:
            self.p = None
            return None


def aparar(x, sr, margem=0.06):
    """tira o silêncio das pontas"""
    q = max(1, int(sr * 0.01))
    e = np.array([np.sqrt((x[i:i + q] ** 2).mean()) for i in range(0, max(1, len(x) - q), q)])
    on = np.where(e > max(0.004, e.max() * 0.02))[0]
    if not len(on):
        return x
    return x[max(0, int((on[0] * 0.01 - margem) * sr)):min(len(x), int((on[-1] * 0.01 + 0.01 + margem) * sr))]


def sobra(ouv, alvo):
    """onde cortar o som inventado antes e depois da fala (o Whisper ouviu palavras a mais nas pontas)"""
    o = [''.join(norm(w['w'])) for w in ouv]
    bl = [b for b in difflib.SequenceMatcher(None, alvo, o, autojunk=False).get_matching_blocks() if b.size]
    if not bl:
        return None, None
    ini = fim = None
    if bl[0].a == 0 and bl[0].b > 0:
        ini = max(0.0, ouv[bl[0].b]['ini'] - 0.08)
    u = bl[-1]
    if u.a + u.size == len(alvo) and u.b + u.size < len(o):
        fim = (ouv[u.b + u.size - 1]['fim'] + ouv[u.b + u.size]['ini']) / 2 + 0.03
    return ini, fim


def pontas(x, sr):
    n = min(len(x) // 2, int(sr * 0.012))
    x = x.copy()
    if n:
        x[:n] *= np.linspace(0, 1, n)
        x[-n:] *= np.linspace(1, 0, n)
    return x


def main():
    frases = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    saida = Path(sys.argv[2])
    saida.mkdir(parents=True, exist_ok=True)
    M = carregar()
    W = Ouvido(sys.argv[3] if len(sys.argv) > 3 else '-')
    st, res, tmp = None, [], saida / 'tmp.wav'

    def avaliar(x, f):
        x = aparar(x, M.sr)
        sf.write(tmp, x, M.sr)
        ouv = W.ouvir(tmp)
        if ouv is None:
            return x, None, []
        a, b = sobra(ouv, norm(f['voz']))
        if a is not None or b is not None:
            x = aparar(x[int((a or 0) * M.sr):int(b * M.sr) if b else len(x)], M.sr)
            sf.write(tmp, x, M.sr)
            ouv = W.ouvir(tmp) or []
        o = norm(' '.join(w['w'] for w in ouv))
        nota = max(igual(norm(f['voz']), o), igual(norm(f['tela']), o))
        # fala comprida demais para o texto: gagueira ou som inventado que o Whisper ignorou
        longo = len(x) / M.sr / (len(f['voz']) / 14 + 1.2)
        if longo > 1.4:
            nota -= 0.2 * min(2, longo - 0.4)
        # entonação trocada: afirmação que soou como pergunta, ou pergunta que soou como afirmação
        fim = ouv[-1]['w'][-1:] if ouv else ''
        if fim and (fim == '?') != f['voz'].endswith('?'):
            nota -= 0.12
        return x, max(0.0, nota), ouv

    for i, f in enumerate(frases):
        melhor, k = None, 0
        for k in range(TENTATIVAS):
            torch.manual_seed(1000 + i * 31 + k * 7)
            x = M.generate(f['voz'], 'pt', exaggeration=0.4 + 0.3 * f['tom'], cfg_weight=0.5, temperature=0.8 - 0.06 * k)
            c = avaliar(x.numpy().reshape(-1), f)
            if melhor is None or (c[1] or 0) > (melhor[1] or 0):
                melhor = c
            # nome próprio o Whisper quase nunca escreve igual: na segunda vez aceita um pouco menos
            if c[1] is None or c[1] >= BOA or (k >= 1 and melhor[1] >= 0.92):
                break
        motor = 'chatterbox'
        if melhor[1] is not None and melhor[1] < RUIM:
            try:
                import librosa
                if st is None:
                    from supertonic import TTS
                    st = TTS(model='supertonic-3', model_dir=str(BASE / 'supertonic-3'), auto_download=False)
                y, _ = st.synthesize(f['voz'], voice_style=st.get_voice_style('F2'), lang='pt', total_steps=12, speed=1.1)
                y = librosa.resample(np.asarray(y, dtype=np.float32).reshape(-1), orig_sr=st.sample_rate, target_sr=M.sr)
                c = avaliar(y, f)
                if c[1] is not None and c[1] > melhor[1]:
                    melhor, motor = c, 'supertonic'
            except Exception as e:
                print('supertonic falhou:', e, file=sys.stderr)
        x, nota, ouv = melhor
        # mesmo volume em todas as frases
        r = float(np.sqrt((x ** 2).mean())) or 1.0
        x = pontas(x * min(0.09 / r, 0.97 / (float(abs(x).max()) or 1.0)), M.sr)
        sf.write(saida / f'f{i:02d}.wav', x, M.sr, subtype='PCM_16')
        print(f'{i + 1}/{len(frases)} nota {nota} em {k + 1}x ({motor})', file=sys.stderr, flush=True)
        res.append({'dur': len(x) / M.sr, 'nota': None if nota is None else round(nota, 3), 'palavras': ouv, 'motor': motor, 'vezes': k + 1,
                    'ouvido': ' '.join(w['w'] for w in ouv)})
    tmp.unlink(missing_ok=True)
    print(json.dumps(res))


main()
