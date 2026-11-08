import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Contraste dos botões principais (Criar mesa, Estou pronto / Pronto ✓), calculado das regras do styles.css.
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Regras sem aninhamento (as de dentro de @media também entram, por cautela). */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m, order) => ({
  selectors: m[1]!.split(',').map((s) => s.trim()),
  decls: Object.fromEntries(
    m[2]!.split(';').map((d) => d.split(':')).filter((p) => p.length >= 2).map(([k, ...v]) => [k!.trim(), v.join(':').trim()]),
  ),
  order,
}));

const vars = Object.fromEntries(
  Object.entries(rules.find((r) => r.selectors.includes(':root'))!.decls).filter(([k]) => k.startsWith('--')),
);

interface Compound { tag: string; classes: string[]; attrs: string[]; pseudos: string[] }

function parseCompound(selector: string): Compound | null {
  if (/[\s>+~]/.test(selector)) return null; // com combinador: tratado à parte
  const tag = /^[a-z]+/.exec(selector)?.[0] ?? '';
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
  const attrs = [...selector.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!.replace(/["']/g, ''));
  const pseudos = [...selector.replace(/\[[^\]]*\]/g, '').matchAll(/::?[\w-]+(\([^)]*\))?/g)].map((m) => m[0]);
  return { tag, classes, attrs, pseudos };
}

/** Cor e fundo efetivos de um botão no estado pedido: especificidade e, no empate, ordem no arquivo. */
function computed(target: Compound, property: 'color' | 'background'): string {
  let best: { spec: number; order: number; value: string } | null = null;
  for (const rule of rules) {
    const value = rule.decls[property];
    if (!value) continue;
    for (const s of rule.selectors) {
      const c = parseCompound(s);
      if (!c || c.pseudos.length > 0) continue;
      if ((c.tag && c.tag !== target.tag) || !c.classes.every((x) => target.classes.includes(x)) || !c.attrs.every((x) => target.attrs.includes(x))) continue;
      const spec = (c.classes.length + c.attrs.length) * 10 + (c.tag ? 1 : 0);
      if (!best || spec > best.spec || (spec === best.spec && rule.order > best.order)) best = { spec, order: rule.order, value };
    }
  }
  assert.ok(best, `${property} não definida`);
  return best.value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => vars[name]!);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  assert.ok(m, `cor fora do formato #rrggbb: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const principal = (pressed: boolean): Compound => ({ tag: 'button', classes: ['principal'], attrs: pressed ? ['aria-pressed=true'] : [], pseudos: [] });

test('botão principal selecionado (Pronto ✓) tem contraste AA para texto normal', () => {
  const pressed = principal(true);
  const value = ratio(computed(pressed, 'color'), computed(pressed, 'background'));
  assert.ok(value >= 4.5, `contraste ${value.toFixed(2)}:1 abaixo de 4,5:1`);
});

test('controle: botão principal sem seleção mede o vermelho com creme (≥ 4,5:1)', () => {
  const normal = principal(false);
  assert.equal(computed(normal, 'background'), vars['--vermelho']);
  assert.equal(computed(normal, 'color'), vars['--creme']);
  assert.ok(ratio(computed(normal, 'color'), computed(normal, 'background')) >= 4.5);
});

test('nenhuma regra com combinador muda cor ou fundo do botão principal', () => {
  const nested = rules.filter((r) => r.selectors.some((s) => /[\s>+~]/.test(s) && /button\.principal|\.principal\b/.test(s)) && (r.decls.color || r.decls.background));
  assert.deepEqual(nested.map((r) => r.selectors.join(', ')), []);
});
