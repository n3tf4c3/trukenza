import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CHARACTER_IDS } from '../../../packages/shared/src/characters.ts';
import { SCENERY_IDS } from '../../../packages/shared/src/scenery.ts';

test('cada destino entrega geometria, água e mesa no seu GLB', () => {
  for (const id of SCENERY_IDS.filter(id => id !== 'bolicho')) {
    const glb = readFileSync(new URL(`../public/modelos/cenarios/${id}.glb`, import.meta.url));
    assert.equal(glb.readUInt32LE(8), glb.length, `arquivo completo: ${id}`);
    // Só o destino escolhido é baixado: cada arquivo precisa caber numa conexão de celular.
    assert.ok(glb.length < 1.6e6, `${id}.glb com ${(glb.length / 1e6).toFixed(2)} MB`);
    const doc = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
    const names = new Set(doc.nodes.map((n: { name: string }) => n.name));
    assert.ok(names.has(id), `destino ausente: ${id}`);
    if (['praia', 'china', 'japao', 'fuji', 'cataratas'].includes(id)) assert.ok(names.has(`${id}_agua`), `água ausente: ${id}`);
    const table = doc.nodes.find((n: { name: string }) => n.name === 'mesa_externa');
    assert.ok(table && Number.isInteger(table.mesh), `mesa ausente: ${id}`);
    if (id !== 'cataratas') continue;
    const falls = doc.nodes.find((n: { name: string }) => n.name === 'cataratas');
    const materialNames = doc.meshes[falls.mesh].primitives.map((p: { material: number }) => doc.materials[p.material].name);
    assert.ok(materialNames.includes('queda_agua'), 'quedas precisam de material próprio para o fluxo não animar a espuma do chão');
  }
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

test('o bolicho entrega cenário, cadeira e o copo que vai para a mão nos goles', () => {
  const glb = readFileSync(new URL('../public/modelos/bolicho.glb', import.meta.url));
  assert.equal(glb.readUInt32LE(8), glb.length, 'arquivo completo');
  const doc = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const names = new Set(doc.nodes.map((n: { name: string }) => n.name));
  for (const node of ['cenario', 'brilhos', 'cadeira', 'copo']) assert.ok(names.has(node), `nó ausente: ${node}`);
  const materials = new Set(doc.materials.map((m: { name: string }) => m.name));
  for (const m of ['cerveja', 'espuma', 'carne', 'pao']) assert.ok(materials.has(m), `material ausente: ${m}`);
});

test('bolicheiro e cachorro vêm em peças com o nó no ponto de giro que a cena anima', async () => {
  const { BARKEEP_NECK, DOG_NECK } = await import('../src/scene/figurantes.ts');
  const glb = readFileSync(new URL('../public/modelos/bolicho.glb', import.meta.url));
  const doc = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const at = (name: string) => {
    const node = doc.nodes.find((n: { name: string }) => n.name === name);
    assert.ok(node, `nó ausente: ${name}`);
    return (node.translation ?? [0, 0, 0]) as [number, number, number];
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  const dog = at('cachorro_cabeca');
  assert.ok(near(dog[0], DOG_NECK[0]) && near(dog[2], DOG_NECK[1]), `pescoço do cachorro em ${dog}`);
  const head = at('bolicheiro_cabeca');
  assert.ok(near(head[0], BARKEEP_NECK[0]) && near(head[2], BARKEEP_NECK[1]) && head[1] > 1.4, `pescoço do bolicheiro em ${head}`);
  // Rabo atrás do corpo, braço no ombro, corpos no chão.
  assert.ok(at('cachorro_rabo')[0] > at('cachorro')[0] && near(at('cachorro')[1], 0));
  assert.ok(at('bolicheiro_braco')[1] > 1.3 && near(at('bolicheiro')[1], 0));
  // Longe da mesa, das cadeiras e do caminho de quem chega pela porta.
  for (const name of ['cachorro', 'bolicheiro']) assert.ok(Math.hypot(at(name)[0], at(name)[2]) > 4, name);
  const materials = new Set(doc.materials.map((m: { name: string }) => m.name));
  for (const m of ['pelo_caramelo', 'pele', 'camisa', 'lenco', 'chapeu']) assert.ok(materials.has(m), `material ausente: ${m}`);
});
