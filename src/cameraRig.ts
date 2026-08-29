import { CatmullRomCurve3, PerspectiveCamera, Vector3 } from 'three';
import { ANSWER, LOOP } from './schedule';

/**
 * One slow dolly push toward the root over the loop, with a barely perceptible lateral drift,
 * then a gentle pull-back as the field recedes. Target stays almost locked. No orbit, no sway.
 */
const POSITIONS = [
  new Vector3(0, 5, 118),   // 0s  dormant, wide
  new Vector3(1, 4.5, 106), // 4s  landing
  new Vector3(-4, 4, 96),   // 8s  catalog resolves
  new Vector3(-2, 2, 80),   // 12s deepest point of the push: cross-validation, configurations
  new Vector3(5, 4, 96),    // 16s validated answer
];
const TARGETS = [
  new Vector3(0, 0, -6),
  new Vector3(0, 0, -6),
  new Vector3(-3, -1, -7),
  new Vector3(0, -1, -9),
  new Vector3(2, 0, -7),
];

const IDLE_RETURN = 6; // seconds without input before the camera eases back to the path

export class CameraRig {
  readonly camera: PerspectiveCamera;
  private readonly posCurve = new CatmullRomCurve3(POSITIONS, true, 'centripetal', 0.5);
  private readonly tgtCurve = new CatmullRomCurve3(TARGETS, true, 'centripetal', 0.5);
  private readonly autoPos = new Vector3();
  private readonly autoTgt = new Vector3();
  private readonly pos = new Vector3();
  private readonly tgt = new Vector3();
  private readonly tmp = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  /** normalized pointer, -1..1 */
  private pointer = { x: 0, y: 0 };
  private parallax = { x: 0, y: 0 };
  focusDistance = 40;
  /** prefers-reduced-motion: hold the wide pose, no drift or parallax */
  reducedMotion = false;

  // Manual camera: orbit around a target. Blended over the cinematic path.
  private readonly manualTgt = new Vector3();
  private yaw = 0;
  private pitch = 0;
  private dist = 100;
  private blend = 0;
  private blendTarget = 0;
  private lastInput = -Infinity;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(36, aspect, 0.1, 600);
  }

  get manual(): boolean {
    return this.blend > 0.5;
  }

  setPointer(x: number, y: number): void {
    this.pointer = { x, y };
  }

  /** Take over from the path, starting exactly where the camera is now. */
  private engage(wallTime: number): void {
    if (this.blendTarget === 0 && this.blend < 0.01) {
      this.manualTgt.copy(this.tgt);
      const off = this.tmp.copy(this.pos).sub(this.tgt);
      this.dist = off.length();
      this.yaw = Math.atan2(off.x, off.z);
      this.pitch = Math.asin(Math.min(1, Math.max(-1, off.y / this.dist)));
    }
    this.blendTarget = 1;
    this.lastInput = wallTime;
  }

  orbit(dYaw: number, dPitch: number, wallTime: number): void {
    this.engage(wallTime);
    this.yaw += dYaw;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + dPitch));
  }

  dolly(factor: number, wallTime: number): void {
    this.engage(wallTime);
    this.dist = Math.max(18, Math.min(280, this.dist * factor));
  }

  /** Pan the orbit target in screen space (units scale with distance). */
  pan(dx: number, dy: number, wallTime: number): void {
    this.engage(wallTime);
    const scale = this.dist * 0.0012;
    this.manualTgt.addScaledVector(this.right, -dx * scale).addScaledVector(this.up, dy * scale);
  }

  /** Return to the cinematic path now. */
  release(): void {
    this.blendTarget = 0;
  }

  update(loopTime: number, wallTime: number, dt: number): void {
    const u = this.reducedMotion ? 0 : (loopTime / LOOP) % 1;
    this.posCurve.getPointAt(u, this.autoPos);
    this.tgtCurve.getPointAt(u, this.autoTgt);

    if (!this.reducedMotion) {
      // Micro drift: a mounted camera on a very slow slider, not a hand.
      this.autoPos.x += Math.sin(wallTime * 0.11) * 0.08;
      this.autoPos.y += Math.sin(wallTime * 0.09 + 1.3) * 0.05;
    }

    // Pointer parallax, damped (auto mode only).
    const k = 1 - Math.exp(-dt * 1.2);
    this.parallax.x += (this.pointer.x * 0.6 - this.parallax.x) * k;
    this.parallax.y += (this.pointer.y * 0.4 - this.parallax.y) * k;
    const px = this.reducedMotion ? 0 : 1 - this.blend;
    this.autoPos.x += this.parallax.x * px;
    this.autoPos.y += this.parallax.y * px;

    if (this.blendTarget === 1 && wallTime - this.lastInput > IDLE_RETURN) this.blendTarget = 0;
    const rate = this.blendTarget === 1 ? 4 : 0.7; // take over quickly, hand back slowly
    this.blend += (this.blendTarget - this.blend) * (1 - Math.exp(-dt * rate));
    if (this.blend < 0.002) this.blend = 0;

    const cp = Math.cos(this.pitch);
    const manualPos = this.tmp.set(
      this.manualTgt.x + Math.sin(this.yaw) * cp * this.dist,
      this.manualTgt.y + Math.sin(this.pitch) * this.dist,
      this.manualTgt.z + Math.cos(this.yaw) * cp * this.dist,
    );
    const b = this.blend * this.blend * (3 - 2 * this.blend);
    this.pos.copy(this.autoPos).lerp(manualPos, b);
    this.tgt.copy(this.autoTgt).lerp(this.manualTgt, b);

    // Dolly-zoom on the answer: FOV opens while the camera pushes in, so the root holds
    // its size and the whole field seems to expand behind it.
    const zAge = loopTime - ANSWER;
    let fov = 36;
    if (zAge >= 0 && zAge < 1.6 && !this.reducedMotion) {
      const pulse = Math.pow(Math.sin((zAge / 1.6) * Math.PI), 2);
      fov = 36 + 16 * pulse;
      const ratio = Math.tan((36 * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360);
      this.pos.sub(this.tgt).multiplyScalar(ratio).add(this.tgt);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.tgt);
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.focusDistance = this.pos.distanceTo(this.tgt);
  }
}
