/** Medidas da cena, em metros. A mesa fica na origem; +z aponta para a câmera de visão geral. */
export const TABLE_RADIUS = 1.5;
export const FELT_RADIUS = 1.27;
export const TABLE_HEIGHT = 0.78;
export const CHAIR_RADIUS = 2.1;
export const SEAT_HEIGHT = 0.48;
export const TABLE_CARD_WIDTH = 0.4;
export const CARD_THICKNESS = 0.0012;

/** Pouso das cartas: todos os cantos dentro do tampo e uma camada por carta, sem planos coincidentes. */
export function tableCardPosition(seat: number, seats: number, trick: number, viewAngle: number): [number, number, number] {
  const a = seatAngle(seat, seats);
  const radius = seats === 2 ? 0.34 : 0.58;
  const shift = seats === 2 ? 0.3 : 0.2;
  const side = (trick - 1) * 0.12;
  return [
    Math.sin(a) * radius + Math.cos(viewAngle) * side + Math.sin(viewAngle) * shift,
    TABLE_HEIGHT + 0.002 + (trick * seats + seat) * 0.0015,
    Math.cos(a) * radius - Math.sin(viewAngle) * side + Math.cos(viewAngle) * shift,
  ];
}

/** Vazas anteriores em dois montinhos na lateral, abrindo o centro para a próxima. */
export function archivedCardPosition(seat: number, trick: number, viewAngle: number): [number, number, number] {
  const side = viewAngle - Math.PI / 2;
  return [
    Math.sin(side) * 1.14 + Math.sin(viewAngle) * (trick * 0.36 - 0.18),
    TABLE_HEIGHT + 0.004 + seat * 0.002,
    Math.cos(side) * 1.14 + Math.cos(viewAngle) * (trick * 0.36 - 0.18),
  ];
}

/** Copo de cada jogador: na beira da mesa, um pouco à direita de quem senta (afastado do monte e das vazas). */
export const CUP_SIDE = 0.3;
export const CUP_RADIUS = 1.38;

/** Onde fica o copo de quem senta no ângulo `angle` (coordenadas da cena). */
export function cupPosition(angle: number): [number, number, number] {
  return [
    Math.sin(angle) * CUP_RADIUS + Math.cos(angle) * CUP_SIDE,
    TABLE_HEIGHT,
    Math.cos(angle) * CUP_RADIUS - Math.sin(angle) * CUP_SIDE,
  ];
}

/** Ângulo da cadeira em volta da mesa (0 = +z). A câmera é que gira para ficar atrás da cadeira do jogador. */
export function seatAngle(seat: number, count: number): number {
  return (seat * Math.PI * 2) / count;
}

export function polar(angle: number, radius: number, y = 0): [number, number, number] {
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}

const STAND_RADIUS = 3.6;
/** Ângulo entre dois lugares de espera (~1,15 m): ninguém fica na frente da câmera de outro. */
const STAND_STEP = 0.32;

/**
 * Quem ainda não escolheu cadeira espera de pé no lado da porta, num arco de frente para a mesa:
 * o primeiro no meio, os seguintes alternando dos dois lados.
 */
export function standingSpot(index: number): { position: [number, number, number]; rotationY: number } {
  const side = index % 2 === 1 ? 1 : -1;
  const a = -Math.PI / 2 + side * Math.ceil(index / 2) * STAND_STEP;
  return { position: polar(a, STAND_RADIUS), rotationY: a };
}

/** Porta da taverna: de onde os personagens chegam. */
export const DOOR: [number, number, number] = [-4.2, 0, -3.2];
