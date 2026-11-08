import * as THREE from 'three';

/**
 * Texturas do bolicho, desenhadas em canvas uma vez: cor (clara, para multiplicar a cor do material e a
 * sombra assada nos vértices) e relevo (bumpMap, em tons de cinza). O UV vem do Blender em metros
 * (`assets/blender/lib.py`, `box_uv`), então `meters` diz quantos metros uma repetição cobre.
 */

export interface SurfaceMaps {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

type Draw = (g: CanvasRenderingContext2D, size: number, relief: boolean, rnd: () => number) => void;

const cache = new Map<string, SurfaceMaps>();

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D) => void, meters: number, color: boolean, anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / meters, 1 / meters);
  tex.anisotropy = anisotropy;
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function surface(key: string, size: number, meters: number, seed: number, draw: Draw, anisotropy = 8): SurfaceMaps {
  let s = cache.get(key);
  if (s) return s;
  s = {
    map: canvasTexture(size, (g) => draw(g, size, false, seeded(seed)), meters, true, anisotropy),
    bump: canvasTexture(size, (g) => draw(g, size, true, seeded(seed)), meters, false, anisotropy),
  };
  cache.set(key, s);
  return s;
}

const gray = (v: number) => `rgb(${v | 0},${v | 0},${v | 0})`;

/** Veios de madeira numa faixa (x, y, w, h), no sentido do comprimento (horizontal). */
function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, relief: boolean, dark: string): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const lines = 12 + Math.floor(rnd() * 10);
  for (let i = 0; i < lines; i++) {
    const yy = y + rnd() * h;
    const amp = 1 + rnd() * h * 0.12;
    const freq = 0.004 + rnd() * 0.01;
    const phase = rnd() * 10;
    g.strokeStyle = relief ? gray(95 + rnd() * 30) : dark;
    g.globalAlpha = relief ? 0.3 : 0.06 + rnd() * 0.10;
    g.lineWidth = 0.35 + rnd() * 0.9;
    g.beginPath();
    for (let xx = x; xx <= x + w; xx += 6) g.lineTo(xx, yy + Math.sin(xx * freq + phase) * amp);
    g.stroke();
  }
  // Um nó de vez em quando.
  if (rnd() < 0.35) {
    const kx = x + rnd() * w;
    const ky = y + h * (0.3 + rnd() * 0.4);
    g.globalAlpha = relief ? 0.6 : 0.35;
    g.fillStyle = relief ? gray(80) : dark;
    g.beginPath();
    g.ellipse(kx, ky, 3 + rnd() * 6, 2 + rnd() * 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.globalAlpha = 1;
}

/** Tábuas largas do piso: 12 tábuas de 20 cm por repetição de 2,4 m, emendas desencontradas. */
export const floorMaps = () =>
  surface('piso', 1024, 2.4, 11, (g, s, relief, rnd) => {
    const rows = 12;
    const rh = s / rows;
    g.fillStyle = relief ? gray(200) : '#ffffff';
    g.fillRect(0, 0, s, s);
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * s * 0.5;
      while (x < s) {
        const len = s * (0.35 + rnd() * 0.45);
        const tone = 0.82 + rnd() * 0.22;
        g.fillStyle = relief ? gray(190 + rnd() * 30) : `rgb(${255 * tone | 0},${242 * tone | 0},${225 * tone | 0})`;
        g.fillRect(x, r * rh, len, rh);
        grain(g, x, r * rh, len, rh, rnd, relief, '#3b2414');
        // Emenda e pregos.
        g.fillStyle = relief ? gray(40) : 'rgba(40,22,10,0.8)';
        g.fillRect(x, r * rh, 2, rh);
        for (const py of [0.25, 0.75]) {
          g.beginPath();
          g.arc(x + 8, r * rh + rh * py, 2, 0, Math.PI * 2);
          g.fill();
        }
        x += len;
      }
      g.fillStyle = relief ? gray(30) : 'rgba(35,20,10,0.85)';
      g.fillRect(0, r * rh, s, 3);
    }
  });

/** Manchas suaves e irregulares (cal mais grossa ou mais fina, umidade). */
function blotches(g: CanvasRenderingContext2D, s: number, rnd: () => number, count: number, color: () => string, alpha: number, size: number): void {
  for (let k = 0; k < count; k++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = size * (0.4 + rnd());
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color());
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    g.fillStyle = grad;
    // Repete nas bordas para a textura emendar sem costura.
    for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
  }
  g.globalAlpha = 1;
}

/**
 * Parede de tijolo caiado: a cal cobre quase tudo, com demãos irregulares; as fiadas só se adivinham
 * pelo relevo e por uma linha clara aqui e ali.
 */
export const whitewashMaps = () =>
  surface('parede', 512, 1.5, 23, (g, s, relief, rnd) => {
    const rows = 12;
    const bh = s / rows;
    const bw = bh * 3.8;
    g.fillStyle = relief ? gray(170) : '#ffffff';
    g.fillRect(0, 0, s, s);
    blotches(g, s, rnd, 18, () => (relief ? gray(145) : `rgb(${225 + rnd() * 15 | 0},${218 + rnd() * 15 | 0},${202 + rnd() * 15 | 0})`), relief ? 0.3 : 0.18, s * 0.18);
    // Junta das fiadas: no relevo sempre, na cor só de leve.
    for (let row = 0; row < rows; row++) {
      const y = row * bh + (rnd() - 0.5) * 1.5;
      g.fillStyle = relief ? gray(105) : 'rgba(150,130,105,0.12)';
      g.fillRect(0, y, s, relief ? 2.5 : 1.5);
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -off; x < s; x += bw + (rnd() - 0.5) * 6) g.fillRect(x, y, relief ? 2.5 : 1.5, bh);
    }
    // Raros pontos onde a cal caiu e aparece o tijolo, pequenos e na junta.
    for (let k = 0; k < 4; k++) {
      const x = rnd() * s;
      const y = Math.floor(rnd() * rows) * bh;
      g.fillStyle = relief ? gray(90) : 'rgba(170,95,62,0.55)';
      g.beginPath();
      g.ellipse(x, y + bh / 2, 4 + rnd() * 9, 2 + rnd() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  });

/** Céu da porta e da janela: azul em cima, claro no horizonte (o brilho vem do material). */
export function skyTexture(): THREE.CanvasTexture {
  const key = 'ceu';
  const hit = cache.get(key);
  if (hit) return hit.map;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#6f9fd8');
  grad.addColorStop(0.6, '#bcd6ef');
  grad.addColorStop(1, '#fff1d6');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, { map: tex, bump: tex });
  return tex;
}

/** Tijolo aparente do rodapé. */
export const brickMaps = () =>
  surface('tijolo', 512, 1.0, 31, (g, s, relief, rnd) => {
    const bw = s / 4;
    const bh = s / 14;
    g.fillStyle = relief ? gray(60) : '#d9cbb4';
    g.fillRect(0, 0, s, s);
    for (let row = 0; row < 14; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let i = -1; i < 5; i++) {
        const v = rnd();
        const x = i * bw + off;
        const y = row * bh;
        g.fillStyle = relief ? gray(190 + v * 50) : `rgb(${215 + v * 40 | 0},${150 + v * 40 | 0},${120 + v * 30 | 0})`;
        g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        if (!relief && rnd() < 0.3) {
          g.fillStyle = 'rgba(80,30,20,0.25)';
          g.fillRect(x + 3, y + 3 + (bh - 6) * 0.5, bw - 6, (bh - 6) * 0.5);
        }
      }
    }
  });

/** Forro de tábuas estreitas. */
export const ceilingMaps = () =>
  surface('forro', 512, 1.2, 41, (g, s, relief, rnd) => {
    const n = 8;
    const w = s / n;
    for (let i = 0; i < n; i++) {
      const t = 0.85 + rnd() * 0.25;
      g.fillStyle = relief ? gray(190) : `rgb(${255 * t | 0},${238 * t | 0},${220 * t | 0})`;
      g.fillRect(0, i * w, s, w);
      grain(g, 0, i * w, s, w, rnd, relief, '#3b2414');
      g.fillStyle = relief ? gray(40) : 'rgba(30,18,8,0.7)';
      g.fillRect(0, i * w, s, 2);
    }
  });

/** Madeira com veios (móveis, balcão, grade). Clara: a cor vem do material. */
export const woodMaps = () =>
  surface('madeira', 512, 0.8, 53, (g, s, relief, rnd) => {
    g.fillStyle = relief ? gray(180) : '#ffffff';
    g.fillRect(0, 0, s, s);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = 0.88 + rnd() * 0.16;
      g.fillStyle = relief ? gray(170 + rnd() * 30) : `rgb(${255 * t | 0},${245 * t | 0},${232 * t | 0})`;
      g.fillRect(0, (i * s) / n, s, s / n);
      grain(g, 0, (i * s) / n, s, s / n, rnd, relief, '#4a2c16');
    }
  });

/** Tampo da mesa de truco: tábuas largas coladas, verniz gasto no meio. */
export function tableTopMaps(): SurfaceMaps {
  const maps = surface('tampo', 1024, 3.0, 61, (g, s, relief, rnd) => {
    const n = 7;
    const w = s / n;
    for (let i = 0; i < n; i++) {
      const t = 0.93 + rnd() * 0.07;
      g.fillStyle = relief ? gray(200) : `rgb(${255 * t | 0},${240 * t | 0},${222 * t | 0})`;
      g.fillRect(0, i * w, s, w);
      grain(g, 0, i * w, s, w, rnd, relief, '#4a2a14');
      g.fillStyle = relief ? gray(110) : 'rgba(60,47,34,0.28)';
      g.fillRect(0, i * w, s, 1.5);
    }
    if (!relief) {
      // Gasto das mãos e das cartas no centro.
      const r = g.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.32);
      r.addColorStop(0, 'rgba(255,240,210,0.18)');
      r.addColorStop(1, 'rgba(255,240,210,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    }
    // Riscos finos do uso e marcas discretas de copos. A madeira continua sendo protagonista.
    for (let i = 0; i < 32; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      g.strokeStyle = relief ? 'rgba(70,70,70,0.25)' : 'rgba(63,38,21,0.12)';
      g.lineWidth = 0.5 + rnd() * 0.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 + rnd() * 30, y + rnd() * 3); g.stroke();
    }
    for (const [x, y] of [[0.19, 0.24], [0.77, 0.68], [0.26, 0.83]]) {
      g.strokeStyle = relief ? 'rgba(120,120,120,0.12)' : 'rgba(75,42,20,0.12)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(x! * s, y! * s, s * 0.028, 0.2, 5.7); g.stroke();
    }
  });
  // UV em metros centrado na origem: a emenda fica na borda do tampo, não no meio da mesa.
  maps.map.offset.set(0.5, 0.5);
  maps.bump.offset.set(0.5, 0.5);
  return maps;
}

/** Palha trançada do assento. */
export const strawMaps = () =>
  surface('palha', 256, 0.25, 71, (g, s, relief, rnd) => {
    g.fillStyle = relief ? gray(90) : '#b89150';
    g.fillRect(0, 0, s, s);
    const n = 8;
    const w = s / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const horizontal = (i + j) % 2 === 0;
        const t = 0.9 + rnd() * 0.15;
        g.fillStyle = relief ? gray(200) : `rgb(${255 * t | 0},${236 * t | 0},${190 * t | 0})`;
        g.beginPath();
        if (horizontal) g.ellipse(i * w + w / 2, j * w + w / 2, w * 0.5, w * 0.36, 0, 0, Math.PI * 2);
        else g.ellipse(i * w + w / 2, j * w + w / 2, w * 0.36, w * 0.5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, 4);

/** Juta das sacas. */
export const burlapMaps = () =>
  surface('saco', 256, 0.3, 83, (g, s, relief, rnd) => {
    g.fillStyle = relief ? gray(120) : '#e8dcc4';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 4) {
      g.fillStyle = relief ? gray(170 + rnd() * 40) : `rgba(120,95,60,${0.15 + rnd() * 0.15})`;
      g.fillRect(i, 0, 2, s);
      g.fillRect(0, i, s, 2);
    }
  }, 4);
