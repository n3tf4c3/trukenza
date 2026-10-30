/**
 * Ajuste do jogador na câmera livre: giro em volta do ponto que a câmera olha, inclinação e distância. O
 * `CameraRig` aplica por cima da posição atrás do próprio personagem; a interface só zera (sem three aqui).
 */
export const freeCamera = { yaw: 0, pitch: 0, zoom: 1 };

/** Arrastar mais que isto (em pixels) gira a câmera e deixa de valer como clique. */
export const DRAG_PX = 6;

export function resetFreeCamera(): void {
  freeCamera.yaw = 0;
  freeCamera.pitch = 0;
  freeCamera.zoom = 1;
}
