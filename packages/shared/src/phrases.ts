/**
 * Frases rápidas da mesa: provocação, parceria e conversa de bar, faladas pela voz do personagem.
 * Texto fixo do catálogo: não há texto livre, nome nem carta, e nada indica o que alguém tem na mão.
 */
export const PHRASE_GROUPS = { provocar: 'Provocar', parceria: 'Parceria', mesa: 'Mesa' } as const;
export type PhraseGroup = keyof typeof PHRASE_GROUPS;
export interface Phrase {
  text: string;
  group: PhraseGroup;
  /** Quem fala ergue o copo e dá um gole. */
  drink?: boolean;
}

export const PHRASE_IDS = [
  'medo', 'blefe', 'joga', 'chora', 'sorte',
  'boa', 'bah', 'calma',
  'saude', 'gelada', 'farofa', 'mais-uma',
] as const;
export type PhraseId = (typeof PHRASE_IDS)[number];

export const PHRASES: Record<PhraseId, Phrase> = {
  medo: { text: 'Tá com medo, tchê?', group: 'provocar' },
  blefe: { text: 'Isso aí é blefe!', group: 'provocar' },
  joga: { text: 'Joga logo, que a carne esfria!', group: 'provocar' },
  chora: { text: 'Pode chorar, é de graça!', group: 'provocar' },
  sorte: { text: 'Que sorte, hein?', group: 'provocar' },
  boa: { text: 'Boa, parceiro!', group: 'parceria' },
  bah: { text: 'Bah, que jogada!', group: 'parceria' },
  calma: { text: 'Calma, ainda tem jogo.', group: 'parceria' },
  saude: { text: 'Saúde, pessoal!', group: 'mesa', drink: true },
  gelada: { text: 'Desce mais uma gelada!', group: 'mesa', drink: true },
  farofa: { text: 'Passa a farofa aí!', group: 'mesa' },
  'mais-uma': { text: 'Bora mais uma?', group: 'mesa' },
};

/** Intervalo mínimo entre frases do mesmo jogador: conversa, não enxurrada. */
export const PHRASE_COOLDOWN_MS = 4000;
export const MSG_PHRASE = 'frase';
export const MSG_TABLE_PHRASE = 'frase-mesa';
export interface PhraseRequest { phrase: PhraseId }
export interface TablePhrase extends PhraseRequest { id: number; seat: number }

export function parsePhraseRequest(raw: unknown): PhraseRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const phrase = (raw as Record<string, unknown>).phrase;
  if (typeof phrase !== 'string' || !(PHRASE_IDS as readonly string[]).includes(phrase)) return null;
  return { phrase: phrase as PhraseId };
}

export function parseTablePhrase(raw: unknown): TablePhrase | null {
  const request = parsePhraseRequest(raw);
  if (!request) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'number' || !Number.isSafeInteger(r.id) || r.id < 1 ||
      typeof r.seat !== 'number' || !Number.isInteger(r.seat) || r.seat < 0 || r.seat > 3) return null;
  return { ...request, id: r.id, seat: r.seat };
}
