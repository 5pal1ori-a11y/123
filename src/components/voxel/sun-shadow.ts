import * as THREE from "three";

/** 태양 그림자 맵에 그려지는 물체만 켜 두는 레이어 */
export const SHADOW_LAYER = 1;

export type ShadowUniforms = {
  uShadowMap: { value: THREE.DepthTexture | null };
  uShadowMatrix: { value: THREE.Matrix4 };
  uShadowStr: { value: number };
  uShadowBias: { value: number };
  uShadowTexel: { value: number };
  uSunDir: { value: THREE.Vector3 };
};

export function shadowUniforms(): ShadowUniforms {
  return {
    uShadowMap: { value: null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uShadowStr: { value: 0 },
    uShadowBias: { value: 0.0001 },
    uShadowTexel: { value: 1 / 2048 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  };
}

/** 반투명(글자 · 이름표 등)은 사각형 그림자가 생기므로 불투명 · 컷아웃 메시만 그림자를 드리운다 */
export function markCasters(root: THREE.Object3D | null | undefined) {
  root?.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.every((m) => m && (!m.transparent || m.alphaTest > 0))) mesh.layers.enable(SHADOW_LAYER);
  });
}

/**
 * 그림자 맵이 없을 때 sampler2DShadow 에 물려 둘 1×1 깊이 텍스처.
 * 비교 모드가 없는 일반 텍스처가 물리면 WebGL 이 블록 드로우를 전부 거부해 지형이 안 보인다.
 */
export function createShadowStub(renderer: THREE.WebGLRenderer) {
  const depth = new THREE.DepthTexture(1, 1);
  depth.compareFunction = THREE.LessEqualCompare;
  const rt = new THREE.WebGLRenderTarget(1, 1, { depthTexture: depth, depthBuffer: true });
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.clear(true, true, false);
  renderer.setRenderTarget(prev);
  return rt;
}

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const NEAR = 1;
const FAR = 400;

/**
 * 블록 셰이더(ShaderMaterial)용 태양 그림자.
 * 플레이어 주변을 태양 방향에서 정사영으로 깊이만 그려 두고, 셰이더가 sampler2DShadow 로 비교한다.
 */
export class SunShadow {
  private rt: THREE.WebGLRenderTarget;
  private cam: THREE.OrthographicCamera;
  private texel: number;
  private q = new THREE.Quaternion();
  private qi = new THREE.Quaternion();
  private tmp = new THREE.Vector3();

  constructor(size: number, private span: number, private stub: THREE.DepthTexture) {
    const depth = new THREE.DepthTexture(size, size);
    depth.compareFunction = THREE.LessEqualCompare;
    depth.minFilter = THREE.LinearFilter;
    depth.magFilter = THREE.LinearFilter;
    this.rt = new THREE.WebGLRenderTarget(size, size, { depthTexture: depth, depthBuffer: true });
    this.cam = new THREE.OrthographicCamera(-span, span, span, -span, NEAR, FAR);
    this.cam.layers.set(SHADOW_LAYER);
    this.texel = (span * 2) / size;
  }

  /** sunDir: 태양을 향하는 단위 벡터, up: 태양 궤도의 회전축 (sunDir 와 평행해지지 않는 축) */
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, center: THREE.Vector3, sunDir: THREE.Vector3, up: THREE.Vector3, u: ShadowUniforms) {
    const cam = this.cam;
    cam.up.copy(up);
    cam.position.copy(sunDir);
    cam.lookAt(0, 0, 0);
    // 텍셀 단위로 중심을 맞춰 걸을 때 그림자 가장자리가 떨리지 않게 한다
    this.q.copy(cam.quaternion);
    this.qi.copy(this.q).invert();
    const ls = this.tmp.copy(center).applyQuaternion(this.qi);
    ls.x = Math.round(ls.x / this.texel) * this.texel;
    ls.y = Math.round(ls.y / this.texel) * this.texel;
    ls.applyQuaternion(this.q);
    cam.position.copy(ls).addScaledVector(sunDir, FAR / 2);
    cam.updateMatrixWorld(true);

    // 그리는 동안 자기 깊이 텍스처를 읽으면 피드백 루프가 되므로 잠시 뗀다
    const str = u.uShadowStr.value;
    u.uShadowMap.value = this.stub;
    u.uShadowStr.value = 0;
    const prev = renderer.getRenderTarget();
    const bg = scene.background;
    scene.background = null;
    renderer.setRenderTarget(this.rt);
    renderer.clear(true, true, false);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    scene.background = bg;
    u.uShadowMap.value = this.rt.depthTexture;
    u.uShadowStr.value = str;
    u.uShadowMatrix.value.multiplyMatrices(BIAS, cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    u.uShadowBias.value = 0.04 / (FAR - NEAR);
    u.uShadowTexel.value = 1 / this.rt.width;
  }

  get radius() {
    return this.span;
  }

  dispose() {
    this.rt.depthTexture?.dispose();
    this.rt.dispose();
  }
}
