import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import { DEFAULT_RULES, parseRules, type RoomRules } from '@trukenza/shared';

type Picker = (props: { value: RoomRules; onChange: (patch: Partial<RoomRules>) => void; disabled?: boolean }) => unknown;
interface Node { props?: { children?: unknown; onClick?: () => void; [k: string]: unknown } }

const root = fileURLToPath(new URL('..', import.meta.url));
// O componente é TSX: o Vite do próprio app o transforma (o Node só remove tipos).
const { module } = await runnerImport<{ RulesPicker: Picker }>(fileURLToPath(new URL('../src/ui/Regras.tsx', import.meta.url)), {
  configFile: false,
  root,
  logLevel: 'silent',
  oxc: { jsx: { runtime: 'automatic' } },
});

/** Texto de um botão (os filhos podem vir em pedaços). */
function text(node: Node): string {
  const c = node.props?.children;
  return (Array.isArray(c) ? c : [c]).filter((x) => typeof x === 'string' || typeof x === 'number').join('');
}

/** Todos os elementos com onClick, percorrendo a árvore devolvida pelo componente (ele não usa hooks). */
function buttons(node: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(node)) for (const n of node) buttons(n, out);
  else if (node && typeof node === 'object' && 'props' in node) {
    const n = node as Node;
    if (typeof n.props?.onClick === 'function') out.push(n);
    buttons(n.props?.children, out);
  }
  return out;
}

function click(value: RoomRules, label: string, onChange: (patch: Partial<RoomRules>) => void): void {
  const button = buttons(module.RulesPicker({ value, onChange })).find((b) => text(b) === label);
  assert.ok(button, `botão "${label}" não encontrado`);
  button.props!.onClick!();
}

test('dois cliques antes de o estado remoto chegar: o segundo não desfaz o primeiro', () => {
  const remote: RoomRules = { ...DEFAULT_RULES, goal: 24, flor: true };
  let server = remote;
  // O snapshot do servidor ainda não chegou: os dois cliques veem as mesmas regras antigas.
  const send = (patch: Partial<RoomRules>) => {
    server = parseRules(patch, server);
  };
  click(remote, '12 tentos', send);
  click(remote, 'Sem Flor', send);
  assert.deepEqual({ goal: server.goal, flor: server.flor }, { goal: 12, flor: false });
});

test('controle: cada clique entrega o campo escolhido e o lobby junta às regras locais', () => {
  const patches: Partial<RoomRules>[] = [];
  click(DEFAULT_RULES, '12 tentos', (p) => patches.push(p));
  click(DEFAULT_RULES, '60 s por jogada', (p) => patches.push(p));
  click(DEFAULT_RULES, 'Competitivo', (p) => patches.push(p));
  assert.equal(patches.length, 3);
  const local = patches.reduce<RoomRules>((current, patch) => ({ ...current, ...patch }), DEFAULT_RULES);
  assert.deepEqual(local, { ...DEFAULT_RULES, goal: 12, turnSeconds: 60, botDifficulty: 'competitivo' });
});
