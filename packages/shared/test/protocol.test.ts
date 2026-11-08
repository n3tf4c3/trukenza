import { describe, expect, it } from 'vitest';
import {
  CHARACTER_IDS,
  normalizeRoomCode,
  parseCharacter,
  parseCharacterMessage,
  parseName,
  parseReadyMessage,
  parseRoomList,
  parseRules,
  parseActionVersion,
  parseSeatCount,
  parseSitMessage,
  sessionForServer,
} from '../src/index.ts';

describe('validação do que vem da rede', () => {
  it('nomes', () => {
    expect(parseName('  João   da  Silva ')).toBe('João da Silva');
    expect(parseName('Zé_2.0-x')).toBe('Zé_2.0-x');
    for (const bad of ['', '   ', '<b>oi</b>', 'a'.repeat(17), 5, null]) expect(parseName(bad)).toBeNull();
    expect(parseName('ab\ncd')).toBe('ab cd');
  });

  it('personagem, cadeira, pronto e tamanho da mesa', () => {
    for (const character of CHARACTER_IDS) {
      expect(parseCharacter(character)).toBe(character);
      expect(parseCharacterMessage({ character })).toBe(character);
    }
    expect(parseCharacter('outro')).toBeNull();
    expect(parseCharacterMessage({ character: 'neymt' })).toBe('neymt');
    expect(parseCharacterMessage('neymt')).toBeNull();
    expect(parseSitMessage({ seat: 3 })).toBe(3);
    for (const bad of [{ seat: 4 }, { seat: -1 }, { seat: 1.5 }, { seat: '1' }, null, 1]) expect(parseSitMessage(bad)).toBeNull();
    expect(parseReadyMessage({ ready: false })).toBe(false);
    expect(parseReadyMessage({ ready: 'sim' })).toBeNull();
    expect(parseSeatCount(4)).toBe(4);
    expect(parseSeatCount(3)).toBe(2);
    expect(parseSeatCount(undefined)).toBe(2);
  });

  it('código de sala', () => {
    expect(normalizeRoomCode('ab-cd 23')).toBe('ABCD23');
    expect(normalizeRoomCode('ABCD2O')).toBeNull();
    expect(normalizeRoomCode('ABC')).toBeNull();
  });

  it('lista de salas: descarta o que foge do formato e esconde nomes da privada', () => {
    const rooms = parseRoomList([
      { code: 'ABCD23', seats: 4, players: 2, bots: 1, names: ['Ana', '<x>'], playing: false, goal: 12, flor: false },
      { code: 'ABCD23', seats: 2, players: 1, bots: 3 },
      { code: null, seats: 2, players: 1, names: ['Bia'], playing: true },
      { code: 'ABCD23', seats: 3, players: 1 },
      { code: 'ABCD23', seats: 2, players: 3 },
      'lixo',
    ]);
    expect(rooms).toEqual([
      { code: 'ABCD23', seats: 4, players: 2, bots: 1, names: ['Ana'], playing: false, goal: 12, flor: false },
      { code: null, seats: 2, players: 1, bots: 0, names: [], playing: true, goal: 24, flor: true },
    ]);
    expect(parseRoomList({})).toEqual([]);
  });

  it('regras da mesa: padrão Gaudério de 24 com Flor; valores fora da lista ficam no padrão', () => {
    expect(parseRules(undefined)).toEqual({ goal: 24, flor: true, turnSeconds: 30 });
    expect(parseRules({ goal: 12, flor: false, turnSeconds: 60 })).toEqual({ goal: 12, flor: false, turnSeconds: 60 });
    expect(parseRules({ goal: 30, flor: 'nao', turnSeconds: 5 })).toEqual({ goal: 24, flor: true, turnSeconds: 30 });
    expect(parseRules({ flor: false }, { goal: 12, flor: true, turnSeconds: 15 })).toEqual({ goal: 12, flor: false, turnSeconds: 15 });
    expect(parseActionVersion({ version: 3 })).toBe(3);
    for (const bad of [{ version: -1 }, { version: 1.5 }, {}, null]) expect(parseActionVersion(bad)).toBeNull();
  });

  it('sessão guardada só vale para o servidor que a emitiu', () => {
    const saved = { server: 'ws://localhost:2580', code: 'ABCD23', token: 't' };
    expect(sessionForServer(saved, 'WS://localhost:2580/')).toEqual(saved);
    expect(sessionForServer(saved, 'wss://outro.exemplo')).toBeNull();
    expect(sessionForServer({ ...saved, token: '' }, saved.server)).toBeNull();
    expect(sessionForServer('x', saved.server)).toBeNull();
  });
});
