import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useExternalStatus } from '../src/externalStatus.ts';

const LOST = 'A conexão com a mesa caiu.';
const LOCAL = 'O código tem 6 letras ou números.';

/**
 * O lobby monta com o aviso antigo e o aviso novo chega na renderização seguinte, como quando o App o
 * repassa num efeito. A atualização durante a renderização reaproveita o estado já montado.
 */
function LateNotice({ mounted, later }: { mounted: string; later: string }) {
  const [external, setExternal] = useState(mounted);
  const [status] = useExternalStatus(external);
  if (external !== later) setExternal(later);
  return createElement('p', null, status);
}

/** Um erro local do formulário aparece depois da montagem, sem aviso externo novo. */
function LocalError({ external }: { external: string }) {
  const [status, setStatus] = useExternalStatus(external);
  const [done, setDone] = useState(false);
  if (!done) {
    setDone(true);
    setStatus(LOCAL);
  }
  return createElement('p', null, status);
}

test('aviso externo que chega depois da montagem aparece no lobby', () => {
  assert.equal(renderToStaticMarkup(createElement(LateNotice, { mounted: '', later: LOST })), `<p>${LOST}</p>`);
  assert.equal(renderToStaticMarkup(createElement(LateNotice, { mounted: 'Aviso antigo', later: LOST })), `<p>${LOST}</p>`);
});

test('controle: aviso na montagem aparece e erro local não é apagado pelo mesmo aviso', () => {
  assert.equal(renderToStaticMarkup(createElement(LateNotice, { mounted: LOST, later: LOST })), `<p>${LOST}</p>`);
  assert.equal(renderToStaticMarkup(createElement(LocalError, { external: LOST })), `<p>${LOCAL}</p>`);
});
