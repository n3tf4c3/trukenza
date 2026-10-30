import * as THREE from 'three';
import { cardId, type Card } from '@trukenza/game-engine';
import { CARD_H, CARD_W, drawCardBack, drawCardFace } from '../cardArt';

/** Texturas das cartas para a mesa 3D, a partir do desenho em `cardArt.ts`; uma vez cada e guardadas. */

const cache = new Map<string, THREE.CanvasTexture>();

function cached(key: string, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  let tex = cache.get(key);
  if (tex) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  draw(canvas.getContext('2d')!, CARD_W, CARD_H);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

export function cardFaceTexture(card: Card): THREE.CanvasTexture {
  return cached(`carta:${cardId(card)}`, (g, w, h) => drawCardFace(g, card, w, h));
}

export function cardBackTexture(): THREE.CanvasTexture {
  return cached('carta:verso', drawCardBack);
}
