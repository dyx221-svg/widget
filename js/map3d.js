/* 3D-карта курорта: низкополигональная гора на Three.js.
   Геометрия та же, что у 2D-схемы (js/map.js), данные — из той же модели дня. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const S = window.SKI, U = window.SKI_UTIL, G = window.SKI_GEO, APP = window.SKI_APP;
const panel = document.querySelector('.map-panel');
const host = document.getElementById('map3d');
const lblHost = document.getElementById('lbl3d');
const seg = document.getElementById('viewSeg');
const wrap = document.getElementById('mapWrap');

// ---------- Координаты: 2D-схема (x 0..1000, y 0..610) → мир ----------
const SC = 0.1;
const wx = x => (x - 500) * SC;
const wz = y => (y - 556) * SC;
function noise(x, y) {
  return Math.sin(x * 0.031 + 1.7) * Math.cos(y * 0.027) * 0.9 +
    Math.sin(x * 0.071 + y * 0.053) * 0.45 + Math.cos(x * 0.13 - y * 0.11) * 0.22;
}
// Высота рельефа: склон до гребня по силуэту схемы, за гребнем — спад
function height(x, y) {
  const r = G.ridgeY(Math.max(0, Math.min(1000, x)));
  let h;
  if (y >= r) h = (556 - y) * 0.085;
  else { const hr = (556 - r) * 0.085; h = Math.max(hr * 0.3, hr - (r - y) * 0.16); }
  const k = Math.max(0, Math.min(1, (548 - y) / 60));
  return Math.max(0, h) * k + noise(x, y) * k * (0.5 + Math.max(0, h) * 0.03);
}
const W = (x, y, up = 0) => new THREE.Vector3(wx(x), height(x, y) + up, wz(y));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (e) {
  seg.style.display = 'none';
  throw e;
}
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#2f3f37', 110, 260);
const camera = new THREE.PerspectiveCamera(40, 1000 / 610, 0.5, 500);
camera.position.set(0, 46, 84);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 19, -24);
Object.assign(controls, {
  enableDamping: true, dampingFactor: 0.08, enablePan: false, enableZoom: false,
  minPolarAngle: 0.45, maxPolarAngle: 1.3, minAzimuthAngle: -1.0, maxAzimuthAngle: 1.0, rotateSpeed: 0.6,
});
const coarse = matchMedia('(pointer: coarse)').matches;
if (coarse) { controls.enabled = false; renderer.domElement.style.touchAction = 'pan-y'; }
let lastInteract = 0, swayDir = 1;
controls.addEventListener('start', () => { lastInteract = performance.now(); });

// ---------- Свет ----------
scene.add(new THREE.HemisphereLight('#eaf2ff', '#3b352e', 0.85));
const sun = new THREE.DirectionalLight('#fff1dc', 1.7);
sun.position.set(-45, 60, 35);
sun.target.position.set(0, 0, -20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 70, bottom: -70, near: 1, far: 220 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

// ---------- Рельеф ----------
(function terrain() {
  const X0 = -150, X1 = 1150, Y0 = -220, Y1 = 700, NX = 140, NY = 96;
  const pos = [], idx = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const x = X0 + (X1 - X0) * i / NX, y = Y0 + (Y1 - Y0) * j / NY;
    pos.push(wx(x), height(x, y), wz(y));
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  const P = g.attributes.position, col = new Float32Array(P.count * 3);
  const snow = new THREE.Color('#ffffff'), snow2 = new THREE.Color('#dce5ee'), rock = new THREE.Color('#4a433b'),
    rock2 = new THREE.Color('#5b5248'), vill = new THREE.Color('#d3dce6'), tmp = new THREE.Color();
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < P.count; t += 3) {
    v0.fromBufferAttribute(P, t); v1.fromBufferAttribute(P, t + 1); v2.fromBufferAttribute(P, t + 2);
    n.subVectors(v2, v1).cross(v0.clone().sub(v1)).normalize();
    const hAvg = (v0.y + v1.y + v2.y) / 3, zAvg = (v0.z + v1.z + v2.z) / 3;
    const rnd = (Math.sin(v0.x * 12.9898 + v0.z * 78.233) * 43758.5453) % 1;
    if (zAvg > -0.6 && hAvg < 0.5) tmp.copy(vill);
    else if (Math.abs(n.y) < 0.5 && hAvg > 12) tmp.copy(rock).lerp(rock2, Math.abs(rnd));
    else tmp.copy(snow).lerp(snow2, Math.min(1, Math.abs(rnd) * 0.8 + (1 - Math.abs(n.y)) * 1.4));
    for (let k = 0; k < 3; k++) { col[(t + k) * 3] = tmp.r; col[(t + k) * 3 + 1] = tmp.g; col[(t + k) * 3 + 2] = tmp.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
  m.receiveShadow = true; m.castShadow = true;
  scene.add(m);

})();

// ---------- Трассы ----------
const slopes = {};
const hitList = [];
function ribbon(pts, N, half, up) {
  const pos = [], idx = [];
  for (let i = 0; i < N; i++) {
    const x = pts[2 * i], y = pts[2 * i + 1];
    const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1);
    let tx = pts[2 * i1] - pts[2 * i0], ty = pts[2 * i1 + 1] - pts[2 * i0 + 1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const lx = x - ty * half, ly = y + tx * half, rx = x + ty * half, ry = y - tx * half;
    const hc = height(x, y);
    pos.push(wx(lx), Math.max(hc, height(lx, ly)) + up, wz(ly), wx(rx), Math.max(hc, height(rx, ry)) + up, wz(ry));
    if (i < N - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
for (const s of S.SLOPES) {
  const sv = APP.mapView.sv[s.id];
  const casingMat = new THREE.MeshBasicMaterial({ color: '#f7fafc', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mainMat = new THREE.MeshBasicMaterial({ color: '#22c55e', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const casing = new THREE.Mesh(ribbon(sv.pts, sv.N, 10, 0.32), casingMat);
  const main = new THREE.Mesh(ribbon(sv.pts, sv.N, 5.5, 0.4), mainMat);
  main.userData.hover = { type: 'slope', id: s.id };
  scene.add(casing, main);
  hitList.push(main);
  slopes[s.id] = { s, pts: sv.pts, N: sv.N, casing, main, agents: [] };
}

// ---------- Лыжники и очереди (instanced) ----------
const MAXA = 600;
const personGeo = new THREE.CapsuleGeometry(0.17, 0.42, 2, 6);
personGeo.translate(0, 0.38, 0);
const people = new THREE.InstancedMesh(personGeo, new THREE.MeshLambertMaterial(), MAXA);
const JACKETS = ['#de291c', '#00824a', '#00aeef', '#f0cd36', '#2a2622', '#ff8a3d', '#ffffff', '#1db56c'].map(c => new THREE.Color(c));
for (let i = 0; i < MAXA; i++) people.setColorAt(i, JACKETS[i % JACKETS.length]);
people.count = 0;
people.frustumCulled = false;
scene.add(people);
const dummy = new THREE.Object3D();

// ---------- Подъёмники ----------
const lifts = {};
function rod(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
const towerMat = new THREE.MeshLambertMaterial({ color: '#3a352f' });
const stationMat = new THREE.MeshLambertMaterial({ color: '#312b25' });
const roofMat = new THREE.MeshLambertMaterial({ color: '#00824a' });
for (const l of S.LIFTS) {
  const { a, b } = G.LIFT_GEO[l.id];
  const H0 = 2.6;
  const A = W(a[0], a[1], H0), B = W(b[0], b[1], H0);
  const dir = new THREE.Vector3().subVectors(B, A), flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  const side = new THREE.Vector3(-flat.z, 0, flat.x).multiplyScalar(0.38);
  const cableMat = new THREE.MeshBasicMaterial({ color: '#1f1c18' });
  const grp = new THREE.Group();
  grp.add(rod(A.clone().add(side), B.clone().add(side), 0.045, cableMat), rod(A.clone().sub(side), B.clone().sub(side), 0.045, cableMat));
  const L = dir.length();
  for (let t = 0.1; t < 0.95; t += 6.5 / L) {
    const p = A.clone().addScaledVector(dir, t);
    const x2 = a[0] + (b[0] - a[0]) * t, y2 = a[1] + (b[1] - a[1]) * t;
    const g0 = new THREE.Vector3(p.x, height(x2, y2) - 0.3, p.z);
    const tw = rod(g0, p.clone().add(new THREE.Vector3(0, 0.25, 0)), 0.09, towerMat);
    tw.castShadow = true; grp.add(tw);
    const arm = rod(p.clone().add(side.clone().multiplyScalar(1.4)), p.clone().sub(side.clone().multiplyScalar(1.4)), 0.05, towerMat);
    grp.add(arm);
  }
  for (const [P2, big] of [[a, true], [b, false]]) {
    const base = W(P2[0], P2[1]);
    const box = new THREE.Mesh(new THREE.BoxGeometry(big ? 2.2 : 1.7, big ? 2.2 : 1.8, 1.6), stationMat);
    box.position.copy(base).add(new THREE.Vector3(0, big ? 1.1 : 0.9, 0));
    box.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(big ? 2.6 : 2.1, 0.25, 2), roofMat);
    roof.position.copy(box.position).add(new THREE.Vector3(0, big ? 1.2 : 1, 0));
    roof.castShadow = true;
    grp.add(box, roof);
  }
  const nCab = l.id === 'L1' ? 14 : l.id === 'L4' ? 10 : 18;
  const cabGeo = l.id === 'L1' ? new THREE.BoxGeometry(0.42, 0.46, 0.42) : new THREE.BoxGeometry(0.5, 0.12, 0.26);
  const cabMat = new THREE.MeshLambertMaterial({ color: l.id === 'L1' ? '#00824a' : '#f0cd36' });
  const cabins = [];
  for (let i = 0; i < nCab; i++) { const c = new THREE.Mesh(cabGeo, cabMat); grp.add(c); cabins.push(c); }
  const hit = rod(A, B, 0.9, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.userData.hover = { type: 'lift', id: l.id };
  grp.add(hit); hitList.push(hit);
  scene.add(grp);
  lifts[l.id] = { l, a, b, A, B, side, cabins, cableMat, cabMat, p: Math.random() };
}

// ---------- Деревья ----------
(function trees() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const near = (x, y) => {
    for (const id in slopes) {
      const p = slopes[id].pts;
      for (let i = 0; i < p.length; i += 6) if (Math.abs(p[i] - x) < 17 && Math.abs(p[i + 1] - y) < 17) return true;
    }
    for (const id in G.LIFT_GEO) {
      const { a, b } = G.LIFT_GEO[id];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
      if (Math.hypot(x - (a[0] + t * (b[0] - a[0])), y - (a[1] + t * (b[1] - a[1]))) < 12) return true;
    }
    return false;
  };
  const list = [];
  for (let i = 0; i < 3000 && list.length < 420; i++) {
    const x = -120 + rnd() * 1240, top = Math.max(300, G.ridgeY(Math.max(0, Math.min(1000, x))) + 150), y = top + rnd() * (546 - top);
    if (y > 546 || near(x, y)) continue;
    list.push([x, y, 0.75 + rnd() * 0.6]);
  }
  const geo = new THREE.ConeGeometry(0.8, 2.4, 6);
  geo.translate(0, 1.2, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), list.length);
  const greens = ['#24503f', '#2f5f4b', '#1d4433'].map(c => new THREE.Color(c));
  list.forEach(([x, y, k], i) => {
    dummy.position.copy(W(x, y, -0.15)); dummy.scale.set(k, k * (0.9 + (i % 3) * 0.12), k); dummy.rotation.set(0, i, 0);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, greens[i % 3]);
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
})();

// ---------- Посёлок: домики и парковка ----------
const placePos = {};
(function village() {
  const wall = new THREE.MeshLambertMaterial({ color: '#efe9de' }), wood = new THREE.MeshLambertMaterial({ color: '#8a6a4a' });
  const roofDark = new THREE.MeshLambertMaterial({ color: '#312b25', flatShading: true });
  const roofGreen = new THREE.MeshLambertMaterial({ color: '#00824a', flatShading: true });
  for (const p of G.PLACES) {
    const pos = W(p.x, 584);
    placePos[p.id] = pos.clone().add(new THREE.Vector3(0, 0, 2.4));
    if (p.id === 'parking') continue;
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.7, 2.4), p.id.startsWith('rent') || p.id === 'cafe' ? wood : wall);
    box.position.y = 0.85;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.3, 4), p.id === 'kassa' || p.id === 'lockers' ? roofGreen : roofDark);
    roof.position.y = 2.35; roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.75);
    box.castShadow = roof.castShadow = true; box.receiveShadow = true;
    g.add(box, roof); g.position.copy(pos);
    scene.add(g);
  }
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshLambertMaterial({ color: '#5a554d' }));
  lot.rotation.x = -Math.PI / 2; lot.position.copy(W(66, 588, 0.05)); lot.receiveShadow = true;
  scene.add(lot);
})();
const CARS = 40;
const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.42, 1.15), new THREE.MeshLambertMaterial(), CARS);
(function () {
  const base = W(66, 588, 0.26), cc = ['#de291c', '#ffffff', '#2a2622', '#00aeef', '#a39e93', '#00824a', '#f0cd36'].map(c => new THREE.Color(c));
  for (let i = 0; i < CARS; i++) {
    dummy.position.set(base.x - 3.6 + (i % 10) * 0.8, base.y, base.z - 1.6 + Math.floor(i / 10) * 1.1);
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    cars.setMatrixAt(i, dummy.matrix); cars.setColorAt(i, cc[(i * 3) % cc.length]);
  }
  cars.castShadow = true; cars.count = 0;
  scene.add(cars);
})();

// ---------- Подписи поверх сцены ----------
const labels = [];
function addLabel(cls, html, world, anchor = '-50%,-50%') {
  const el = document.createElement('div');
  el.className = 'l3 ' + cls; el.innerHTML = html;
  lblHost.appendChild(el);
  const o = { el, world, anchor }; labels.push(o); return o;
}
const slopeLbl = {}, liftLbl = {}, placeLbl = {};
for (const id in slopes) {
  const { s, pts, N } = slopes[id], i = Math.floor(N * 0.3);
  slopeLbl[id] = addLabel('l3-slope', `<i style="background:${U.DIFF[s.diff]}"></i>${s.name}`, W(pts[2 * i] + 14, pts[2 * i + 1], 0.8));
}
for (const id in lifts) liftLbl[id] = addLabel('l3-badge', '', lifts[id].A.clone().add(new THREE.Vector3(1.2, 2.4, 0)), '0,-100%');
for (const p of G.PLACES) placeLbl[p.id] = addLabel('l3-place', `<i></i>${p.label}<b></b>`, placePos[p.id], '-50%,0');
const v3 = new THREE.Vector3();
function placeLabels() {
  const w = host.clientWidth, h = host.clientHeight;
  for (const o of labels) {
    v3.copy(o.world).project(camera);
    if (v3.z > 1 || Math.abs(v3.x) > 1.2 || Math.abs(v3.y) > 1.2) { o.el.style.display = 'none'; continue; }
    o.el.style.display = '';
    o.el.style.transform = `translate(${((v3.x + 1) / 2 * w).toFixed(1)}px,${((1 - v3.y) / 2 * h).toFixed(1)}px) translate(${o.anchor})`;
  }
}

// ---------- Обновление по данным модели ----------
const closedCol = new THREE.Color('#8f969c'), white = new THREE.Color('#f7fafc'), hotCol = new THREE.Color('#ff5a4a'), hoverCol = new THREE.Color('#1db56c');
let hover = null, t3 = 0;
function syncData(day) {
  for (const s of day.slopes) {
    const v = slopes[s.id], d = s.occ / s.cap, l = slopeLbl[s.id];
    v.main.material.color.set(s.open ? U.densColor(d) : closedCol);
    v.dens = d; v.open = s.open;
    l.el.classList.toggle('closed', !s.open);
  }
  for (const l of day.lifts) {
    const v = lifts[l.id], lb = liftLbl[l.id], w = Math.round(l.wait);
    lb.el.textContent = l.k === 0 ? 'СТОП' : w < 1 ? 'без очереди' : w + ' мин';
    lb.el.style.background = l.k === 0 ? '#ef4444' : U.waitColor(l.wait);
    lb.el.style.color = l.k === 0 || l.wait >= 8 ? '#fff' : '#15130f';
    v.cableMat.color.set(l.k === 0 ? '#ef4444' : '#1f1c18');
    v.cabMat.color.set(l.k === 0 ? '#8f969c' : l.id === 'L1' ? '#00824a' : '#f0cd36');
  }
  for (const id in placeLbl) {
    const pv = APP.mapView.pv[id], el = placeLbl[id].el;
    el.querySelector('b').textContent = pv.t2.textContent;
    el.querySelector('i').className = (pv.dot.getAttribute('class') || '').replace('pd', '').trim();
  }
  cars.count = Math.min(CARS, Math.round(day.cars / S.C.PARK_CAP * CARS));
}

function stepPeople(day, dt) {
  let n = 0;
  for (const s of day.slopes) {
    const v = slopes[s.id], dens = s.occ / s.cap;
    const want = s.open ? Math.min(44, Math.round(s.occ / 4)) : 0;
    while (v.agents.length < want) v.agents.push({ t: Math.random(), off: (Math.random() - 0.5) * 8, ph: Math.random() * 6.28, vk: 0.75 + Math.random() * 0.5 });
    v.agents.length = want;
    const sp = (1 - 0.5 * Math.min(1, dens)) / (s.time * 3.4), P = v.pts, N = v.N;
    for (const a of v.agents) {
      a.t += dt * a.vk * sp; if (a.t >= 1) a.t -= 1;
      const fi = a.t * (N - 1), i0 = Math.min(N - 2, Math.floor(fi)), f = fi - i0;
      const x0 = P[2 * i0], y0 = P[2 * i0 + 1], tx = P[2 * i0 + 2] - x0, ty = P[2 * i0 + 3] - y0, tl = Math.hypot(tx, ty) || 1;
      const off = a.off + Math.sin(a.t * 46 + a.ph) * 2.5;
      const x = x0 + tx * f - ty / tl * off, y = y0 + ty * f + tx / tl * off;
      dummy.position.set(wx(x), height(x, y) + 0.35, wz(y));
      dummy.rotation.set(0.25, Math.atan2(tx, ty), Math.sin(a.t * 46 + a.ph) * 0.35);
      dummy.scale.setScalar(1); dummy.updateMatrix();
      if (n < MAXA) people.setMatrixAt(n++, dummy.matrix);
    }
  }
  for (const l of day.lifts) {
    const { a } = G.LIFT_GEO[l.id], nq = l.k === 0 ? 0 : Math.min(24, Math.ceil(l.q / 7));
    for (let k = 0; k < nq && n < MAXA; k++) {
      const col = k % 6, row = Math.floor(k / 6), x = a[0] - 18 - col * 7 - row * 2, y = a[1] + 3 + row * 6.5;
      dummy.position.set(wx(x), height(x, y) + 0.05, wz(y)); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      people.setMatrixAt(n++, dummy.matrix);
    }
  }
  people.count = n;
  people.instanceMatrix.needsUpdate = true;
}
function stepLifts(day, dt) {
  for (const l of day.lifts) {
    const v = lifts[l.id], n = v.cabins.length;
    v.p = (v.p + dt * l.k * (l.id === 'L4' ? 0.05 : 0.022)) % 1;
    v.cabins.forEach((c, i) => {
      const q = (v.p + i / n) % 1, up = q < 0.5, f = up ? q * 2 : (q - 0.5) * 2;
      c.position.lerpVectors(up ? v.A : v.B, up ? v.B : v.A, f).add(up ? v.side : v.side.clone().negate());
      c.position.y -= l.id === 'L1' ? 0.4 : 0.3;
    });
  }
}

// ---------- Наведение: та же подсказка, что у 2D ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let lastPtr = null, dragging = false;
renderer.domElement.addEventListener('pointermove', e => { lastPtr = e; });
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lastPtr = e; if (e.pointerType === 'touch') pick(e, true); });
window.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('pointerleave', e => { lastPtr = null; if (e.pointerType !== 'touch' && hover) { hover = null; APP.mapView.setHover(null); } });
function pick(e, force) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(hitList, false)[0];
  const h = hit ? hit.object.userData.hover : null;
  if (!h) { if (hover) { hover = null; APP.mapView.setHover(null); } return; }
  if (!hover || hover.id !== h.id || force) { hover = h; APP.mapView.setHover(h, e); }
  else APP.mapView.moveTip(e);
}

// ---------- Режимы 2D / 3D ----------
let mode = '3d';
try { mode = localStorage.getItem('glk-map-view') || '3d'; } catch (e) { /* без хранилища — по умолчанию 3D */ }
function setMode(m) {
  mode = m;
  panel.classList.toggle('mode-3d', m === '3d');
  document.body.classList.toggle('mode-3d-on', m === '3d');
  seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === m));
  APP.mapView.setHover(null); hover = null;
  try { localStorage.setItem('glk-map-view', m); } catch (e) { /* игнорируем */ }
  if (m === '3d') resize();
}
seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.view); });

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < 600 ? 46 : 40;
  const narrow = w < 600;
  if (narrow !== resize.narrow) { resize.narrow = narrow; camera.position.set(0, narrow ? 40 : 46, narrow ? 64 : 84); controls.target.set(0, narrow ? 16 : 19, -24); }
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);

// ---------- Цикл ----------
setMode(mode);
renderer.shadowMap.needsUpdate = true;
let last = performance.now(), lastSync = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (mode !== '3d') return;
  const day = APP.day, live = APP.speed > 0 ? dt : 0;
  t3 += dt;
  if (now - lastSync > 300) { lastSync = now; syncData(day); }
  stepPeople(day, live);
  stepLifts(day, live);
  for (const id in slopes) {
    const v = slopes[id];
    const c = hover && hover.type === 'slope' && hover.id === id ? hoverCol
      : v.open && v.dens > 0.92 ? white.clone().lerp(hotCol, 0.5 + 0.5 * Math.sin(t3 * 4.5)) : white;
    v.casing.material.color.copy(c);
  }
  // Плавное «покачивание» камеры, пока зритель не трогает гору
  if (!coarse && now - lastInteract > 7000) {
    const az = controls.getAzimuthalAngle();
    if (az > 0.45) swayDir = -1; else if (az < -0.45) swayDir = 1;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.35 * swayDir;
  } else controls.autoRotate = coarse;
  if (coarse) { controls.autoRotateSpeed = 0.3 * swayDir; const az = controls.getAzimuthalAngle(); if (az > 0.4) swayDir = -1; else if (az < -0.4) swayDir = 1; controls.enabled = true; controls.update(); controls.enabled = false; }
  else controls.update();
  if (lastPtr && !dragging && !coarse) pick(lastPtr);
  renderer.render(scene, camera);
  placeLabels();
}
requestAnimationFrame(frame);
