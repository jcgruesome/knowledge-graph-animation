import { Matrix4, Uniform, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import { BlendFunction, Effect } from 'postprocessing';

const fragment = /* glsl */ `
  uniform mat4 uInvProj;
  uniform mat4 uCamWorld;
  uniform vec3 uRoot;
  uniform float uRootI;
  uniform vec3 uCenters[3];
  uniform vec3 uTints[3];
  uniform float uActs[3];
  uniform float uTime;
  uniform float uGain;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { return vnoise(p) * 0.65 + vnoise(p * 2.3 + 7.1) * 0.35; }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 clip = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    vec4 v = uInvProj * clip;
    vec3 dirW = normalize((uCamWorld * vec4(normalize(v.xyz / v.w), 0.0)).xyz);
    vec3 camPos = uCamWorld[3].xyz;
    float jitter = hash(vec3(uv * 913.0, fract(uTime)));

    const int N = 22;
    const float t0 = 6.0;
    const float t1 = 230.0;
    vec3 acc = vec3(0.0);
    float trans = 1.0;
    for (int i = 0; i < N; i++) {
      float f = (float(i) + jitter) / float(N);
      float d = t0 + (t1 - t0) * f * f;                 // denser sampling up close
      float stepLen = (t1 - t0) * (2.0 * f + 1.0 / float(N)) / float(N);
      vec3 p = camPos + dirW * d;
      float n = fbm(p * 0.035 + vec3(uTime * 0.02, 0.0, uTime * 0.012));
      float dens = 0.0016 * (0.35 + n);
      vec3 tint = vec3(0.22, 0.5, 1.0) * 0.22;
      for (int c = 0; c < 3; c++) {
        vec3 dc = p - uCenters[c];
        float g = exp(-dot(dc, dc) / (2.0 * 17.0 * 17.0)) * uActs[c];
        dens += 0.008 * g * (0.5 + n);
        tint += uTints[c] * g * 1.1;
      }
      vec3 dr = p - uRoot;
      float light = uRootI / (1.0 + dot(dr, dr) * 0.0035);
      vec3 scatter = tint * (light + 0.06);
      acc += trans * dens * stepLen * scatter;
      trans *= exp(-dens * stepLen);
    }
    outputColor = vec4(acc * uGain, 1.0);
  }
`;

/**
 * Ray-marched single-scattering haze: a low-frequency fog volume, thicker around awake
 * systems, lit by the root. Gives the god rays a real medium to travel through.
 */
export class VolumetricHazeEffect extends Effect {
  private readonly invProj = new Matrix4();

  constructor() {
    super('VolumetricHazeEffect', fragment, {
      blendFunction: BlendFunction.ADD,
      uniforms: new Map<string, Uniform>([
        ['uInvProj', new Uniform(new Matrix4())],
        ['uCamWorld', new Uniform(new Matrix4())],
        ['uRoot', new Uniform(new Vector3())],
        ['uRootI', new Uniform(0)],
        ['uCenters', new Uniform([new Vector3(), new Vector3(), new Vector3()])],
        ['uTints', new Uniform([new Vector3(), new Vector3(), new Vector3()])],
        ['uActs', new Uniform([0, 0, 0])],
        ['uTime', new Uniform(0)],
        ['uGain', new Uniform(0.8)],
      ]),
    });
  }

  setStatic(root: Vector3, centers: Vector3[], tints: Vector3[]): void {
    (this.uniforms.get('uRoot')!.value as Vector3).copy(root);
    const c = this.uniforms.get('uCenters')!.value as Vector3[];
    const t = this.uniforms.get('uTints')!.value as Vector3[];
    for (let i = 0; i < 3; i++) {
      c[i]!.copy(centers[i] ?? centers[0]!);
      t[i]!.copy(tints[i] ?? tints[0]!);
    }
  }

  updateFrame(camera: PerspectiveCamera, time: number, rootIntensity: number, acts: number[]): void {
    this.invProj.copy(camera.projectionMatrix).invert();
    (this.uniforms.get('uInvProj')!.value as Matrix4).copy(this.invProj);
    (this.uniforms.get('uCamWorld')!.value as Matrix4).copy(camera.matrixWorld);
    this.uniforms.get('uRootI')!.value = rootIntensity;
    const a = this.uniforms.get('uActs')!.value as number[];
    for (let i = 0; i < 3; i++) a[i] = acts[i] ?? 0;
    this.uniforms.get('uTime')!.value = time;
  }
}
