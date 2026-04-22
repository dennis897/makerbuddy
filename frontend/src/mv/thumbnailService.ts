import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const KEY = (id: string) => `mv_thumb_v3_${id}`;
const W = 300, H = 200;

interface QueueItem {
  fileId: string;
  fileType: string;
  downloadUrl: string;
  geoUrl: string;
  resolve: (url: string | null) => void;
  reject: (err: unknown) => void;
}

class ThumbnailService {
  private _r: THREE.WebGLRenderer | null = null;
  private _cam: THREE.PerspectiveCamera | null = null;
  private _scene: THREE.Scene | null = null;
  private _queue: QueueItem[] = [];
  private _busy = false;

  private _init() {
    if (this._r) return;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    this._r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this._r.setSize(W, H);
    this._r.setClearColor(0x111318);
    this._cam = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    this._cam.position.set(4, 4, 6);
    this._cam.lookAt(0, 1.5, 0);
    this._scene = new THREE.Scene();
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const d1 = new THREE.DirectionalLight(0xffffff, 1); d1.position.set(10, 10, 5); this._scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.3); d2.position.set(-5, -5, -3); this._scene.add(d2);
  }

  private _snap(geo: THREE.BufferGeometry, s: number, liftY: number): string {
    const mat = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.4, metalness: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(s);
    mesh.position.set(0, liftY, 0);
    this._scene!.add(mesh);
    this._r!.render(this._scene!, this._cam!);
    const url = this._r!.domElement.toDataURL('image/jpeg', 0.82);
    this._scene!.remove(mesh); geo.dispose(); mat.dispose();
    return url;
  }

  private async _generate(fileType: string, downloadUrl: string, geoUrl: string): Promise<string | null> {
    this._init();
    if (fileType === 'stl') {
      return new Promise((resolve, reject) => {
        new STLLoader().load(downloadUrl, (geo) => {
          try {
            geo.computeVertexNormals(); geo.center(); geo.computeBoundingBox();
            const b = geo.boundingBox!;
            const s = 3 / Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
            resolve(this._snap(geo, s, -b.min.y * s));
          } catch (e) { reject(e); }
        }, undefined, reject);
      });
    }
    if (fileType === '3mf') {
      const res = await fetch(geoUrl);
      if (!res.ok) throw new Error('geo fetch failed');
      const { positions } = await res.json() as { positions: number[] };
      if (!positions?.length) throw new Error('no geometry');
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      geo.computeVertexNormals(); geo.computeBoundingBox();
      const b = geo.boundingBox!;
      geo.translate(-(b.max.x + b.min.x) / 2, -b.min.y, -(b.max.z + b.min.z) / 2);
      geo.computeBoundingBox();
      const b2 = geo.boundingBox!, sz = new THREE.Vector3(); b2.getSize(sz);
      const s = 3 / Math.max(sz.x, sz.y, sz.z, 0.001);
      return this._snap(geo, s, 0);
    }
    return null;
  }

  request(fileId: string, fileType: string, downloadUrl: string, geoUrl: string): Promise<string | null> {
    try { const c = localStorage.getItem(KEY(fileId)); if (c) return Promise.resolve(c); } catch { /* ignore */ }
    return new Promise((resolve, reject) => {
      this._queue.push({ fileId, fileType, downloadUrl, geoUrl, resolve, reject });
      this._pump();
    });
  }

  private async _pump() {
    if (this._busy || !this._queue.length) return;
    this._busy = true;
    const { fileId, fileType, downloadUrl, geoUrl, resolve, reject } = this._queue.shift()!;
    try {
      const url = await this._generate(fileType, downloadUrl, geoUrl);
      if (url) { try { localStorage.setItem(KEY(fileId), url); } catch { /* ignore */ } }
      resolve(url);
    } catch (e) { reject(e); }
    finally { this._busy = false; this._pump(); }
  }
}

export const thumbnailService = new ThumbnailService();
