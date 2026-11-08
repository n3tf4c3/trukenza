"""Falas locais do Trukenza com o Kokoro-82M (Apache 2.0), uma voz por personagem.

Entrada: /entrada/catalogo.json (frases e elenco de apps/web/src/performance.ts).
Saída: /saida/<personagem>.mp3 (todas as falas em sequência) e /saida/falas.json (início e duração).
"""
import hashlib, json, os, subprocess, tempfile
import numpy as np, soundfile as sf, torch
from kokoro import KPipeline

SR = 24000
GAP = 0.3  # silêncio entre falas no arquivo: folga para o atraso do codificador MP3
catalogo = json.load(open('/entrada/catalogo.json', encoding='utf-8'))
linhas, elenco, desafios = catalogo['lines'], catalogo['cast'], set(catalogo['challenges'])
pipe = KPipeline(lang_code='p', repo_id='hexgrad/Kokoro-82M')


def voz(mix):
    total = sum(mix.values())
    return sum(pipe.load_voice(nome) * (peso / total) for nome, peso in mix.items())


def tom(audio, semitons):
    if abs(semitons) < 0.05:
        return audio
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, 'a.wav'), os.path.join(d, 'b.wav')
        sf.write(a, audio, SR)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a, '-af', f'rubberband=pitch={2 ** (semitons / 12):.5f}:pitchq=quality', b], check=True)
        return sf.read(b, dtype='float32')[0]


def acabamento(audio, desafio):
    nivel = np.abs(audio)
    limiar = nivel.max() * 0.02
    ativos = np.nonzero(nivel > limiar)[0]
    audio = audio[max(0, ativos[0] - int(0.02 * SR)):ativos[-1] + int(0.06 * SR)]
    pico = np.abs(audio).max()
    # Compressão suave (a do grito aprovado em 2026-11-06 é 1,7); depois pico de 0,85.
    audio = np.tanh(audio / pico * (1.7 if desafio else 1.25))
    audio = audio / np.abs(audio).max() * 0.85
    borda = int(0.008 * SR)
    rampa = np.linspace(0, 1, borda, dtype=np.float32)
    audio[:borda] *= rampa
    audio[-borda:] *= rampa[::-1]
    return audio.astype(np.float32)


mapa = {}
for personagem, ajuste in elenco.items():
    estilo = voz(ajuste['mix'])
    partes, indice, cursor = [], {}, GAP
    for chave, frases in linhas.items():
        indice[chave] = []
        for frase in frases:
            bruto = np.concatenate([a.numpy() if torch.is_tensor(a) else a for _, _, a in pipe(frase, voice=estilo, speed=ajuste['speed'])])
            fala = acabamento(tom(bruto, ajuste['semitones']), chave in desafios)
            indice[chave].append([round(cursor, 3), round(len(fala) / SR, 3)])
            partes += [fala, np.zeros(int(GAP * SR), np.float32)]
            cursor += len(fala) / SR + GAP
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'f.wav')
        sf.write(wav, np.concatenate([np.zeros(int(GAP * SR), np.float32)] + partes), SR)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '56k',
                        f'/saida/{personagem}.mp3'], check=True)
    mapa[personagem] = indice
    print(personagem, f'{cursor:.1f} s', os.path.getsize(f'/saida/{personagem}.mp3') // 1024, 'KB', flush=True)

# A versão cobre o catálogo e o áudio: o Kokoro não repete bit a bit, e o índice novo nunca pode
# apontar para um MP3 antigo guardado no navegador (o endereço do MP3 leva esta versão).
soma = hashlib.sha256(json.dumps(catalogo, sort_keys=True).encode())
for personagem in sorted(mapa):
    soma.update(open(f'/saida/{personagem}.mp3', 'rb').read())
versao = soma.hexdigest()[:10]
json.dump({'version': versao, 'sampleRate': SR, 'characters': mapa}, open('/saida/falas.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('falas.json', versao)
