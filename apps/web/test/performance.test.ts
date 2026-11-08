import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gesturePose, signalPose, VOICE_CAST, VOICE_LINES, VOICE_STYLE, type GestureKind } from '../src/performance.ts';
import { PHRASE_IDS, PHRASES } from '../../../packages/shared/src/phrases.ts';
import { SIGNAL_IDS } from '../../../packages/shared/src/signals.ts';
import { CHARACTER_IDS } from '../../../packages/shared/src/characters.ts';

test('gestos retornam ao repouso sem saltos ou rotações acumuladas', () => {
  const kinds: GestureKind[] = ['canto', 'quero', 'recusa', 'jogar', 'vaza', 'vitoria'];
  const rest = gesturePose(undefined, 0);
  for (const kind of kinds) {
    assert.deepEqual(gesturePose(kind, -0.1), rest);
    assert.deepEqual(gesturePose(kind, 0), rest);
    assert.deepEqual(gesturePose(kind, 2), rest);
    let previous = rest;
    for (let at = 0.01; at < 2; at += 0.01) {
      const pose = gesturePose(kind, at);
      for (const key of Object.keys(pose) as (keyof typeof pose)[]) {
        assert.ok(Number.isFinite(pose[key]));
        assert.ok(Math.abs(pose[key] - previous[key]) < 0.2, `${kind}/${key} sem salto em ${at}`);
      }
      previous = pose;
    }
  }
  assert.notDeepEqual(gesturePose('quero', 0.5), gesturePose('recusa', 0.5));
  assert.equal(gesturePose('jogar', 0.42).arm, 0.4, 'alcance mantido até a carta pousar');
});

test('todo personagem tem registro vocal moderado, sem tom extremo', () => {
  for (const id of CHARACTER_IDS) {
    assert.ok(VOICE_STYLE[id].pitch >= 0.8 && VOICE_STYLE[id].pitch <= 1.4);
    assert.ok(VOICE_STYLE[id].rate >= 0.9 && VOICE_STYLE[id].rate <= 1.2);
    const cast = VOICE_CAST[id];
    assert.ok(cast.speed >= 0.85 && cast.speed <= 1.15 && Math.abs(cast.semitones) <= 6, id);
    assert.ok(Object.values(cast.mix).every(w => w! > 0) && Object.keys(cast.mix).length > 0, id);
  }
  // Nove timbres diferentes: nenhum par de personagens com a mesma mistura, tom e velocidade.
  assert.equal(new Set(CHARACTER_IDS.map(id => JSON.stringify(VOICE_CAST[id]))).size, CHARACTER_IDS.length);
});

test('sinais faciais são distintos, piscam olhos independentes e voltam ao repouso', () => {
  const rest = signalPose(undefined, 0);
  for (const id of SIGNAL_IDS) {
    assert.deepEqual(signalPose(id, -1), rest);
    assert.deepEqual(signalPose(id, 2), rest);
    assert.notDeepEqual(signalPose(id, 0.6), rest);
    assert.ok(Object.values(signalPose(id, 0.6)).every(Number.isFinite));
  }
  assert.equal(signalPose('piscada', 0.6).rightEye, 1);
  assert.ok(signalPose('piscada', 0.6).leftEye < 0.1);
  assert.ok(signalPose('olhos', 0.6).rightEye < 0.1);
  assert.equal(signalPose('boca-direita', 0.6).mouthX, -signalPose('boca-esquerda', 0.6).mouthX);
});

test('cada frase rápida tem uma única fala, com o mesmo texto do balão', () => {
  for (const id of PHRASE_IDS) assert.deepEqual(VOICE_LINES[`frase-${id}`], [PHRASES[id].text]);
  assert.equal(Object.keys(VOICE_LINES).filter(k => k.startsWith('frase-')).length, PHRASE_IDS.length);
});
