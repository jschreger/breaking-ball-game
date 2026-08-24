// scene.js — Three.js world: ocean, carrier, jet, ghost ribbon, cameras.

import * as THREE from 'three';

const DECK_TOP = 21;
const HULL_LEN = 300, DECK_W = 74, DECK_L = 290;

function makeDeckTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 2048;   // u across width (x), v along length (z)
  const g = c.getContext('2d');
  g.fillStyle = '#4c5157'; g.fillRect(0, 0, c.width, c.height);
  // subtle weathering
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(20,22,25,${Math.random() * 0.08})`;
    const w = 4 + Math.random() * 40;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, w, 2 + Math.random() * 8);
  }
  // landing area (z 45..115 world -> v coords). Deck z: -145..+145 maps to v: 2048..0
  const zToV = z => ((145 - z) / 290) * c.height;
  const xToU = x => ((x + DECK_W / 2) / DECK_W) * c.width;

  g.fillStyle = 'rgba(30,32,36,0.55)';
  g.fillRect(xToU(-34), zToV(115), xToU(34) - xToU(-34), zToV(45) - zToV(115));

  g.strokeStyle = '#e8e8e8'; g.lineWidth = 6;
  g.strokeRect(xToU(-34), zToV(115), xToU(34) - xToU(-34), zToV(45) - zToV(115));
  // centerline dashes through the landing area and down the deck
  g.setLineDash([40, 28]);
  g.beginPath(); g.moveTo(c.width / 2, 0); g.lineTo(c.width / 2, c.height); g.stroke();
  g.setLineDash([]);
  // wire hash marks
  [70, 78, 86, 94].forEach(z => {
    g.fillStyle = '#f2f2f2';
    g.fillRect(xToU(-30), zToV(z) - 3, xToU(30) - xToU(-30), 6);
  });
  // deck number near bow + angled-deck stripe for flavor
  g.save();
  g.translate(c.width / 2, zToV(-100)); g.rotate(Math.PI);
  g.fillStyle = '#ffffff'; g.font = 'bold 120px monospace'; g.textAlign = 'center';
  g.fillText('68', 0, 0); g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function buildCarrier() {
  const ship = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x565b60, roughness: 0.85 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(38, 26, HULL_LEN), hullMat);
  hull.position.y = 8; ship.add(hull);

  const deckTex = makeDeckTexture();
  const deckTop = new THREE.Mesh(
    new THREE.PlaneGeometry(DECK_W, DECK_L),
    new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.9 })
  );
  deckTop.rotation.x = -Math.PI / 2;
  deckTop.position.y = DECK_TOP;
  const deckSlab = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, 1.2, DECK_L), hullMat);
  deckSlab.position.y = DECK_TOP - 0.6;
  ship.add(deckSlab, deckTop);

  // island (starboard)
  const island = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.BoxGeometry(10, 16, 26), hullMat);
  tower.position.y = 8;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 14), hullMat);
  mast.position.y = 23;
  island.add(tower, mast);
  island.position.set(DECK_W / 2 - 7, DECK_TOP + 1, -18);
  ship.add(island);

  // arresting wires
  const wireMats = [];
  WIRES.forEach(wz => {
    const m = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, emissive: 0x000000 });
    wireMats.push(m);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, DECK_W - 6, 6), m);
    wire.rotation.z = Math.PI / 2;
    wire.position.set(0, DECK_TOP + 0.3, wz);
    ship.add(wire);
  });

  ship.userData.wireMats = wireMats;
  return ship;
}
const WIRES = [70, 78, 86, 94];

function buildJet() {
  const jet = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xbfc7cc, roughness: 0.45, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x30353a, roughness: 0.6 });

  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 8.5, 4, 12), body);
  fus.rotation.x = Math.PI / 2;   // long axis along z
  jet.add(fus);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.02, 3, 12), dark);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -7.2;
  jet.add(nose);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.28, 3.6), body);
  wing.position.z = 0.6;
  jet.add(wing);

  const stab = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.22, 1.8), body);
  stab.position.z = 5.2; jet.add(stab);

  [-1, 1].forEach(s => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.4, 2.2), dark);
    fin.position.set(s * 2.1, 1.2, 5.0);
    fin.rotation.z = -s * 0.16;
    jet.add(fin);
  });

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x27414f, roughness: 0.15, metalness: 0.7 })
  );
  canopy.scale.set(1, 0.75, 2.1);
  canopy.position.set(0, 0.85, -2.6);
  jet.add(canopy);

  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8830, transparent: true, opacity: 0.9 });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), glowMat);
  glow.position.z = 7.05;
  glow.rotation.y = Math.PI;
  jet.add(glow);
  jet.userData.glowMat = glowMat;

  return jet;
}

export class Scene3D {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fb8d9);
    this.scene.fog = new THREE.Fog(0x8fb8d9, 1800, 11000);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 40000);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2a3b4a, 0.9);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.5);
    sun.position.set(-600, 800, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, far: 3000 });
    this.scene.add(hemi, sun);

    // ocean — animated near field + static far plane
    this.oceanGeo = new THREE.PlaneGeometry(9000, 9000, 56, 56);
    this.ocean = new THREE.Mesh(
      this.oceanGeo,
      new THREE.MeshStandardMaterial({ color: 0x14406b, roughness: 0.35, metalness: 0.25 })
    );
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.receiveShadow = true;
    const basePos = this.oceanGeo.attributes.position;
    this.oceanBase = new Float32Array(basePos.array);
    this.scene.add(this.ocean);

    const farOcean = new THREE.Mesh(
      new THREE.PlaneGeometry(60000, 60000),
      new THREE.MeshStandardMaterial({ color: 0x123a60, roughness: 0.5 })
    );
    farOcean.rotation.x = -Math.PI / 2;
    farOcean.position.y = -0.3;
    this.scene.add(farOcean);

    this.carrier = buildCarrier();
    this.scene.add(this.carrier);
    this.jet = buildJet();
    this.jet.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.scene.add(this.jet);

    // ghost ribbon group
    this.ghostGroup = new THREE.Group();
    this.scene.add(this.ghostGroup);

    this.camMode = 0; // 0 chase, 1 cockpit, 2 tower
    this._boomT = -1;
    this._boom = null;
    this._time = 0;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  setGhost(pts) {
    while (this.ghostGroup.children.length) {
      const c = this.ghostGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    const v3 = pts.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(v3);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 420, 2.1, 8, false),
      new THREE.MeshBasicMaterial({
        color: 0x38e1ff, transparent: true, opacity: 0.26,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.ghostGroup.add(tube);

    const ringGeo = new THREE.TorusGeometry(5.5, 0.45, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x9fefff, transparent: true, opacity: 0.5 });
    for (let i = 6; i < v3.length - 1; i += 14) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(v3[i]);
      ring.lookAt(v3[i + 1]);
      this.ghostGroup.add(ring);
    }
    // touchdown basket
    const end = v3[v3.length - 1];
    const basket = new THREE.Mesh(
      new THREE.TorusGeometry(9, 0.7, 10, 28),
      new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.85 })
    );
    basket.position.copy(end);
    basket.lookAt(v3[v3.length - 4]);
    this.ghostGroup.add(basket);
  }

  flashWire(idx) {
    const mats = this.carrier.userData.wireMats;
    if (mats && idx >= 1 && idx <= 4) mats[idx - 1].emissive.setHex(0xffffff);
  }

  spawnBoom(pos, color) {
    const geo = new THREE.SphereGeometry(1, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    this._boom = new THREE.Mesh(geo, mat);
    this._boom.position.copy(pos);
    this._boomT = 0;
    this.scene.add(this._boom);
  }

  updateJet(pos, quat, throttle) {
    this.jet.position.copy(pos);
    this.jet.quaternion.copy(quat);
    this.jet.userData.glowMat.opacity = 0.35 + throttle * 0.6;
  }

  updateCamera(dt, pos, quat) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    let desired, lookAt;
    if (this.camMode === 0) {
      desired = pos.clone().addScaledVector(fwd, -26).add(new THREE.Vector3(0, 9, 0));
      lookAt = pos.clone().addScaledVector(fwd, 30);
      this.camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
    } else if (this.camMode === 1) {
      desired = pos.clone().addScaledVector(fwd, 1.2).add(new THREE.Vector3(0, 1.4, 0));
      lookAt = pos.clone().addScaledVector(fwd, 60);
      this.camera.position.copy(desired);
    } else {
      desired = new THREE.Vector3(52, DECK_TOP + 26, 148);
      lookAt = pos;
      this.camera.position.lerp(desired, 1 - Math.exp(-10 * dt));
    }
    this.camera.lookAt(lookAt);
  }

  render(dt) {
    this._time += dt;
    // gentle ocean swell
    const p = this.oceanGeo.attributes.position;
    const arr = p.array, base = this.oceanBase;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], y = base[i + 1];
      arr[i + 2] =
        Math.sin(x * 0.008 + this._time * 0.9) * 1.6 +
        Math.cos(y * 0.01 + this._time * 0.7) * 1.2;
    }
    p.needsUpdate = true;

    // pulsing ghost
    this.ghostGroup.children.forEach((c, i) => {
      if (c.material && c.material.transparent && i > 0) {
        c.material.opacity = 0.35 + 0.25 * Math.sin(this._time * 3 + i * 0.4);
      }
    });

    // explosion / splash animation
    if (this._boom && this._boomT >= 0) {
      this._boomT += dt;
      const s = 2 + this._boomT * 26;
      this._boom.scale.setScalar(s);
      this._boom.material.opacity = Math.max(0, 0.95 - this._boomT * 0.8);
      if (this._boomT > 1.4) {
        this.scene.remove(this._boom);
        this._boom.geometry.dispose(); this._boom.material.dispose();
        this._boom = null; this._boomT = -1;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  resetShipWires() {
    this.carrier.userData.wireMats.forEach(m => m.emissive.setHex(0x000000));
  }
}

export { DECK_TOP };
