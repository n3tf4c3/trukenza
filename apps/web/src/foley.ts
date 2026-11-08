/** Foley original: papel, madeira e cerâmica, com transientes e ressonâncias amortecidas.
 * As amostras são geradas localmente; a variação evita repetir exatamente a mesma batida.
 */
export type FoleyKind = 'papel' | 'madeira' | 'feijao' | 'deslizar';

export function materialSound(kind: FoleyKind, sampleRate: number, variant = 0): Float32Array<ArrayBuffer> {
  const duration = { papel: 0.22, madeira: 0.38, feijao: 0.24, deslizar: 0.42 }[kind];
  const data = new Float32Array(Math.ceil(duration * sampleRate));
  let seed = (9173 + variant * 1987) >>> 0;
  let low = 0;
  let mid = 0;
  const pitch = 0.96 + (variant % 4) * 0.027;
  const tau = Math.PI * 2;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 4294967296 * 2 - 1;
    low += (1 - Math.exp(-tau * 650 / sampleRate)) * (white - low);
    mid += (1 - Math.exp(-tau * 3600 / sampleRate)) * (white - mid);
    const paper = mid - low;
    const t = i / sampleRate;
    const attack = 1 - Math.exp(-t * 1900);
    const tail = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.025));
    let v = 0;
    if (kind === 'papel') {
      // Claque do papel, pequena flexão e dois contatos suaves com o tampo.
      const rebounds = Math.exp(-(((t - 0.018) / 0.007) ** 2)) * 0.13 + Math.exp(-(((t - 0.042) / 0.012) ** 2)) * 0.07;
      v = paper * (Math.exp(-t * 95) * 1.5 + rebounds)
        + Math.sin(tau * 235 * pitch * t) * Math.exp(-t * 65) * 0.22
        + Math.sin(tau * 590 * pitch * t) * Math.exp(-t * 100) * 0.1;
    } else if (kind === 'madeira') {
      // Modos independentes do tampo: madeira tem corpo, sem o glissando de um tambor eletrônico.
      v = Math.sin(tau * 174 * pitch * t) * Math.exp(-t * 24) * 0.4
        + Math.sin(tau * 347 * pitch * t) * Math.exp(-t * 38) * 0.22
        + Math.sin(tau * 623 * pitch * t) * Math.exp(-t * 57) * 0.12
        + paper * Math.exp(-t * 150) * 0.85;
    } else if (kind === 'feijao') {
      v = Math.sin(tau * 835 * pitch * t) * Math.exp(-t * 38) * 0.3
        + Math.sin(tau * 1823 * pitch * t) * Math.exp(-t * 58) * 0.13
        + paper * Math.exp(-t * 180) * 0.55;
    } else {
      const envelope = Math.sin(Math.PI * t / duration) ** 1.6;
      v = paper * envelope * (0.38 + 0.12 * Math.sin(tau * 37 * t)) + low * envelope * 0.13;
    }
    data[i] = Math.tanh(v * 1.15) * attack * Math.max(0, tail) * 0.8;
  }
  return data;
}

/** Reflexões curtas de uma sala de madeira; estéreo sem cauda de catedral. */
export function roomImpulse(sampleRate: number, channel: number): Float32Array<ArrayBuffer> {
  const data = new Float32Array(Math.ceil(sampleRate * 0.32));
  let seed = 411 + channel * 719;
  let smooth = 0;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    smooth = smooth * 0.6 + (seed / 4294967296 * 2 - 1) * 0.4;
    const t = i / sampleRate;
    data[i] = t < 0.016 ? 0 : smooth * Math.exp(-t * 21) * (1 - i / data.length) ** 2;
  }
  return data;
}
