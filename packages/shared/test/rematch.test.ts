import { expect, it } from 'vitest';
import { Table, parseRules } from '../src/index.ts';

function table() {
  const t = new Table(4, { goal: 12, flor: false, turnSeconds: 30, botDifficulty: 'competitivo' }, 'fuji');
  for (const [seat, id] of ['a', 'b'].entries()) { t.join(id, id); t.sit(id, seat); t.settle(id, seat); t.setReady(id, true); }
  for (const bot of t.addBots('a').added) t.settle(bot.id, bot.seat);
  expect(t.start('a')).toBe('ok');
  return t;
}
it('revanche exige novo pronto de todas as pessoas conectadas e só anfitrião começa', () => {
  const t = table();
  expect(t.setRematchReady('a', true)).toBe('partida-em-andamento');
  t.prepareRematch();
  expect(t.rematch('a')).toBe('faltam-prontos');
  t.setRematchReady('a', true);
  t.prepareRematch(); // reconexão/atualização não apaga confirmações
  expect(t.players.get('a')!.ready).toBe(true);
  expect(t.rematch('b')).toBe('so-anfitriao');
  expect(t.rematch('a')).toBe('faltam-prontos');
  t.setRematchReady('b', true);
  t.setConnected('b', false);
  expect(t.rematch('a')).toBe('mesa-incompleta');
  t.setConnected('b', true);
  const before = t.seatedIds();
  expect(t.rematch('a')).toBe('ok');
  expect(t.seatedIds()).toEqual(before);
  expect(t.scenery).toBe('fuji');
  expect(t.rules.botDifficulty).toBe('competitivo');
  expect(t.rematch('a')).toBe('partida-em-andamento');
});
it('cancelar pronto, sair ou voltar à espera mantém a mesa coerente', () => {
  const t = table(); t.prepareRematch();
  t.setRematchReady('a', true); t.setRematchReady('a', false);
  expect(t.rematch('a')).toBe('faltam-prontos');
  t.leave('a');
  expect(t.hostId).toBe('b');
  expect(t.occupant(0)!.bot).toBe(true);
  t.setRematchReady('b', true);
  expect(t.rematch('b')).toBe('ok');
  t.prepareRematch(); t.end('b');
  expect(t.rematchPending).toBe(false);
  expect(t.setRematchReady('b', true)).toBe('partida-em-andamento');
});
it('valida dificuldade e aceita contratos antigos', () => {
  expect(parseRules({}).botDifficulty ?? 'equilibrado').toBe('equilibrado');
  const base = parseRules({ botDifficulty: 'tranquilo' });
  expect(parseRules({ botDifficulty: 'hack' }, base).botDifficulty).toBe('tranquilo');
  expect(parseRules({ botDifficulty: 'competitivo' }).botDifficulty).toBe('competitivo');
});
