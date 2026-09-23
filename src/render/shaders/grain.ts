/**
 * Grain, vignette and desaturation, driven by sanity.
 *
 * One pass doing three things on purpose: each is a single cheap operation on the
 * sampled colour, and three separate passes would mean three full-screen reads against
 * a 3 ms budget.
 *
 * Uniforms:
 *   tDiffuse  the rendered scene
 *   uTime     seconds, to animate the grain
 *   uAmount   0-1, how far gone the player is (1 = lowest sanity)
 *   uVignette base vignette strength, always present
 */
export const GrainShader = {
  name: 'GrainShader',

  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uVignette: { value: 0.55 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uVignette;
    varying vec2 vUv;

    // Cheap hash noise. A texture lookup would be better quality and worse for the
    // frame budget; at this intensity nobody can tell.
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Vignette: always on, tightening as composure goes.
      vec2 centered = vUv - 0.5;
      float radius = length(centered) * 1.4;
      float vignette = smoothstep(0.85, 0.25, radius);
      color.rgb *= mix(1.0, vignette, uVignette + uAmount * 0.35);

      // Grain, animated per frame. Capped well below a strobe: an intensity that
      // flashes is a photosensitivity hazard, not atmosphere
      // (docs/horror-design-principles.md).
      float grain = hash(vUv * 512.0 + fract(uTime) * 91.7) - 0.5;
      color.rgb += grain * (0.035 + uAmount * 0.075);

      // Colour drains as composure does.
      float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = mix(color.rgb, vec3(luma), uAmount * 0.5);

      gl_FragColor = color;
    }
  `,
};
