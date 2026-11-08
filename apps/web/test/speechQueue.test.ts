import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portugueseVoices, SpeechQueue, type SpeechLine } from '../src/speechQueue.ts';

function setup() {
  let time = 0;
  let canceled = 0;
  const requests: { line: SpeechLine; start: () => void; end: (failed?: boolean) => void }[] = [];
  const changes: (SpeechLine | null)[] = [];
  const q = new SpeechQueue({
    speak(line, start, end) { requests.push({ line, start, end }); },
    cancel() { canceled++; },
  }, line => changes.push(line), () => time);
  const add = (text: string) => q.enqueue({ text, at: time, seat: 0, rate: 1, pitch: 1 });
  return { q, add, requests, changes, advance(ms: number) { time += ms; }, canceled: () => canceled };
}

test('falas mantêm ordem e só animam/abaixam música quando a voz começa', () => {
  const s = setup();
  s.add('Truco!'); s.add('Quero!');
  assert.equal(s.requests.length, 1);
  assert.equal(s.changes.length, 0);
  s.requests[0]!.start();
  assert.equal(s.changes.at(-1)?.text, 'Truco!');
  s.requests[0]!.end();
  assert.equal(s.requests[1]!.line.text, 'Quero!');
  s.requests[1]!.end();
  s.q.cancel();
});

test('sair, mutar ou esconder cancela a fila e ignora callbacks atrasados', () => {
  const s = setup();
  s.add('Truco!'); s.add('Quero!'); s.requests[0]!.start();
  s.q.cancel();
  s.requests[0]!.start(); s.requests[0]!.end();
  assert.equal(s.requests.length, 1);
  assert.equal(s.changes.at(-1), null);
  assert.equal(s.canceled(), 1);
  s.add('Envido!');
  assert.equal(s.requests.length, 2);
  s.q.cancel();
});

test('descarta conversa vencida e limita rajadas a três falas pendentes', () => {
  const s = setup();
  s.add('primeira');
  for (let n = 0; n < 10; n++) s.add(String(n));
  s.requests[0]!.end();
  assert.equal(s.requests[1]!.line.text, '7');
  s.advance(2500);
  s.requests[1]!.end();
  assert.equal(s.requests.length, 2);
  s.q.cancel();
});

test('falha síncrona e motor que não responde não deixam música abaixada', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup();
  s.add('Truco!');
  t.mock.timers.tick(2201);
  assert.equal(s.canceled(), 1);
  assert.equal(s.changes.at(-1), null);
  s.requests[0]!.start();
  assert.equal(s.changes.at(-1), null);
  let failure = false;
  const broken = new SpeechQueue({ speak() { throw Error('indisponível'); }, cancel() {} }, (_, failed) => { failure = !!failed; });
  broken.enqueue({ text: 'Quero', seat: 0, pitch: 1, rate: 1, at: performance.now() });
  assert.equal(failure, true);
  s.q.cancel(); broken.cancel();
});

test('seleção prioriza português brasileiro local e nunca escolhe outro idioma', () => {
  const voices = [
    { name: 'English', lang: 'en-US', localService: true },
    { name: 'Portugal', lang: 'pt-PT', localService: true },
    { name: 'Brasil online', lang: 'pt-BR', localService: false },
    { name: 'Brasil local', lang: 'pt_BR', localService: true },
  ];
  assert.deepEqual(portugueseVoices(voices).map(v => v.name), ['Brasil local', 'Brasil online', 'Portugal']);
  assert.equal(portugueseVoices([voices[0]!]).length, 0);
});

test('fim sem início é falha de reprodução, não confirmação de áudio', () => {
  let failed = false;
  const q = new SpeechQueue({ speak(_, __, end) { end(); }, cancel() {} }, (_, error) => { failed = !!error; });
  q.enqueue({ text: 'Truco!', seat: 0, pitch: 1, rate: 1, at: performance.now() });
  assert.equal(failed, true);
  q.cancel();
});
