// Truco Espanhol: cada arquivo cuida de uma parte das regras, e `match.ts` junta tudo numa partida.
export * from './cards.ts'; // baralho e força das cartas (SpanishDeck, SpanishCardRanking)
export * from './deal.ts'; // embaralhar e distribuir
export * from './config.ts'; // perfil de regras (SpanishRulesConfig, GAUDERIO_24)
export * from './tricks.ts'; // vazas e pardas (SpanishTrickResolver)
export * from './envido.ts'; // Envido (SpanishEnvido)
export * from './flor.ts'; // Flor (SpanishFlor)
export * from './scoring.ts'; // placar e histórico (SpanishScoring)
export * from './match.ts'; // fases, turnos, Truco e a partida (SpanishMatchState, SpanishTrucoBet)
export * from './bot.ts'; // o jogador do computador
export * from './handSummary.ts';
