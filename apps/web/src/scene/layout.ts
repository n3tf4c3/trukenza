/** Medidas da cena, em metros. A mesa fica na origem; +z aponta para a câmera de visão geral. */
export const TABLE_RADIUS = 1.5;
export const FELT_RADIUS = 1.27;
export const TABLE_HEIGHT = 0.78;
export const CHAIR_RADIUS = 2.1;
export const SEAT_HEIGHT = 0.48;

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
