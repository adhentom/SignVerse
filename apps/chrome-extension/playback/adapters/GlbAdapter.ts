import {
  AmbientLight,
  AnimationAction,
  AnimationMixer,
  Clock,
  Color,
  DirectionalLight,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import type { AvatarProfile } from '../avatarProfiles';
import type { LoadedAsset, Renderer } from '../types';

export class GlbAdapter implements Renderer {
  readonly format = 'glb' as const;
  private webgl?: WebGLRenderer;
  private mixer?: AnimationMixer;
  private action?: AnimationAction;
  private frame = 0;
  private speed = 1;
  private playing = false;
  private readonly clock = new Clock();

  constructor(private readonly profile: AvatarProfile, private readonly vrm = false) {}

  async mount(target: HTMLElement, asset: LoadedAsset, reducedMotion: boolean): Promise<void> {
    this.destroy();
    if (!(asset.data instanceof ArrayBuffer)) throw new Error('The 3D avatar asset is corrupted.');

    const scene = new Scene();
    scene.background = new Color(0x0b0f18);
    const camera = new PerspectiveCamera(32, 1, 0.01, 100);
    camera.position.set(0, 1.25, 3.2);
    scene.add(new AmbientLight(0xffffff, 2.2));
    const key = new DirectionalLight(0xffffff, 3.2);
    key.position.set(2, 4, 3);
    scene.add(key);

    this.webgl = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.webgl.setSize(target.clientWidth || 220, target.clientHeight || 300, false);
    this.webgl.domElement.setAttribute('aria-hidden', 'true');
    target.append(this.webgl.domElement);

    const loader = new GLTFLoader();
    if (this.vrm) loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(asset.data, '');
    const model = gltf.userData.vrm?.scene ?? gltf.scene;
    model.scale.setScalar(this.profile.scale);
    model.position.y = -1.05;
    model.traverse((object: Object3D) => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
        object.material = object.material.clone();
        object.material.color.lerp(new Color(this.profile.color), 0.32);
      }
    });
    scene.add(model);

    this.mixer = new AnimationMixer(model);
    const clip = gltf.animations[0];
    if (clip) {
      this.action = this.mixer.clipAction(clip);
      this.action.setLoop(LoopRepeat, Infinity).play();
      this.action.paused = reducedMotion;
    }

    const render = () => {
      this.frame = requestAnimationFrame(render);
      const delta = Math.min(this.clock.getDelta(), 0.05);
      if (this.playing && !reducedMotion) this.mixer?.update(delta * this.speed);
      gltf.userData.vrm?.update(delta);
      this.webgl?.render(scene, camera);
    };
    render();
  }

  play(speed: number): void {
    this.speed = speed;
    this.playing = true;
    this.action?.reset().fadeIn(0.18).play();
  }

  pause(): void {
    this.playing = false;
  }

  seek(progress: number): void {
    if (!this.action || !this.mixer) return;
    this.mixer.setTime(Math.max(0, Math.min(1, progress)) * this.action.getClip().duration);
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.action?.fadeOut(0.15);
    this.mixer?.stopAllAction();
    this.webgl?.dispose();
    this.webgl?.domElement.remove();
    this.webgl = undefined;
    this.mixer = undefined;
    this.action = undefined;
  }
}
