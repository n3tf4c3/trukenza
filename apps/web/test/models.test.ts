import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CHARACTER_IDS } from '../../../packages/shared/src/characters.ts';
import { SCENERY_IDS } from '../../../packages/shared/src/scenery.ts';

test('todos os destinos entregam geometria, água e mesa no GLB', () => {
  const glb = readFileSync(new URL('../public/modelos/cenarios.glb', import.meta.url));
  assert.equal(glb.readUInt32LE(8), glb.length);
  const doc = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const names = new Set(doc.nodes.map((n: { name: string }) => n.name));
  for (const id of SCENERY_IDS.filter(id => id !== 'bolicho')) assert.ok(names.has(id), `destino ausente: ${id}`);
  for (const id of ['praia', 'china', 'japao', 'fuji', 'cataratas']) assert.ok(names.has(`${id}_agua`));
  const table = doc.nodes.find((n: { name: string }) => n.name === 'mesa_externa');
  assert.ok(table && Number.isInteger(table.mesh));
  const falls = doc.nodes.find((n: { name: string }) => n.name === 'cataratas');
  const materialNames = doc.meshes[falls.mesh].primitives.map((p: { material: number }) => doc.materials[p.material].name);
  assert.ok(materialNames.includes('queda_agua'), 'quedas precisam de material próprio para o fluxo não animar a espuma do chão');
});

test('todos os personagens têm corpo e peças faciais articuladas no GLB entregue', () => {
  const glb = readFileSync(new URL('../public/modelos/personagens.glb', import.meta.url));
  assert.equal(glb.readUInt32LE(0), 0x46546c67, 'cabeçalho GLB');
  assert.equal(glb.readUInt32LE(4), 2, 'glTF 2');
  assert.equal(glb.readUInt32LE(8), glb.length, 'arquivo completo');
  const length = glb.readUInt32LE(12);
  const document = JSON.parse(glb.subarray(20, 20 + length).toString('utf8'));
  const names = new Set(document.nodes.map((node: { name: string }) => node.name));
  for (const id of CHARACTER_IDS) {
    for (const part of ['tronco', 'cabeca', 'olho_esq', 'olho_dir', 'sobrancelhas', 'boca', 'nariz', 'abertura', 'braco', 'coxa', 'canela']) {
      assert.ok(names.has(`${id}_${part}`), `modelo ausente: ${id}_${part}`);
    }
  }
});
