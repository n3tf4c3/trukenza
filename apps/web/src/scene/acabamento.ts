import * as THREE from 'three';

/**
 * Acabamento dos materiais no navegador, sem tocar nos modelos: contraluz de borda (o recorte claro que
 * separa o personagem do fundo, típico de animação) e os ajustes de brilho por nome de material.
 */

const RIM_KEY = 'trukenza-contraluz';

/** Uniformes por tom de contraluz: todos os materiais com o mesmo tom compartilham o par. */
const rims = new Map<string, { color: { value: THREE.Color }; strength: { value: number } }>();

function rimUniforms(color: string, strength: number) {
  const key = `${color}:${strength}`;
  let u = rims.get(key);
  if (!u) {
    u = { color: { value: new THREE.Color(color) }, strength: { value: strength } };
    rims.set(key, u);
  }
  return u;
}

/**
 * Soma à cor final uma borda clara onde a superfície vira de lado para a câmera. A borda puxa a cor do
 * próprio material (não lava a roupa) e pesa mais em quem está de costas para cima, como luz de teto.
 */
export function addRim(material: THREE.Material, color = '#ffe6c4', strength = 0.42): void {
  const mat = material as THREE.MeshStandardMaterial;
  if (!mat.isMeshStandardMaterial || mat.userData.rim) return;
  mat.userData.rim = true;
  const u = rimUniforms(color, strength);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = u.color;
    shader.uniforms.rimStrength = u.strength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float rimFacing = 1.0 - saturate( dot( normalize( vViewPosition ), normal ) );
          float rim = smoothstep( 0.52, 1.0, rimFacing );
          // Normal em espaço de câmera: y para cima na tela. Reforça o alto das formas.
          float rimTop = 0.55 + 0.45 * saturate( normal.y * 0.5 + 0.5 );
          outgoingLight += mix( diffuseColor.rgb, rimColor, 0.55 ) * rim * rimTop * rimStrength;
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => RIM_KEY;
  mat.needsUpdate = true;
}

/** Contraluz em tudo o que é pele, roupa e cabelo de um boneco; olhos e brilhos ficam como estão. */
export function finishCharacter(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const mat = m as THREE.MeshStandardMaterial;
      if (!mat.isMeshStandardMaterial || mat.userData.finished) continue;
      mat.userData.finished = true;
      const name = mat.name;
      if (name === 'olho_branco' || name === 'pupila' || name.endsWith('_iris')) {
        // Olho úmido: reflete o lampião.
        mat.roughness = Math.min(mat.roughness, 0.12);
        mat.envMapIntensity = 1.8;
        continue;
      }
      if (name === 'brilho_olho') continue;
      if (mat.metalness > 0.5) {
        mat.envMapIntensity = 1.5;
        continue;
      }
      addRim(mat);
    }
  });
}

/** Brilho das superfícies do cenário, por nome de material (o contrato com os scripts do Blender). */
const SURFACE_FINISH: Record<string, { roughness?: number; env?: number; metalness?: number }> = {
  // Verniz gasto: o tampo e o piso devolvem um pouco da luz do lampião.
  tampo: { roughness: 0.46, env: 0.9 },
  piso: { roughness: 0.62, env: 0.55 },
  madeira: { roughness: 0.6, env: 0.6 },
  madeira_escura: { roughness: 0.58, env: 0.6 },
  parede: { env: 0.35 },
  forro: { env: 0.3 },
  ferro: { roughness: 0.38, env: 1.3 },
  latao: { roughness: 0.22, env: 1.8 },
  vidro_verde: { roughness: 0.05, env: 2.4 },
  vidro_ambar: { roughness: 0.05, env: 2.4 },
  vidro_claro: { roughness: 0.04, env: 2.6 },
  cerveja: { roughness: 0.08, env: 2.2 },
  louca: { roughness: 0.25, env: 1.2 },
  couro: { roughness: 0.48, env: 0.9 },
  carne: { roughness: 0.42, env: 1.0 },
  linguica: { roughness: 0.36, env: 1.1 },
};

export function finishSurface(mat: THREE.MeshStandardMaterial): void {
  const finish = SURFACE_FINISH[mat.name];
  if (!finish) return;
  if (finish.roughness !== undefined) mat.roughness = finish.roughness;
  if (finish.metalness !== undefined) mat.metalness = finish.metalness;
  if (finish.env !== undefined) mat.envMapIntensity = finish.env;
  mat.needsUpdate = true;
}
