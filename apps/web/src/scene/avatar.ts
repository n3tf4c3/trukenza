import * as THREE from 'three';

/**
 * Onde o personagem do próprio jogador está neste quadro (posição animada, rotação e quanto já
 * sentou). Escrito pelo `Character` local e lido pela câmera, que vai atrás dele em terceira pessoa.
 * Fora do estado do React de propósito: muda a cada quadro.
 */
export const localAvatar = {
  ready: false,
  pos: new THREE.Vector3(),
  rot: 0,
  sit: 0,
};
