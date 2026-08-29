import {
  AddEquation,
  AdditiveBlending,
  CustomBlending,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OneFactor,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SrcColorFactor,
  Vector2,
  WebGLRenderTarget,
  ZeroFactor,
} from 'three';
import type { Camera, WebGLRenderer } from 'three';

export const TRAIL_LAYER = 1;
export const OVERLAY_LAYER = 2;

/**
 * Motion blur for the light layer. Objects on TRAIL_LAYER render into a persistent HDR
 * buffer that decays every frame, so fast signals leave real, frame-rate independent
 * smears. The buffer is composited back into the main scene as an additive overlay quad.
 */
export class TrailAccumulator {
  readonly overlay: Mesh;
  private target: WebGLRenderTarget;
  private readonly fadeScene = new Scene();
  private readonly fadeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fadeMaterial: ShaderMaterial;
  private readonly overlayMaterial: ShaderMaterial;
  private readonly size = new Vector2();

  constructor(width: number, height: number) {
    this.target = this.makeTarget(width, height);

    // dst = dst * decay (Zero * src + SrcColor * dst, with src = decay)
    this.fadeMaterial = new ShaderMaterial({
      uniforms: { uDecay: { value: 0.85 } },
      vertexShader: /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uDecay; void main(){ gl_FragColor = vec4(vec3(uDecay), 1.0); }`,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: ZeroFactor,
      blendDst: SrcColorFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
      depthTest: false,
      depthWrite: false,
    });
    this.fadeScene.add(new Mesh(new PlaneGeometry(2, 2), this.fadeMaterial));

    this.overlayMaterial = new ShaderMaterial({
      uniforms: { uTrail: { value: this.target.texture }, uResolution: { value: new Vector2(width, height) }, uGain: { value: 0.15 } },
      vertexShader: /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uTrail; uniform vec2 uResolution; uniform float uGain;
        void main(){
          vec4 c = texture2D(uTrail, gl_FragCoord.xy / uResolution);
          gl_FragColor = vec4(c.rgb * uGain, 1.0);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.overlay = new Mesh(new PlaneGeometry(2, 2), this.overlayMaterial);
    this.overlay.frustumCulled = false;
    this.overlay.renderOrder = 1000;
    this.overlay.layers.set(OVERLAY_LAYER);
  }

  private makeTarget(w: number, h: number): WebGLRenderTarget {
    return new WebGLRenderTarget(w, h, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  /** Decay the buffer, then draw this frame's trail-layer objects into it. */
  update(renderer: WebGLRenderer, scene: Scene, camera: Camera, dt: number): void {
    renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target.dispose();
      this.target = this.makeTarget(this.size.x, this.size.y);
      this.overlayMaterial.uniforms.uTrail!.value = this.target.texture;
    }
    (this.overlayMaterial.uniforms.uResolution!.value as Vector2).copy(this.size);
    // ~150 ms half-life, independent of frame rate.
    const decay = Math.exp(-dt * 9.5);
    this.fadeMaterial.uniforms.uDecay!.value = decay;
    // Energy-conserving: a static object contributes exactly its own brightness once the
    // buffer settles; a moving one spreads the same energy along its path.
    this.overlayMaterial.uniforms.uGain!.value = (1 - decay) * 0.85;

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevMask = camera.layers.mask;
    renderer.setRenderTarget(this.target);
    renderer.autoClear = false;
    renderer.render(this.fadeScene, this.fadeCamera);
    camera.layers.set(TRAIL_LAYER);
    renderer.render(scene, camera);
    camera.layers.mask = prevMask;
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevTarget);
  }
}
