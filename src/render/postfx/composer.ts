/**
 * The post chain (src/render/CLAUDE.md).
 *
 * Budget: 3 ms. One pass, so one full-screen read — see `shaders/grain.ts` for why the
 * three effects share it.
 */
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { GrainShader } from '../shaders/grain.js';

export interface PostChain {
  render(): void;
  resize(width: number, height: number, pixelRatio: number): void;
  /** @param amount 0 (composed) to 1 (gone). */
  setIntensity(amount: number): void;
  setTime(seconds: number): void;
  dispose(): void;
}

export function createPostChain(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): PostChain {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const grain = new ShaderPass(GrainShader);
  grain.renderToScreen = true;
  composer.addPass(grain);

  return {
    render(): void {
      composer.render();
    },

    resize(width: number, height: number, pixelRatio: number): void {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },

    setIntensity(amount: number): void {
      const uniform = grain.uniforms['uAmount'];
      if (uniform !== undefined) uniform.value = amount;
    },

    setTime(seconds: number): void {
      const uniform = grain.uniforms['uTime'];
      if (uniform !== undefined) uniform.value = seconds;
    },

    dispose(): void {
      // Composer owns its render targets; they leak without this.
      composer.dispose();
      grain.dispose?.();
    },
  };
}
