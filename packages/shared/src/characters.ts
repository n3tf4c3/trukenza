/**
 * Personagens jogáveis. Personagem e jogador são coisas diferentes: vários jogadores podem
 * escolher o mesmo personagem. As cores servem ao retrato 2D e ao modelo 3D.
 */
export const CHARACTER_IDS = ['neymt', 'presuntinho', 'moleti', 'baiaca', 'luistesoura', 'sardinha', 'gordodofusca', 'tiba', 'negon'] as const;
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
  luistesoura: { id: 'luistesoura', name: 'Luis Tesoura', tagline: 'Careca, caprichoso e bom de corte.', main: '#263e50', accent: '#d99a52' },
  sardinha: { id: 'sardinha', name: 'Sardinha', tagline: 'Um olho no jogo, outro no peixe da blusa.', main: '#197d83', accent: '#ffb44a' },
  gordodofusca: { id: 'gordodofusca', name: 'Gordo do Fusca', tagline: 'Black power no alto, Fusca na estrada e truco na mesa.', main: '#b9502e', accent: '#f2c45b' },
  tiba: { id: 'tiba', name: 'Tiba', tagline: 'Corinthiano fanático: canta pelo Timão e grita truco!', main: '#202126', accent: '#f5f2e9' },
  negon: { id: 'negon', name: 'Negon', tagline: 'Magrinho, cabeçudo e de sorriso com aparelho.', main: '#396bbb', accent: '#f2c14e' },
};

export const DEFAULT_CHARACTER: CharacterId = 'presuntinho';

/** Valida a escolha vinda da rede; qualquer outra coisa devolve null. */
export function parseCharacter(raw: unknown): CharacterId | null {
  return (CHARACTER_IDS as readonly unknown[]).includes(raw) ? (raw as CharacterId) : null;
}
