import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_THICKNESS, TABLE_CARD_WIDTH, TABLE_HEIGHT, TABLE_RADIUS, seatAngle, tableCardPosition } from '../src/scene/layout.ts';

for (const seats of [2, 4]) {
  test(`mesa de ${seats}: cartas apoiadas, sem interseção entre camadas, dentro do tampo em todas as cadeiras`, () => {
    for (let view = 0; view < seats; view++) {
      const angle = seatAngle(view, seats);
      let previousTop = TABLE_HEIGHT;
      for (let trick = 0; trick < 3; trick++) {
        for (let seat = 0; seat < seats; seat++) {
          const [x, y, z] = tableCardPosition(seat, seats, trick, angle);
          assert.ok(y - CARD_THICKNESS / 2 > previousTop);
          assert.ok(y - TABLE_HEIGHT < 0.02, 'pilha abaixo de dois centímetros');
          previousTop = y + CARD_THICKNESS / 2;
          for (const dx of [-TABLE_CARD_WIDTH / 2, TABLE_CARD_WIDTH / 2]) {
            for (const dz of [-TABLE_CARD_WIDTH * 0.75, TABLE_CARD_WIDTH * 0.75]) {
              const cornerX = x + Math.cos(angle) * dx + Math.sin(angle) * dz;
              const cornerZ = z - Math.sin(angle) * dx + Math.cos(angle) * dz;
              assert.ok(Math.hypot(cornerX, cornerZ) < TABLE_RADIUS - 0.03);
            }
          }
        }
      }
    }
  });
}
