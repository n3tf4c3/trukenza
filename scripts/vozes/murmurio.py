"""Murmúrio de bolicho: conversas de fundo sobrepostas e abafadas, em laço sem emenda audível.

Usa as três vozes brasileiras do Kokoro-82M (Apache 2.0) em tons e velocidades variados.
Saída: /saida/ambiente-bar.mp3. Nada inteligível: o filtro tira a articulação das palavras.
"""
import os, random, subprocess, tempfile
import numpy as np, soundfile as sf, torch
from kokoro import KPipeline

SR, LOOP = 24000, 24.0
FRASES = [
    'Mas bah, tchê, que calor danado hoje.', 'E o gado lá da fazenda, como é que tá?', 'Passa o mate pra cá, compadre.',
    'Ontem choveu a noite inteira lá pras bandas do rio.', 'Esse time não ganha de ninguém, vou te contar.',
    'Me vê mais uma gelada aí, por favor.', 'Tu viu o preço da erva? Subiu de novo.', 'Amanhã cedo eu vou pra cidade.',
    'Olha, eu nunca vi uma coisa dessas.', 'A carne tá no ponto, pode cortar.', 'Quem foi que deixou a porteira aberta?',
    'É verdade, foi bem assim mesmo.', 'Ah, mas isso aí já é outra história.', 'Pois é, a vida tá corrida.',
]
pipe = KPipeline(lang_code='p', repo_id='hexgrad/Kokoro-82M')
rng = random.Random(1808)
total = np.zeros(int(SR * LOOP), np.float32)
vozes = [pipe.load_voice(v) for v in ('pm_alex', 'pm_santa', 'pf_dora')]
for k in range(30):
    frase = rng.choice(FRASES)
    peso = np.array([rng.random() for _ in vozes]); peso /= peso.sum()
    estilo = sum(v * float(w) for v, w in zip(vozes, peso))
    audio = np.concatenate([a.numpy() if torch.is_tensor(a) else a for _, _, a in pipe(frase, voice=estilo, speed=rng.uniform(0.9, 1.1))])
    audio = audio / max(1e-6, np.abs(audio).max()) * rng.uniform(0.25, 0.6)
    inicio = int(rng.uniform(0, LOOP) * SR)
    for i in range(len(audio)):  # o que passa do fim volta no começo: o laço emenda sem corte
        total[(inicio + i) % len(total)] += audio[i]
with tempfile.TemporaryDirectory() as d:
    bruto = os.path.join(d, 'm.wav')
    sf.write(bruto, total / np.abs(total).max() * 0.8, SR)
    # Abafado e com reflexões curtas de sala: vira burburinho do balcão, não diálogo.
    filtro = 'lowpass=f=1100,highpass=f=140,aecho=0.8:0.6:45|90:0.35|0.22,volume=0.9'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', bruto, '-af', filtro, '-t', str(LOOP), '-ac', '1', '-ar', str(SR),
                    '-c:a', 'libmp3lame', '-b:a', '48k', '/saida/ambiente-bar.mp3'], check=True)
print('ambiente-bar.mp3', os.path.getsize('/saida/ambiente-bar.mp3') // 1024, 'KB')
