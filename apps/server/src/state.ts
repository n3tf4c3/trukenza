import { schema, t, type SchemaType } from '@colyseus/schema';

/** Jogador como os outros o veem. As cartas da mão nunca vão aqui, só a quantidade. */
export const PlayerSchema = schema(
  {
    name: t.string(),
    character: t.string(),
    /** Índice da cadeira; -1 = de pé. */
    seat: t.int8(),
    ready: t.boolean(),
    connected: t.boolean(),
    /** Jogador do computador. */
    bot: t.boolean(),
    /** Cartas na mão (o cliente desenha as dos outros viradas para baixo). */
    cards: t.uint8(),
  },
  'Player',
);
export type PlayerSchema = SchemaType<typeof PlayerSchema>;

export const SeatSchema = schema(
  {
    /** livre | reservada | ocupada | desconectada (SeatStatus). */
    status: t.string(),
    /** Sessão de quem está na cadeira; vazio se livre. */
    playerId: t.string(),
  },
  'Seat',
);
export type SeatSchema = SchemaType<typeof SeatSchema>;

export const TableState = schema(
  {
    seatCount: t.uint8(),
    /** espera | jogando (Phase). */
    phase: t.string(),
    hostId: t.string(),
    /** Regras da mesa (o anfitrião muda na espera). */
    goal: t.uint8(),
    flor: t.boolean(),
    turnSeconds: t.uint8(),
    /** A partida em andamento: JSON da visão pública do motor (`MatchView` + relógio); vazio fora dela. */
    game: t.string(),
    players: t.map(PlayerSchema),
    seats: t.array(SeatSchema),
  },
  'TableState',
);
export type TableState = SchemaType<typeof TableState>;
