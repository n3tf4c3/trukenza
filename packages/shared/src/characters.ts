/**
 * Personagens jogáveis. Personagem e jogador são coisas diferentes: vários jogadores podem
 * escolher o mesmo personagem. As cores servem ao retrato 2D e ao boneco provisório 3D.
 */
export const CHARACTER_IDS = ['neymt', 'presuntinho', 'moleti', 'baiaca'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export interface CharacterInfo {
  id: CharacterId;
  name: string;
  /** Uma linha de personalidade, para a tela de escolha. */
  tagline: string;
  /** Cor principal (roupa) e de destaque (acessório), em hexadecimal. */
  main: string;
  accent: string;
}

export const CHARACTERS: Record<CharacterId, CharacterInfo> = {
  neymt: { id: 'neymt', name: 'NeyMT', tagline: 'Teatral, ousado e provocador.', main: '#7b2fbe', accent: '#ffcf33' },
  presuntinho: { id: 'presuntinho', name: 'Presuntinho', tagline: 'Brincalhão, competitivo e atrapalhado.', main: '#ff9fb4', accent: '#3a8fd9' },
  moleti: { id: 'moleti', name: 'Moleti', tagline: 'Confiante, sertanejo e bom de prosa.', main: '#c4432b', accent: '#e8b04a' },
  baiaca: { id: 'baiaca', name: 'Baiaca', tagline: 'Festivo, ritmado e carismático.', main: '#d62828', accent: '#2a9d3f' },
};

export const DEFAULT_CHARACTER: CharacterId = 'presuntinho';

/** Valida a escolha vinda da rede; qualquer outra coisa devolve null. */
export function parseCharacter(raw: unknown): CharacterId | null {
  return (CHARACTER_IDS as readonly unknown[]).includes(raw) ? (raw as CharacterId) : null;
}
