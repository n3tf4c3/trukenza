import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barkeepPose, barkeepYaw, dogPose, dogYaw } from '../src/scene/figurantes.ts';
import { CHAIR_RADIUS, polar, seatAngle } from '../src/scene/layout.ts';

test('cachorro e bolicheiro viram a cabeça para a mesa, sem torcer o pescoço além do limite', () => {
  // Focinho para -x: olhar para a mesa (em -z a partir da lareira) gira para o lado negativo, no limite.
  assert.ok(dogYaw([0, 0]) < -1 && dogYaw([0, 0]) >= -1.15);
  assert.equal(dogYaw([-3, 4.5]), 0, 'algo bem à frente do focinho: cabeça reta');
  assert.equal(barkeepYaw([0, 0]), 0, 'a mesa fica bem na frente do balcão');
  for (const seats of [2, 4]) for (let s = 0; s < seats; s++) {
    const [x, , z] = polar(seatAngle(s, seats), CHAIR_RADIUS);
    const yaw = barkeepYaw([x, z]);
    assert.ok(Math.abs(yaw) <= 0.8);
    assert.ok(Math.sign(yaw) === Math.sign(Math.round(x * 100)) || Math.abs(x) < 0.01, `cadeira ${s}/${seats}`);
  }
});

test('em repouso o cachorro cochila; alerta, ergue a cabeça e abana o rabo mais rápido e mais largo', () => {
  let restWag = 0;
  let alertWag = 0;
  for (let t = 0; t < 4; t += 0.01) {
    const rest = dogPose(t, 0);
    const alert = dogPose(t, 1);
    assert.ok(rest.pitch > 0.25, 'focinho nas patas');
    assert.ok(alert.pitch < 0, 'cabeça erguida');
    assert.ok(Math.abs(rest.breath - 1) <= 0.03 && Math.abs(alert.breath - 1) <= 0.03);
    restWag = Math.max(restWag, Math.abs(rest.tailWag));
    alertWag = Math.max(alertWag, Math.abs(alert.tailWag));
  }
  assert.ok(restWag < 0.15 && alertWag > 0.5);
});

test('o bolicheiro para de secar o copo quando presta atenção e acena ao anotar um pedido', () => {
  let busy = 0;
  let attentive = 0;
  for (let t = 0; t < 3; t += 0.01) {
    busy = Math.max(busy, Math.abs(barkeepPose(t, 0, -1).armY));
    attentive = Math.max(attentive, Math.abs(barkeepPose(t, 1, -1).armY));
  }
  assert.ok(attentive < busy * 0.3);
  assert.ok(barkeepPose(0, 0, -1).pitch > barkeepPose(0, 1, -1).pitch, 'olha o copo, depois a mesa');
  const nods = [0.1, 0.3, 0.5].map(age => barkeepPose(0, 1, age).pitch - barkeepPose(0, 1, -1).pitch);
  assert.ok(nods.some(n => n > 0.05) && nods.some(n => n < -0.05), 'aceno sobe e desce');
  assert.equal(barkeepPose(0, 1, 2).pitch, barkeepPose(0, 1, -1).pitch, 'o aceno acaba');
});
