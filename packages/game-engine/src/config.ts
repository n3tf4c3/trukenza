/**
 * Configuração de regras do Truco Espanhol. Um perfil fixa todas as variações regionais de uma partida:
 * nunca se misturam regras de perfis diferentes. Tudo o que depende de região fica aqui, e o resto do
 * motor só lê estes números. Regras completas do perfil em docs/regras.md.
 */

export type Goal = 12 | 24;

export interface SpanishRulesConfig {
  /** Identificador do perfil (vai para o histórico e para a tela). */
  profile: 'GAUDERIO_24';
  /** Tentos para ganhar a partida. Em 24, de 0 a 11 são as "malas" e de 12 a 23 as "boas". */
  goal: Goal;
  /** Flor habilitada (padrão do perfil). */
  flor: boolean;
  /** Quem abre a vaza seguinte a uma parda: o mão da rodada (ou o próximo ativo depois dele). */
  pardaLeader: 'mao';
  /** Na mesa de 4, só os dois últimos da ordem da primeira vaza podem abrir o Envido. */
  envidoOpenersFour: 'ultimos-dois';
  /** Valor de cada canto do Envido aceito; a recusa vale a soma dos cantos anteriores, no mínimo `refusedMin`. */
  envido: { envido: number; realEnvido: number; refusedMin: number };
  /** Flor: tentos por Flor participante e multiplicador da Contra-Flor aceita. A Contra-Flor e o Resto vale a Falta. */
  florValues: { perFlor: number; contraFlorMultiplier: number };
  /**
   * Truco antes do Envido: na primeira vaza, a equipe do mão pede Truco antes de a outra ter tido a vez de
   * cantar o Envido. Se a outra contesta, o Envido da mão queima e a infratora perde estes tentos.
   */
  trucoBeforeEnvidoPenalty: number;
}

export const GAUDERIO_24: SpanishRulesConfig = {
  profile: 'GAUDERIO_24',
  goal: 24,
  flor: true,
  pardaLeader: 'mao',
  envidoOpenersFour: 'ultimos-dois',
  envido: { envido: 2, realEnvido: 3, refusedMin: 1 },
  florValues: { perFlor: 3, contraFlorMultiplier: 2 },
  trucoBeforeEnvidoPenalty: 2,
};

/** O perfil Gaudério com as duas escolhas da sala: meta (12 ou 24) e Flor ligada ou não. */
export function gauderio(options: { goal?: Goal; flor?: boolean } = {}): SpanishRulesConfig {
  return { ...GAUDERIO_24, goal: options.goal ?? GAUDERIO_24.goal, flor: options.flor ?? GAUDERIO_24.flor };
}

/** Falta (Falta Envido, Contra-Flor e o Resto): o que falta para a equipe que está na frente ganhar. */
export function faltaValue(config: SpanishRulesConfig, score: readonly [number, number]): number {
  return Math.max(1, config.goal - Math.max(score[0], score[1]));
}
