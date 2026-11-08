import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();
/** Grão e juntas discretos, desenhados aqui; UVs do Blender usam metros. */
export function outdoorTexture(name: string): THREE.CanvasTexture | null {
  if (!['areia', 'grama', 'pedra_clara', 'pedra_muralha', 'piso_vegas'].includes(name)) return null;
  const old = cache.get(name);
  if (old) return old;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, 256, 256);
  let seed = 73;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const grass = name === 'grama';
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = random() > 0.5 ? '#b8b3a31c' : '#ffffff30';
    ctx.fillRect(random() * 256, random() * 256, grass ? 1 : 2, grass ? 5 : 2);
  }
  if (name.startsWith('pedra') || name === 'piso_vegas') {
    ctx.strokeStyle = '#766b5b30'; ctx.lineWidth = 2;
    for (let row = 0; row < 4; row++) {
      ctx.beginPath(); ctx.moveTo(0, row * 64); ctx.lineTo(256, row * 64); ctx.stroke();
      for (let x = (row % 2) * 64; x <= 256; x += 128) {
        ctx.beginPath(); ctx.moveTo(x, row * 64); ctx.lineTo(x, row * 64 + 64); ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(grass ? 1 : 0.7);
  texture.anisotropy = 4;
  cache.set(name, texture);
  return texture;
}

export function mistTexture(): THREE.CanvasTexture {
  const old = cache.get('mist');
  if (old) return old;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, '#e5fff5aa'); gradient.addColorStop(1, '#e5fff500');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  cache.set('mist', texture);
  return texture;
}

/** Textura periódica: não deixa uma emenda aparecer enquanto a água corre. */
export function waterTexture(falling: boolean): THREE.CanvasTexture {
  const key = falling ? 'waterfall' : 'ripples';
  const old = cache.get(key);
  if (old) return old;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = x / 256 * Math.PI * 2, v = y / 256 * Math.PI * 2;
    const wave = falling
      ? Math.sin(u * 7 + Math.sin(v * 2)) * 0.5 + Math.sin(v * 3 + Math.sin(u * 4)) * 0.5
      : Math.sin(v * 4 + Math.sin(u * 2)) * 0.6 + Math.sin(u * 3 - v * 2) * 0.4;
    const shade = Math.round(220 + wave * 30);
    const i = (y * 256 + x) * 4;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = shade;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}
