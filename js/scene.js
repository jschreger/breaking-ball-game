// scene.js — Three.js world: ocean, carrier, baseball-plane, gates, cameras.
// Designer spec: plane = baseball with wings; carrier bigger, with parked
// planes; NO ghost ribbon — the player flies orange gates themselves.

import * as THREE from './vendor/three.module.js';

const DECK_TOP = 21;
const HULL_LEN = 300, DECK_W = 74, DECK_L = 290;
const SHIP_SCALE = 1.4;            // XZ only — deck height stays at 21 m

function makeDeckTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 2048;   // u across width (x), v along length (z)
  const g = c.getContext('2d');
  g.fillStyle = '#4c5157'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(20,22,25,${Math.random() * 0.08})`;
    const w = 4 + Math.random() * 40;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, w, 2 + Math.random() * 8);
  }
  const zToV = z => ((145 - z) / 290) * c.height;
  const xToU = x => ((x + DECK_W / 2) / DECK_W) * c.width;

  // landing area (local z 45..115 → world 63..161 after 1.4x scale)
  g.fillStyle = 'rgba(30,32,36,0.55)';
  g.fillRect(xToU(-34), zToV(115), xToU(34) - xToU(-34), zToV(45) - zToV(115));
  g.strokeStyle = '#e8e8e8'; g.lineWidth = 6;
  g.strokeRect(xToU(-34), zToV(115), xToU(34) - xToU(-34), zToV(45) - zToV(115));
  g.setLineDash([40, 28]);
  g.beginPath(); g.moveTo(c.width / 2, 0); g.lineTo(c.width / 2, c.height); g.stroke();
  g.setLineDash([]);
  [70, 78, 86, 94].forEach(z => {
    g.fillStyle = '#f2f2f2';
    g.fillRect(xToU(-30), zToV(z) - 3, xToU(30) - xToU(-30), 6);
  });
  g.save();
  g.translate(c.width / 2, zToV(-100)); g.rotate(Math.PI);
  g.fillStyle = '#ffffff'; g.font = 'bold 120px monospace'; g.textAlign = 'center';
  g.fillText('68', 0, 0); g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

const WIRES = [70, 78, 86, 94]; // local z — world z = local * 1.4

// simplified parked baseball-plane for the deck
function buildParkedPlane() {
  const g = new THREE.Group();
  const gray = new THREE.MeshStandardMaterial({ color: 0x9aa2a9, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x565b60, roughness: 0.7 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), gray);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(10, 0.26, 3), gray);
  wing.position.z = 0.5;
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.2, 1.5), gray);
  stab.position.z = 4.2;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.6, 1.5), dark);
  fin.position.set(0, 0.9, 4.2);
  g.add(ball, wing, stab, fin);
  return g;
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

  const island = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.BoxGeometry(10, 16, 26), hullMat);
  tower.position.y = 8;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 14), hullMat);
  mast.position.y = 23;
  island.add(tower, mast);
  island.position.set(DECK_W / 2 - 7, DECK_TOP + 1, -18);
  ship.add(island);

  const wireMats = [];
  WIRES.forEach(wz => {
    const m = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, emissive: 0x000000 });
    wireMats.push(m);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, DECK_W - 6, 6), m);
    wire.rotation.z = Math.PI / 2;
    wire.position.set(0, DECK_TOP + 0.3, wz);
    ship.add(wire);
  });

  // parked planes on the forward deck
  for (let i = 0; i < 5; i++) {
    const p = buildParkedPlane();
    p.position.set(-20 + (i % 2) * 9, DECK_TOP + 1.4, -28 - i * 19);
    p.rotation.y = Math.PI + (i - 2) * 0.14;   // facing bow, staggered
    ship.add(p);
  }

  ship.scale.set(SHIP_SCALE, 1, SHIP_SCALE);   // bigger, same deck height
  ship.userData.wireMats = wireMats;
  return ship;
}

// the player's plane: a BASEBALL WITH WINGS
function buildJet() {
  const jet = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.35 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd42a2a, roughness: 0.5 });

  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 16), white);
  jet.add(ball);

  // red stitching
  const seamGeo = new THREE.TorusGeometry(1.71, 0.09, 8, 40, Math.PI * 1.25);
  const s1 = new THREE.Mesh(seamGeo, red);
  s1.rotation.set(0.55, 0, 0.45);
  const s2 = new THREE.Mesh(seamGeo, red);
  s2.rotation.set(-0.55, Math.PI, -0.45);
  jet.add(s1, s2);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 3.4), white);
  wing.position.set(0, -0.2, 0.6);
  jet.add(wing);
  [-1, 1].forEach(s => {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.34, 3.4), red);
    tip.position.set(s * 5.3, -0.2, 0.6);
    jet.add(tip);
  });

  const stab = new THREE.Mesh(new THREE.BoxGeometry(5, 0.24, 1.7), white);
  stab.position.z = 4.6; jet.add(stab);
  [-1, 1].forEach(s => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.0, 1.9), red);
    fin.position.set(s * 1.9, 1.0, 4.5);
    fin.rotation.z = -s * 0.2;
    jet.add(fin);
  });

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x27414f, roughness: 0.15, metalness: 0.7 })
  );
  canopy.scale.set(1, 0.7, 1.6);
  canopy.position.set(0, 1.1, -0.6);
  jet.add(canopy);

  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8830, transparent: true, opacity: 0.9 });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), glowMat);
  glow.position.z = 6.3;
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
    this.scene.fog = new THREE.Fog(0x8fb8d9, 1800, 12000);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 40000);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2a3b4a, 0.9);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.5);
    sun.position.set(-600, 800, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, far: 3000 });
    this.scene.add(hemi, sun);

    this.oceanGeo = new THREE.PlaneGeometry(9000, 9000, 56, 56);
    this.ocean = new THREE.Mesh(
      this.oceanGeo,
      new THREE.MeshStandardMaterial({ color: 0x14406b, roughness: 0.35, metalness: 0.25 })
    );
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.receiveShadow = true;
    this.oceanBase = new Float32Array(this.oceanGeo.attributes.position.array);
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
    this.jet.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.jet);

    this.gateGroup = new THREE.Group();
    this.scene.add(this.gateGroup);
    this.gates = [];
    this.gatePts = [];

    this.camMode = 0;
    this._boomT = -1;
    this._boom = null;
    this._time = 0;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // GATES instead of a ribbon — the player flies them, nothing flies for them.
  setGates(pts) {
    this.clearGates();
    const n = pts.length;
    const every = Math.max(10, Math.floor(n / 13));
    for (let i = every; i < n - 2; i += every) this.gatePts.push({ pos: pts[i], next: pts[i + 1] });
    this.gatePts.push({ pos: pts[n - 1], next: pts[n - 2] });   // touchdown gate

    this.gates = this.gatePts.map((gp, idx) => {
      const entry = idx === 0;
      const geo = new THREE.TorusGeometry(entry ? 26 : 15, entry ? 1.2 : 0.7, 8, 28);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.85 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(gp.pos.x, gp.pos.y, gp.pos.z);
      m.lookAt(gp.next.x, gp.next.y, gp.next.z);
      this.gateGroup.add(m);
      return m;
    });
    this.setNextGate(0);
  }

  setNextGate(i) {
    this.nextGateIdx = i;
    this.gates.forEach((g, idx) => {
      g.visible = idx >= i;
      const isNext = idx === i;
      g.material.color.setHex(isNext ? 0xff9f43 : 0x38e1ff);
      g.material.opacity = isNext ? 0.9 : 0.15;
    });
  }

  clearGates() {
    for (const g of this.gates) {
      this.gateGroup.remove(g);
      g.geometry.dispose(); g.material.dispose();
    }
    this.gates = []; this.gatePts = [];
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
      desired = new THREE.Vector3(70, DECK_TOP + 30, 205);
      lookAt = pos;
      this.camera.position.lerp(desired, 1 - Math.exp(-10 * dt));
    }
    this.camera.lookAt(lookAt);
  }

  render(dt) {
    this._time += dt;
    const p = this.oceanGeo.attributes.position;
    const arr = p.array, base = this.oceanBase;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], y = base[i + 1];
      arr[i + 2] =
        Math.sin(x * 0.008 + this._time * 0.9) * 1.6 +
        Math.cos(y * 0.01 + this._time * 0.7) * 1.2;
    }
    p.needsUpdate = true;

    // pulse ONLY the next gate
    if (this.gates[this.nextGateIdx || 0]) {
      const g = this.gates[this.nextGateIdx];
      g.material.opacity = 0.7 + 0.25 * Math.sin(this._time * 4);
    }

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
