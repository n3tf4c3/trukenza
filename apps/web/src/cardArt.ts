import { RANK_NAMES, cardId, type Card, type Suit } from '@trukenza/game-engine';

/**
 * Desenho das cartas em canvas (frente e verso), sem three: serve às texturas da mesa 3D
 * (`scene/textures.ts`) e às imagens pequenas do painel (`cardImage`). Arte própria, nada para baixar.
 */

const INK = '#2b1a12';
export const SUIT_COLORS: Record<Suit, string> = { espadas: '#2f5fb3', bastos: '#3d7a2a', ouros: '#d99a1e', copas: '#c0392b' };

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Desenha o naipe centrado em (x, y), com `s` de altura aproximada. */
export function drawSuit(g: CanvasRenderingContext2D, suit: Suit, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 100, s / 100);
  g.lineJoin = 'round';
  g.lineWidth = 6;
  g.strokeStyle = INK;
  const color = SUIT_COLORS[suit];
  switch (suit) {
    case 'ouros': {
      g.fillStyle = color;
      g.beginPath();
      g.arc(0, 0, 42, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#ffe28a';
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 ? 14 : 28;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.lineWidth = 4;
      g.stroke();
      break;
    }
    case 'copas': {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(-36, -40);
      g.lineTo(36, -40);
      g.quadraticCurveTo(38, 6, 0, 12);
      g.quadraticCurveTo(-38, 6, -36, -40);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#f0c24b';
      g.fillRect(-7, 10, 14, 22);
      g.strokeRect(-7, 10, 14, 22);
      g.beginPath();
      g.ellipse(0, 40, 26, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
    case 'espadas': {
      g.fillStyle = '#cfd8e6';
      g.beginPath();
      g.moveTo(0, -50);
      g.lineTo(9, -38);
      g.lineTo(8, 18);
      g.lineTo(-8, 18);
      g.lineTo(-9, -38);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = color;
      roundRect(g, -30, 16, 60, 12, 6);
      g.fill();
      g.stroke();
      g.fillRect(-6, 28, 12, 18);
      g.strokeRect(-6, 28, 12, 18);
      g.beginPath();
      g.arc(0, 50, 8, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
    case 'bastos': {
      g.fillStyle = '#9a6a3a';
      g.beginPath();
      g.moveTo(-10, 48);
      g.quadraticCurveTo(-22, 0, -20, -36);
      g.quadraticCurveTo(0, -56, 20, -36);
      g.quadraticCurveTo(22, 0, 10, 48);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = color;
      for (const [kx, ky] of [[-14, -14], [13, 4], [-10, 22]] as const) {
        g.beginPath();
        g.ellipse(kx, ky, 9, 6, 0.4, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 4;
        g.stroke();
      }
      break;
    }
  }
  g.restore();
}

export const CARD_W = 256;
export const CARD_H = 384;

export function drawCardFace(g: CanvasRenderingContext2D, card: Card, w: number, h: number): void {
    const color = SUIT_COLORS[card.suit];
    g.fillStyle = '#fff7e6';
    roundRect(g, 0, 0, w, h, 22);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = color;
    roundRect(g, 14, 14, w - 28, h - 28, 14);
    g.stroke();
    // Os cantos e o centro leem a carta de longe: número grande e naipe.
    g.fillStyle = INK;
    g.font = 'bold 64px "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(card.rank), 52, 60);
    drawSuit(g, card.suit, 52, 116, 46);
    // O canto de baixo fica em pé, sem girar: girado, o 6 parece 9.
    g.fillText(String(card.rank), w - 52, h - 60);
    drawSuit(g, card.suit, w - 52, h - 116, 46);
    if (card.rank >= 10) {
      // Figuras: faixa com o nome em vez do retrato tradicional.
      drawSuit(g, card.suit, w / 2, h / 2 - 22, 110);
      g.fillStyle = color;
      roundRect(g, 46, h / 2 + 52, w - 92, 50, 12);
      g.fill();
      g.fillStyle = '#fff7e6';
      g.font = 'bold 34px "Trebuchet MS", system-ui, sans-serif';
      g.fillText(RANK_NAMES[card.rank].toUpperCase(), w / 2, h / 2 + 78);
    } else {
      drawSuit(g, card.suit, w / 2, h / 2, 130);
    }
}

export function drawCardBack(g: CanvasRenderingContext2D, w: number, h: number): void {
    g.fillStyle = '#fff7e6';
    roundRect(g, 0, 0, w, h, 22);
    g.fill();
    g.fillStyle = '#8e1f2f';
    roundRect(g, 12, 12, w - 24, h - 24, 14);
    g.fill();
    g.strokeStyle = '#e8b04a';
    g.lineWidth = 3;
    for (let i = -h; i < w + h; i += 22) {
      g.beginPath();
      g.moveTo(i, 12);
      g.lineTo(i + h, h);
      g.moveTo(i + h, 12);
      g.lineTo(i, h);
      g.stroke();
    }
    g.fillStyle = '#8e1f2f';
    g.beginPath();
    g.arc(w / 2, h / 2, 62, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = '#e8b04a';
    g.font = 'bold 84px "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('T', w / 2, h / 2 + 4);
}

const images = new Map<string, string>();

/** A frente da carta como imagem (data URL), para o painel. Desenhada uma vez por carta. */
export function cardImage(card: Card): string {
  const key = cardId(card);
  let url = images.get(key);
  if (!url) {
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    drawCardFace(canvas.getContext('2d')!, card, CARD_W, CARD_H);
    url = canvas.toDataURL('image/png');
    images.set(key, url);
  }
  return url;
}
