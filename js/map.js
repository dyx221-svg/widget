/* Живая карта курорта: трассы цвета «пробок», человечки, кабинки, очереди. */
(function () {
  'use strict';
  const S = window.SKI;
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const fmt = n => Math.round(n).toLocaleString('ru-RU');

  const RIDGE = [[0, 420], [90, 360], [160, 300], [220, 210], [300, 80], [360, 150], [430, 120], [500, 70], [560, 40],
    [640, 95], [700, 75], [800, 95], [870, 150], [960, 220], [1000, 240]];
  const BACK = [[0, 330], [80, 250], [150, 280], [260, 150], [340, 190], [420, 100], [520, 130], [610, 60], [720, 140],
    [840, 70], [930, 140], [1000, 120]];
  function ridgeY(x) {
    for (let i = 0; i < RIDGE.length - 1; i++) {
      const [x0, y0] = RIDGE[i], [x1, y1] = RIDGE[i + 1];
      if (x >= x0 && x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    return 600;
  }

  const LIFT_GEO = {
    L1: { a: [500, 546], b: [560, 62] },
    L2: { a: [692, 546], b: [796, 112] },
    L3: { a: [336, 546], b: [300, 98] },
    L4: { a: [176, 548], b: [212, 434] },
  };
  const SLOPE_GEO = {
    S1: 'M568,72 C615,150 590,215 612,290 C632,360 600,430 552,540',
    S2: 'M550,72 C500,130 455,190 470,270 C485,350 420,430 478,540',
    S8: 'M574,68 C660,95 720,170 735,250 C750,330 640,380 650,460 C655,500 690,520 706,540',
    S3: 'M800,120 C830,190 800,260 815,330 C830,400 770,470 728,540',
    S4: 'M810,118 C890,170 925,250 900,330 C875,410 905,480 806,544',
    S5: 'M294,106 C240,170 250,240 280,300 C310,360 250,440 318,542',
    S6: 'M308,106 C370,160 400,230 390,300 C380,370 430,450 356,542',
    S7: 'M218,440 C255,465 215,495 245,515 C262,527 232,540 206,550',
  };
  const PLACES = [
    { id: 'parking', x: 66, label: 'Парковка' },
    { id: 'school', x: 205, label: 'Школа' },
    { id: 'rentA', x: 345, label: 'Прокат «Центр»' },
    { id: 'lockers', x: 485, label: 'Раздевалки' },
    { id: 'kassa', x: 625, label: 'Кассы и КСО' },
    { id: 'rentB', x: 765, label: 'Прокат «Восток»' },
    { id: 'cafe', x: 910, label: 'Кафе «Шале»' },
  ];
  const DIFF = { green: '#16a34a', blue: '#2563eb', red: '#dc2626', black: '#0f172a' };
  const DIFF_NAME = { green: 'зелёная', blue: 'синяя', red: 'красная', black: 'чёрная' };

  const STOPS = [[0, [34, 197, 94]], [0.5, [250, 204, 21]], [0.75, [249, 115, 22]], [0.95, [239, 68, 68]], [1.25, [153, 27, 27]]];
  function densColor(d) {
    d = Math.max(0, Math.min(1.25, d));
    for (let i = 0; i < STOPS.length - 1; i++) {
      const [a, ca] = STOPS[i], [b, cb] = STOPS[i + 1];
      if (d <= b) {
        const t = (d - a) / (b - a);
        return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * t)).join(',')})`;
      }
    }
    return 'rgb(153,27,27)';
  }
  const densLabel = d => d < 0.45 ? 'свободно' : d < 0.7 ? 'умеренно' : d < 0.9 ? 'плотно' : 'перегружена';
  const waitColor = w => w < 4 ? '#22c55e' : w < 8 ? '#facc15' : '#ef4444';

  class MapView {
    constructor(svg, tip, wrap) {
      this.svg = svg; this.tip = tip; this.wrap = wrap;
      this.sv = {}; this.lv = {}; this.pv = {}; this.hover = null; this.day = null;
      this.build();
    }

    build() {
      const svg = this.svg;
      const defs = el('defs', null, svg);
      defs.innerHTML = `
        <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1412"/><stop offset="1" stop-color="#2a3b33"/></linearGradient>
        <linearGradient id="gBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#66766d"/><stop offset="1" stop-color="#323d37"/></linearGradient>
        <linearGradient id="gSnow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e9f0f9"/><stop offset="1" stop-color="#cbd8ea"/></linearGradient>
        <g id="sk"><circle cy="-6.4" r="2.1"/><path d="M0,-4.2 L0.6,1 M-3,-2.2 L3.2,-1 M0.6,1 L-2.2,4.2 M0.6,1 L2.8,4 M-4.6,5 L4.6,3.8" fill="none" stroke-width="1.5" stroke-linecap="round"/></g>`;

      el('rect', { x: 0, y: 0, width: 1000, height: 610, fill: 'url(#gSky)' }, svg);
      let seed = 11;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const stars = el('g', { fill: '#fff' }, svg);
      for (let i = 0; i < 80; i++) el('circle', { cx: rnd() * 1000, cy: rnd() * 220, r: rnd() * 1.1 + 0.25, opacity: 0.2 + rnd() * 0.5 }, stars);

      const poly = pts => 'M' + pts.map(p => p.join(',')).join(' L') + ' L1000,610 L0,610 Z';
      el('path', { d: poly(BACK), fill: 'url(#gBack)', opacity: 0.85 }, svg);
      el('path', { d: poly(RIDGE), fill: 'url(#gSnow)' }, svg);
      const shade = el('g', { fill: '#7f98bb', opacity: 0.2 }, svg);
      for (let i = 0; i < RIDGE.length - 1; i++) {
        const [x0, y0] = RIDGE[i], [x1, y1] = RIDGE[i + 1];
        if (y1 > y0) el('path', { d: `M${x0},${y0} L${x1},${y1} L${x0 + (x1 - x0) * 0.35},${Math.min(560, y0 + 300)} Z` }, shade);
      }
      el('path', { d: 'M0,556 C220,546 780,546 1000,556 L1000,610 L0,610 Z', fill: '#d5e0ee' }, svg);
      el('path', { d: 'M0,603 C300,596 700,596 1000,603', stroke: '#b5c4d8', 'stroke-width': 3, fill: 'none' }, svg);

      // Пик
      el('path', { d: 'M560,40 l-5,-9 l10,0 z', fill: '#f0cd36' }, svg);
      const pk = el('text', { x: 572, y: 30, class: 'peak-label' }, svg);
      pk.textContent = 'Пик Северный · 2 140 м';

      const gTrees = el('g', null, svg);
      const gSlopes = el('g', null, svg);
      const gAgents = el('g', null, svg);
      const gLifts = el('g', null, svg);
      const gQueue = el('g', null, svg);
      const gLabels = el('g', null, svg);
      const gPlaces = el('g', null, svg);

      // Трассы
      for (const s of S.SLOPES) {
        const d = SLOPE_GEO[s.id];
        const g = el('g', { class: 'slope' }, gSlopes);
        el('path', { d, class: 'sl-case' }, g);
        const main = el('path', { d, class: 'sl-main' }, g);
        const flow = el('path', { d, class: 'sl-flow' }, g);
        const hit = el('path', { d, class: 'sl-hit' }, g);
        const len = main.getTotalLength(), N = 240, pts = new Float32Array(N * 2);
        for (let i = 0; i < N; i++) { const p = main.getPointAtLength(len * i / (N - 1)); pts[2 * i] = p.x; pts[2 * i + 1] = p.y; }
        const li = Math.floor(N * 0.3);
        const lab = el('g', { class: 'sl-label', transform: `translate(${pts[2 * li] + 11},${pts[2 * li + 1]})` }, gLabels);
        el('circle', { r: 5.5, fill: DIFF[s.diff], stroke: '#fff', 'stroke-width': 2 }, lab);
        const tx = el('text', { x: 9, y: 4 }, lab);
        tx.textContent = s.name;
        const v = { s, g, main, flow, hit, pts, N, agents: [], dash: 0, agentG: el('g', null, gAgents), lab };
        this.sv[s.id] = v;
        this.bindHover(hit, { type: 'slope', id: s.id });
      }

      // Деревья — там, где нет трасс и канатов
      const near = (x, y) => {
        for (const id in this.sv) {
          const p = this.sv[id].pts;
          for (let i = 0; i < p.length; i += 6) if (Math.abs(p[i] - x) < 15 && Math.abs(p[i + 1] - y) < 15) return true;
        }
        for (const id in LIFT_GEO) {
          const { a, b } = LIFT_GEO[id];
          const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
          if (Math.hypot(x - (a[0] + t * (b[0] - a[0])), y - (a[1] + t * (b[1] - a[1]))) < 9) return true;
        }
        return false;
      };
      const trees = [];
      for (let i = 0; i < 520 && trees.length < 230; i++) {
        const x = 10 + rnd() * 980, top = ridgeY(x) + 110, y = top + rnd() * (548 - top);
        if (y > 548 || near(x, y)) continue;
        trees.push([x, y]);
      }
      trees.sort((a, b) => a[1] - b[1]).forEach(([x, y], i) => {
        const h = 9 + (i % 4) * 1.6;
        el('path', { d: `M${x},${y - h} L${x - h * 0.42},${y} L${x + h * 0.42},${y} Z`, fill: i % 3 ? '#2f5f4b' : '#24503f' }, gTrees);
      });

      // Подъёмники
      for (const l of S.LIFTS) {
        const { a, b } = LIFT_GEO[l.id];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        const g = el('g', { class: 'lift' }, gLifts);
        const cables = [-1, 1].map(sd => el('line', {
          x1: a[0] + nx * 2.6 * sd, y1: a[1] + ny * 2.6 * sd, x2: b[0] + nx * 2.6 * sd, y2: b[1] + ny * 2.6 * sd, class: 'lf-cable',
        }, g));
        for (let t = 0.08; t < 0.96; t += 58 / L) {
          const cx = a[0] + dx * t, cy = a[1] + dy * t;
          el('line', { x1: cx - nx * 5, y1: cy - ny * 5, x2: cx + nx * 5, y2: cy + ny * 5, class: 'lf-tower' }, g);
        }
        el('rect', { x: a[0] - 9, y: a[1] - 6, width: 18, height: 11, rx: 2.5, class: 'lf-st' }, g);
        el('rect', { x: b[0] - 7, y: b[1] - 5, width: 14, height: 9, rx: 2, class: 'lf-st' }, g);
        const nCab = l.id === 'L1' ? 14 : l.id === 'L4' ? 10 : 18;
        const cg = el('g', null, g);
        const cabins = [];
        for (let i = 0; i < nCab; i++) {
          cabins.push(l.id === 'L1'
            ? el('rect', { width: 5, height: 5, x: -2.5, y: -2.5, rx: 1.2, class: 'lf-cab' }, cg)
            : el('rect', { width: 4.4, height: 2.4, x: -2.2, y: -1.2, rx: 0.8, class: 'lf-cab' }, cg));
        }
        const hit = el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'lf-hit' }, g);
        this.bindHover(hit, { type: 'lift', id: l.id });

        const qg = el('g', null, gQueue), qf = [];
        for (let k = 0; k < 24; k++) {
          const col = k % 6, row = Math.floor(k / 6);
          qf.push(el('use', {
            href: '#sk', class: 'ag q', transform: `translate(${a[0] - 15 - col * 6.4 - row * 2},${a[1] + 1 + row * 5.6}) scale(.72)`,
          }, qg));
        }
        const badge = el('g', { class: 'badge', transform: `translate(${a[0] + 12},${a[1] - 30})` }, gQueue);
        const br = el('rect', { x: 0, y: 0, width: 54, height: 20, rx: 10 }, badge);
        const bt = el('text', { x: 27, y: 14, 'text-anchor': 'middle' }, badge);
        this.bindHover(badge, { type: 'lift', id: l.id });
        this.lv[l.id] = { l, a, b, nx, ny, cables, cabins, p: Math.random(), qf, br, bt, g };
      }

      // Объекты в долине
      for (const p of PLACES) {
        const g = el('g', { class: 'place', transform: `translate(${p.x},588)` }, gPlaces);
        el('rect', { x: -60, y: -16, width: 120, height: 32, rx: 9 }, g);
        const t1 = el('text', { y: -3, 'text-anchor': 'middle', class: 'pl-l' }, g); t1.textContent = p.label;
        const t2 = el('text', { y: 10.5, 'text-anchor': 'middle', class: 'pl-v' }, g);
        const dot = el('circle', { cx: -50, cy: -6, r: 3 }, g);
        this.pv[p.id] = { t2, dot };
      }

      svg.addEventListener('pointerdown', e => { if (!e.target.closest('.sl-hit,.lf-hit,.badge')) this.setHover(null); });
    }

    bindHover(node, h) {
      node.addEventListener('pointerenter', e => this.setHover(h, e));
      node.addEventListener('pointermove', e => this.moveTip(e));
      node.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') this.setHover(null); });
    }
    setHover(h, e) {
      this.hover = h;
      if (!h) { this.tip.classList.remove('on'); return; }
      this.renderTip();
      this.tip.classList.add('on');
      if (e) this.moveTip(e);
    }
    moveTip(e) {
      const r = this.wrap.getBoundingClientRect(), sl = this.wrap.scrollLeft;
      let x = e.clientX - r.left + 16, y = e.clientY - r.top + 12;
      const w = this.tip.offsetWidth, hgt = this.tip.offsetHeight;
      if (x + w > r.width - 6) x = e.clientX - r.left - w - 16;
      x += sl;
      if (y + hgt > r.height - 6) y = r.height - hgt - 6;
      this.tip.style.transform = `translate(${Math.max(sl + 6, x)}px,${Math.max(6, y)}px)`;
    }
    renderTip() {
      const d = this.day, h = this.hover;
      if (!d || !h) return;
      const row = (k, v) => `<div class="tt-row"><span>${k}</span><b>${v}</b></div>`;
      if (h.type === 'slope') {
        const s = d.slopes.find(x => x.id === h.id), l = d.lifts.find(x => x.id === s.lift), dens = s.occ / s.cap;
        this.tip.innerHTML = `<div class="tt-h"><i class="dm" style="background:${DIFF[s.diff]}"></i>Трасса «${s.name}»<span>${DIFF_NAME[s.diff]}</span></div>` +
          (s.open
            ? row('Сейчас на трассе', fmt(s.occ) + ' чел.') +
              row('Загрузка', `<em style="color:${densColor(dens)}">${Math.round(dens * 100)}% · ${densLabel(dens)}</em>`)
            : `<div class="tt-note">Закрыта: вечером работают только освещённые трассы</div>`) +
          row('Длина / перепад', `${s.len.toLocaleString('ru-RU')} км · ${s.drop} м`) +
          row('Подъёмник', l.name) + row('Очередь к подъёмнику', l.k === 0 ? 'остановлен' : Math.round(l.wait) + ' мин');
      } else {
        const l = d.lifts.find(x => x.id === h.id);
        const st = l.status === 'stop' ? '<em style="color:#ef4444">Остановлен: ветер</em>' : l.status === 'slow' ? '<em style="color:#facc15">Снижена скорость</em>' : '<em style="color:#22c55e">Работает</em>';
        this.tip.innerHTML = `<div class="tt-h">${l.name}<span>${l.kind}</span></div>` +
          row('Статус', st) + row('Провозит', `${fmt(l.thr * 60)} / ${fmt(l.cap)} чел/ч`) +
          row('В очереди', fmt(l.q) + ' чел.') + row('Ожидание', `<em style="color:${waitColor(l.wait)}">${Math.round(l.wait)} мин</em>`) +
          row('Подъёмов сегодня', fmt(l.passes)) + row('Турникеты', l.gates.join(', '));
      }
    }

    // Медленное обновление: цвета, бейджи, подписи (≈3 раза в секунду)
    update(day) {
      this.day = day;
      for (const s of day.slopes) {
        const v = this.sv[s.id], dens = s.occ / s.cap;
        v.g.classList.toggle('closed', !s.open);
        v.g.classList.toggle('hot', s.open && dens > 0.92);
        v.main.style.stroke = s.open ? densColor(dens) : '';
        v.lab.classList.toggle('closed', !s.open);
      }
      for (const l of day.lifts) {
        const v = this.lv[l.id];
        v.g.classList.toggle('stopped', l.k === 0);
        const nq = l.k === 0 ? 0 : Math.min(24, Math.ceil(l.q / 7));
        v.qf.forEach((f, i) => f.style.display = i < nq ? '' : 'none');
        const w = Math.round(l.wait);
        v.bt.textContent = l.k === 0 ? 'СТОП' : w < 1 ? 'без очереди' : w + ' мин';
        const wide = l.k !== 0 && w < 1;
        v.br.setAttribute('width', wide ? 78 : 54);
        v.bt.setAttribute('x', wide ? 39 : 27);
        v.br.style.fill = l.k === 0 ? '#ef4444' : waitColor(l.wait);
        v.bt.style.fill = l.k === 0 || l.wait >= 8 ? '#fff' : '#15130f';
      }
      const C = S.C;
      const busy = day.cells.filter(c => c.state === 1).length, cellsOk = day.cells.filter(c => c.state !== 3).length;
      const skiStock = pt => (day.rent.ski.stock[pt] + day.rent.board.stock[pt]) / (day.rent.ski.init[pt] + day.rent.board.init[pt]);
      const sales10 = day.hist.sales.slice(-10).reduce((a, b) => a + b, 0);
      const set = (id, text, level) => { this.pv[id].t2.textContent = text; this.pv[id].dot.setAttribute('class', 'pd ' + level); };
      const lvl = (x, warn, bad) => x >= bad ? 'bad' : x >= warn ? 'warn' : 'ok';
      set('parking', `${day.cars} / ${C.PARK_CAP} авто`, lvl(day.cars / C.PARK_CAP, 0.8, 0.95));
      set('school', `${day.lessons.length} / ${C.INSTRUCTORS} инструкт.`, lvl(day.lessons.length / C.INSTRUCTORS, 0.75, 0.95));
      set('rentA', `${Math.round(skiStock(0) * 100)}% на складе`, lvl(1 - skiStock(0), 0.7, 0.88));
      set('rentB', `${Math.round(skiStock(1) * 100)}% на складе`, lvl(1 - skiStock(1), 0.7, 0.88));
      set('lockers', `${Math.round(busy / cellsOk * 100)}% занято`, lvl(busy / cellsOk, 0.8, 0.93));
      set('kassa', `${sales10} продаж / 10 мин`, 'ok');
      set('cafe', `${Math.round(day.cafeLoad * 100)}% мест занято`, lvl(day.cafeLoad, 0.75, 0.92));
      if (this.hover) this.renderTip();
    }

    // Анимация каждый кадр
    animate(dt) {
      const day = this.day;
      if (!day) return;
      for (const s of day.slopes) {
        const v = this.sv[s.id], dens = s.occ / s.cap;
        const n = s.open ? Math.min(44, Math.round(s.occ / 4)) : 0;
        while (v.agents.length < n) {
          const node = el('use', { href: '#sk', class: 'ag' }, v.agentG);
          v.agents.push({ t: Math.random(), off: (Math.random() - 0.5) * 7, ph: Math.random() * 6.28, vk: 0.75 + Math.random() * 0.5, node });
        }
        while (v.agents.length > n) v.agents.pop().node.remove();
        const sp = (1 - 0.5 * Math.min(1, dens)) / (s.time * 3.4);
        const P = v.pts, N = v.N;
        for (const a of v.agents) {
          a.t += dt * a.vk * sp;
          if (a.t >= 1) a.t -= 1;
          const fi = a.t * (N - 1), i0 = Math.min(N - 2, Math.floor(fi)), f = fi - i0;
          const x0 = P[2 * i0], y0 = P[2 * i0 + 1], x1 = P[2 * i0 + 2], y1 = P[2 * i0 + 3];
          const tx = x1 - x0, ty = y1 - y0, tl = Math.hypot(tx, ty) || 1;
          const off = a.off + Math.sin(a.t * 46 + a.ph) * 2.2;
          const x = x0 + tx * f - ty / tl * off, y = y0 + ty * f + tx / tl * off;
          a.node.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(.86)`);
        }
        v.dash -= dt * (4 + 26 * (1 - 0.8 * Math.min(1, dens)));
        v.flow.style.strokeDashoffset = v.dash;
      }
      for (const l of day.lifts) {
        const v = this.lv[l.id], n = v.cabins.length;
        v.p = (v.p + dt * l.k * (l.id === 'L4' ? 0.05 : 0.022)) % 1;
        const { a, b, nx, ny } = v;
        v.cabins.forEach((c, i) => {
          const q = (v.p + i / n) % 1;
          let x, y;
          if (q < 0.5) { const f = q * 2; x = a[0] + (b[0] - a[0]) * f + nx * 2.6; y = a[1] + (b[1] - a[1]) * f + ny * 2.6; }
          else { const f = (q - 0.5) * 2; x = b[0] + (a[0] - b[0]) * f - nx * 2.6; y = b[1] + (a[1] - b[1]) * f - ny * 2.6; }
          c.setAttribute('transform', `translate(${x.toFixed(1)},${(y + 3).toFixed(1)})`);
        });
      }
    }
  }

  window.MapView = MapView;
  window.SKI_GEO = { RIDGE, BACK, LIFT_GEO, SLOPE_GEO, PLACES, ridgeY };
  window.SKI_UTIL = { densColor, densLabel, waitColor, DIFF, DIFF_NAME };
})();
