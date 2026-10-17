/* Модель дня горнолыжного курорта.
   Агрегированная симуляция с шагом 1 минута: гости, продажи, подъёмники,
   трассы, прокат, шкафчики, кафе, школа, парковка, турникеты.
   В боевой версии этот слой заменяется потоком событий из ППС «Барс». */
(function () {
  'use strict';

  const OPEN = 9 * 60, CLOSE = 21 * 60, NIGHT = 17 * 60;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = (x, mu, s) => Math.exp(-0.5 * ((x - mu) / s) ** 2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const poisson = (r, lam) => Math.floor(lam) + (r() < lam % 1 ? 1 : 0);
  function pickW(r, items, wf) {
    let s = 0; for (const it of items) s += wf(it);
    let x = r() * s;
    for (const it of items) { x -= wf(it); if (x <= 0) return it; }
    return items[items.length - 1];
  }
  function pickIdx(r, ws) {
    let s = 0; for (const w of ws) s += w;
    let x = r() * s;
    for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return i; }
    return ws.length - 1;
  }

  const TARIFFS = [
    { id: 'day', name: 'Дневной взрослый', price: 2900, color: '#1db56c' },
    { id: 'kid', name: 'Дневной детский', price: 1900, color: '#00aeef' },
    { id: 'h4', name: '4 часа', price: 2200, color: '#9bd36a' },
    { id: 'eve', name: 'Вечерний 17–21', price: 1500, color: '#c9b28f' },
    { id: 'one', name: 'Разовый подъём', price: 450, color: '#f0cd36' },
    { id: 'd3', name: 'Абонемент 3 дня', price: 7400, color: '#f97316' },
  ];
  const CHANNELS = [
    { id: 'cash', name: 'Кассы', color: '#1db56c', w: 0.36 },
    { id: 'kso', name: 'Кассы самообслуживания', color: '#00aeef', w: 0.30 },
    { id: 'online', name: 'Онлайн и BarsPay', color: '#9bd36a', w: 0.12 },
    { id: 'card', name: 'Банковская карта на турникете', color: '#f0cd36', w: 0.22 },
  ];
  const BIZ = [
    { id: 'skipass', name: 'Ски-пассы', color: '#1db56c' },
    { id: 'rental', name: 'Прокат', color: '#9bd36a' },
    { id: 'cafe', name: 'Кафе и рестораны', color: '#f0cd36' },
    { id: 'school', name: 'Школа инструкторов', color: '#00aeef' },
    { id: 'parking', name: 'Парковка', color: '#a39e93' },
    { id: 'lockers', name: 'Шкафчики', color: '#ff6b57' },
  ];
  const LIFTS = [
    { id: 'L1', name: 'Гондола «Вершина»', short: 'Гондола', kind: 'Гондола, 8 мест', cap: 1800, w: 1.25, gates: ['Т-1', 'Т-2'] },
    { id: 'L2', name: 'Кресельная «Восточная»', short: 'Восточная', kind: 'Кресло, 4 места', cap: 1500, w: 1.0, gates: ['Т-3', 'Т-4'] },
    { id: 'L3', name: 'Кресельная «Западная»', short: 'Западная', kind: 'Кресло, 4 места', cap: 1200, w: 0.95, gates: ['Т-5'] },
    { id: 'L4', name: 'Бугель «Учебный»', short: 'Учебный', kind: 'Бугельный', cap: 700, w: 0.32, gates: ['Т-6'] },
  ];
  const SLOPES = [
    { id: 'S1', name: 'Стена', diff: 'black', lift: 'L1', share: 0.22, time: 6, cap: 85, night: false, len: 1.6, drop: 540 },
    { id: 'S2', name: 'Вершина', diff: 'red', lift: 'L1', share: 0.43, time: 8, cap: 105, night: true, len: 2.4, drop: 620 },
    { id: 'S8', name: 'Панорама', diff: 'blue', lift: 'L1', share: 0.35, time: 10, cap: 210, night: false, len: 3.1, drop: 640 },
    { id: 'S3', name: 'Восточная', diff: 'blue', lift: 'L2', share: 0.6, time: 7, cap: 120, night: true, len: 2.0, drop: 470 },
    { id: 'S4', name: 'Кулуар', diff: 'red', lift: 'L2', share: 0.4, time: 6, cap: 90, night: false, len: 1.8, drop: 480 },
    { id: 'S5', name: 'Западная', diff: 'blue', lift: 'L3', share: 0.55, time: 7, cap: 125, night: true, len: 2.1, drop: 450 },
    { id: 'S6', name: 'Лесная', diff: 'red', lift: 'L3', share: 0.45, time: 6, cap: 140, night: false, len: 1.9, drop: 450 },
    { id: 'S7', name: 'Учебная', diff: 'green', lift: 'L4', share: 1, time: 3, cap: 38, night: true, len: 0.4, drop: 60 },
  ];
  const RENTAL = [
    { id: 'ski', name: 'Горные лыжи', total: 520 },
    { id: 'board', name: 'Сноуборды', total: 340 },
    { id: 'boots', name: 'Ботинки', total: 1100 },
    { id: 'helmet', name: 'Шлемы', total: 900 },
    { id: 'poles', name: 'Палки', total: 520 },
  ];
  const POINTS = ['Центральный', 'Восточный'];
  const POINT_SHARE = [0.6, 0.4];
  const BOOT_SIZES = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46];
  const BOOT_W = [3, 5, 7, 9, 11, 13, 14, 13, 10, 7, 4];
  const LOCKER_ROOMS = [
    { id: 'A', name: 'Раздевалка А · центр', cols: 20, rows: 12 },
    { id: 'B', name: 'Раздевалка Б · восток', cols: 16, rows: 8 },
  ];
  const SCENARIOS = {
    normal: { name: 'Обычная суббота', guests: 4300, weather: { temp: -9, wind: 4, snow: '12 см свежего снега', sky: 'Солнечно' } },
    peak: { name: 'Праздничный пик', guests: 6300, weather: { temp: -6, wind: 3, snow: '5 см свежего снега', sky: 'Ясно' } },
    storm: { name: 'Ветер и метель', guests: 2900, weather: { temp: -15, wind: 9, snow: 'Метель, +25 см', sky: 'Снегопад' }, storm: true },
  };
  const C = {
    RENT_PRICE: { ski: 1900, board: 1700, helmet: 400 },
    LOCKER_PRICE: 300, PARK_PRICE: 300, CAFE_CHECK: 780,
    PARK_CAP: 600, CAFE_SEATS: 420, INSTRUCTORS: 24,
    CYCLE_MIN: 14, // подъём + спуск без очереди, мин
  };
  const FRAUD = [
    { text: 'Повторный проход — отклонён', v: 450, w: 0.5 },
    { text: 'Ски-пасс в стоп-листе', v: 2900, w: 0.2 },
    { text: 'Фото не совпадает с владельцем', v: 2900, w: 0.3 },
  ];

  const shape = m => {
    if (m >= 20 * 60) return 0;
    const h = m / 60;
    return gauss(h, 10.1, 0.75) + 0.42 * gauss(h, 12.6, 1.0) + 0.32 * gauss(h, 17.4, 0.45);
  };
  let Z = 0; for (let m = OPEN; m < CLOSE; m++) Z += shape(m);
  const lunch = h => gauss(h, 13.2, 0.9);

  function tariffMix(h) {
    if (h < 12) return { day: 0.55, kid: 0.2, h4: 0.08, one: 0.1, d3: 0.07 };
    if (h < 16) return { day: 0.2, kid: 0.08, h4: 0.5, one: 0.17, d3: 0.05 };
    return { h4: 0.05, one: 0.2, eve: 0.75 };
  }

  class Day {
    constructor(sid, seed, opt = {}) {
      this.sid = sid; this.sc = SCENARIOS[sid]; this.r = mulberry32(seed);
      this.quiet = !!opt.quiet;
      this.t = OPEN; this.total = this.sc.guests * (opt.k || 1);
      this.on = 0; this.arrCum = 0; this.depCum = 0;
      this.revenue = 0; this.sold = 0;
      this.biz = {}; BIZ.forEach(b => (this.biz[b.id] = 0));
      this.tar = {}; TARIFFS.forEach(t => (this.tar[t.id] = { n: 0, rev: 0 }));
      this.ch = {}; CHANNELS.forEach(c => (this.ch[c.id] = { n: 0, rev: 0 }));
      this.passes = 0; this.thr = 0;
      this.lifts = LIFTS.map(l => ({ ...l, q: 0, wait: 0, thr: 0, demand: 0, passes: 0, k: 1, status: 'ok', hist: [] }));
      this.slopes = SLOPES.map(s => ({ ...s, occ: 0, pop: 1, open: true }));

      const bw = BOOT_W.reduce((a, b) => a + b, 0);
      const bootsTotal = RENTAL.find(c => c.id === 'boots').total;
      this.bootStock = POINT_SHARE.map(p => BOOT_W.map(w => Math.round(bootsTotal * p * w / bw)));
      this.bootsOut = BOOT_W.map(() => 0);
      this.bootMiss = BOOT_W.map(() => 0);
      this.rent = {};
      RENTAL.forEach(c => {
        const stock = c.id === 'boots'
          ? this.bootStock.map(a => a.reduce((x, y) => x + y, 0))
          : POINT_SHARE.map(p => Math.round(c.total * p));
        this.rent[c.id] = { ...c, stock, init: stock.slice(), out: 0, svc: 0 };
      });
      this.svcQ = []; this.renters = 0; this.lost = { n: 0, rev: 0 };
      this.flowHist = [];

      this.cells = [];
      LOCKER_ROOMS.forEach((room, ri) => {
        for (let i = 0; i < room.cols * room.rows; i++) this.cells.push({ room: ri, n: i + 1, state: 0, since: 0, ch: -99 });
      });
      for (let i = 0; i < 5; i++) this.cells[Math.floor(this.r() * this.cells.length)].state = 3;
      this.lockerUsers = 0; this.lockerLost = 0;

      this.cars = 36; this.parkLost = 0;
      this.lessons = []; this.lessonsLost = 0; this.lessonsCount = 0;
      this.cafeLoad = 0; this.cafeGuests = 0;
      this.fraud = { n: 0, saved: 0 }; this.events = [];
      this.hist = { rev: [], guests: [], passes: [], arr: [], wait: [], sales: [] };
      this.weather = { ...this.sc.weather };

      // Онлайн-предпродажа: часть ски-пассов куплена заранее через сайт и BarsPay
      this.presold = this.presoldLeft = Math.round(this.total * 0.2);
      const mix = tariffMix(9.5);
      for (let i = 0; i < this.presold; i++) this.sell(pickW(this.r, TARIFFS, t => mix[t.id] || 0).id, 'online');
      this.min = { arr: 0, sales: 0, issue: [0, 0], ret: [0, 0], svc: 0 };
    }

    addRev(biz, v) { this.biz[biz] += v; this.revenue += v; }
    sell(tid, chid) {
      const price = TARIFFS.find(t => t.id === tid).price;
      this.tar[tid].n++; this.tar[tid].rev += price;
      this.ch[chid].n++; this.ch[chid].rev += price;
      this.sold++; this.addRev('skipass', price);
      if (this.min) this.min.sales++;
    }

    // ---------- гости ----------
    arrive(h, m) {
      const r = this.r;
      this.on++; this.arrCum++; this.min.arr++;
      if (this.presoldLeft > 0 && r() < 0.3) this.presoldLeft--;
      else {
        const mix = tariffMix(h);
        this.sell(pickW(r, TARIFFS, t => mix[t.id] || 0).id, pickW(r, CHANNELS, c => c.w).id);
      }
      if (r() < 0.25) this.rentKit();
      if (r() < 0.12) this.takeLocker(m);
      if (r() < 0.2) {
        if (this.cars < C.PARK_CAP) { this.cars++; this.addRev('parking', C.PARK_PRICE); } else this.parkLost++;
      }
    }
    depart() {
      const r = this.r, on = this.on;
      this.on--; this.depCum++;
      if (this.renters > 0 && r() < this.renters / on) this.returnKit();
      if (this.lockerUsers > 0 && r() < this.lockerUsers / on) this.releaseLocker();
      if (r() < 0.2 && this.cars > 30) this.cars--;
    }

    // ---------- прокат ----------
    takeItem(id, pref) {
      const c = this.rent[id];
      for (const pt of [pref, 1 - pref]) if (c.stock[pt] > 0) { c.stock[pt]--; c.out++; return pt; }
      return -1;
    }
    takeBoot(pref) {
      const si = pickIdx(this.r, BOOT_W);
      for (const pt of [pref, 1 - pref]) {
        if (this.bootStock[pt][si] > 0) {
          this.bootStock[pt][si]--; this.rent.boots.stock[pt]--; this.rent.boots.out++; this.bootsOut[si]++;
          return;
        }
      }
      this.bootMiss[si]++;
    }
    rentKit() {
      const r = this.r, pref = r() < POINT_SHARE[0] ? 0 : 1, type = r() < 0.62 ? 'ski' : 'board';
      const pt = this.takeItem(type, pref);
      if (pt < 0) { this.lost.n++; this.lost.rev += C.RENT_PRICE[type]; return; }
      this.takeBoot(pt);
      if (type === 'ski') this.takeItem('poles', pt);
      let price = C.RENT_PRICE[type];
      if (r() < 0.75 && this.takeItem('helmet', pt) >= 0) price += C.RENT_PRICE.helmet;
      this.renters++; this.addRev('rental', price); this.min.issue[pt]++;
    }
    returnKit() {
      const r = this.r, pt = r() < POINT_SHARE[0] ? 0 : 1;
      const s = this.rent.ski.out, b = this.rent.board.out;
      if (s + b === 0) { this.renters = 0; return; }
      const type = r() < s / (s + b) ? 'ski' : 'board';
      this.retItem(type, pt);
      if (this.rent.boots.out > 0) { const si = pickIdx(r, this.bootsOut); this.bootsOut[si]--; this.retItem('boots', pt, si); }
      if (type === 'ski' && this.rent.poles.out > 0) this.retItem('poles', pt);
      if (this.rent.helmet.out > 0 && r() < this.rent.helmet.out / Math.max(1, this.renters)) this.retItem('helmet', pt);
      this.renters--; this.min.ret[pt]++;
    }
    retItem(id, pt, si) {
      const c = this.rent[id]; c.out--;
      if (this.r() < 0.12) {
        c.svc++; this.min.svc++;
        this.svcQ.push({ id, pt, si, at: this.t + 25 + Math.floor(this.r() * 25) });
      } else this.restock(id, pt, si);
    }
    restock(id, pt, si) {
      this.rent[id].stock[pt]++;
      if (id === 'boots') this.bootStock[pt][si]++;
    }

    // ---------- шкафчики ----------
    takeLocker(m) {
      const pref = this.r() < 0.65 ? 0 : 1;
      for (const ri of [pref, 1 - pref]) {
        const free = this.cells.filter(c => c.room === ri && c.state === 0);
        if (free.length) {
          const c = free[Math.floor(this.r() * free.length)];
          c.state = 1; c.since = m; c.ch = m;
          this.lockerUsers++; this.addRev('lockers', C.LOCKER_PRICE);
          return;
        }
      }
      this.lockerLost++;
    }
    releaseLocker() {
      const busy = this.cells.filter(c => c.state === 1);
      if (!busy.length) { this.lockerUsers = 0; return; }
      let best = null;
      for (let i = 0; i < 3; i++) {
        const c = busy[Math.floor(this.r() * busy.length)];
        if (!best || c.since < best.since) best = c;
      }
      best.state = 0; best.ch = this.t; this.lockerUsers--;
    }

    // ---------- шаг модели ----------
    step() {
      const r = this.r, m = this.t, h = m / 60;
      this.min = { arr: 0, sales: 0, issue: [0, 0], ret: [0, 0], svc: 0 };

      const nArr = poisson(r, this.total * shape(m) / Z);
      for (let i = 0; i < nArr; i++) this.arrive(h, m);
      const k = 1 / 280 + Math.max(0, h - 15) * 0.004 + (h >= 20.75 ? 0.15 : 0);
      const nDep = Math.min(this.on, poisson(r, this.on * k));
      for (let i = 0; i < nDep; i++) this.depart();

      this.stepWeather(h, m);
      this.stepLifts(h, m);
      this.stepSlopes(m);
      this.stepService(m);
      this.stepInfra(h, m);

      this.hist.rev.push(this.revenue);
      this.hist.guests.push(this.on);
      this.hist.passes.push(this.thr);
      this.hist.arr.push(this.min.arr);
      this.hist.sales.push(this.min.sales);
      this.hist.wait.push(this.waitAvg());
      this.flowHist.push(this.min);
      if (this.flowHist.length > 60) this.flowHist.shift();
      this.t++;
    }

    stepWeather(h, m) {
      const w = this.sc.weather, r = this.r;
      const wind = this.sc.storm ? 8 + 9 * gauss(h, 12.8, 1.2) + (r() - 0.5) : w.wind + (r() - 0.5) * 1.5;
      this.weather = { ...w, temp: w.temp + 3 * gauss(h, 14, 2.5), wind: Math.max(0, wind) };
      const L1 = this.lifts[0], L2 = this.lifts[1];
      const closing = m >= CLOSE - 10;
      L1.k = !closing && this.weather.wind >= 14 ? 0 : 1;
      L1.status = L1.k === 0 ? 'stop' : 'ok';
      L2.k = this.weather.wind >= 12 ? 0.6 : 1;
      L2.status = L2.k < 1 ? 'slow' : 'ok';
    }

    stepLifts(h, m) {
      const r = this.r;
      // Катающиеся вне очереди возвращаются к подъёмникам раз в цикл «подъём + спуск»
      const active = this.on * (0.88 - 0.2 * lunch(h));
      const free = Math.max(0, active - this.queued());
      const demand = free / C.CYCLE_MIN * (this.sc.storm ? 0.8 : 1);
      const ws = this.lifts.map(l => {
        if (l.k === 0) return 0;
        let w = l.w * Math.exp(-l.wait / 9);
        if (l.id === 'L1' && h < 11.5) w *= 1.25;
        if (l.id === 'L4') w *= h < 13 ? 1.2 : 0.9;
        return w;
      });
      const sw = ws.reduce((a, b) => a + b, 0) || 1;
      let tot = 0;
      this.lifts.forEach((l, i) => {
        const d = demand * ws[i] / sw, c = l.cap / 60 * l.k;
        const avail = l.q + d, thr = Math.min(c, avail);
        l.q = Math.max(0, avail - thr) * (l.k === 0 ? 0.7 : 1);
        l.demand = d; l.thr = thr; l.wait = c > 0 ? l.q / c : 0;
        l.passes += thr; tot += thr;
        l.hist.push(thr); if (l.hist.length > 60) l.hist.shift();
      });
      this.passes += tot; this.thr = tot;

      // Защита от злоупотреблений на турникетах
      if (r() < tot * 0.0006) {
        const f = pickW(r, FRAUD, x => x.w);
        const l = pickW(r, this.lifts, x => x.thr);
        this.fraud.n++; this.fraud.saved += f.v;
        if (!this.quiet) this.events.push({ m, kind: 'deny', gate: l.gates[Math.floor(r() * l.gates.length)], lift: l.short, text: f.text, id: 'SP ' + (100000 + Math.floor(r() * 900000)) });
      }
      if (!this.quiet) {
        const nEv = Math.min(3, Math.round(tot / 45) + (r() < 0.5 ? 1 : 0));
        const mix = tariffMix(h);
        for (let i = 0; i < nEv && tot > 0; i++) {
          const l = pickW(r, this.lifts, x => x.thr);
          const tf = pickW(r, TARIFFS, t => mix[t.id] || 0);
          const card = r() < 0.2;
          this.events.push({
            m, kind: 'ok', gate: l.gates[Math.floor(r() * l.gates.length)], lift: l.short, text: tf.name,
            id: card ? 'Карта •• ' + (1000 + Math.floor(r() * 9000)) : 'SP ' + (100000 + Math.floor(r() * 900000)),
          });
        }
        if (this.events.length > 40) this.events.splice(0, this.events.length - 40);
      }
    }

    stepSlopes(m) {
      const r = this.r, night = m >= NIGHT;
      this.slopes.forEach(s => {
        s.open = !night || s.night;
        s.pop = clamp(s.pop + (r() - 0.5) * 0.05 + (1 - s.pop) * 0.03, 0.6, 1.5);
      });
      this.lifts.forEach(l => {
        const own = this.slopes.filter(s => s.lift === l.id);
        const sum = own.filter(s => s.open).reduce((a, s) => a + s.share * s.pop, 0) || 1;
        own.forEach(s => {
          const target = s.open ? l.thr * s.share * s.pop / sum * s.time : 0;
          s.occ += (target - s.occ) * 0.3;
        });
      });
    }

    stepService(m) {
      this.svcQ = this.svcQ.filter(it => {
        if (it.at > m) return true;
        this.rent[it.id].svc--; this.restock(it.id, it.pt, it.si);
        return false;
      });
    }

    stepInfra(h, m) {
      const r = this.r;
      const nCafe = poisson(r, this.on * (0.0012 + 0.0055 * lunch(h)));
      this.cafeGuests += nCafe;
      if (nCafe) this.addRev('cafe', nCafe * C.CAFE_CHECK * (0.8 + 0.4 * r()));
      this.cafeLoad = clamp(this.on * (0.03 + 0.12 * lunch(h)) / C.CAFE_SEATS, 0, 1);

      this.lessons = this.lessons.filter(e => e > m);
      if (h < 16.5) {
        const n = poisson(r, this.on * 0.00011);
        for (let i = 0; i < n; i++) {
          if (this.lessons.length < C.INSTRUCTORS) {
            const long = r() < 0.35;
            this.lessons.push(m + (long ? 120 : 60)); this.lessonsCount++;
            this.addRev('school', long ? 6000 : 3500);
          } else this.lessonsLost++;
        }
      }
    }

    // ---------- сводки для интерфейса ----------
    waitAvg() {
      let s = 0, w = 0;
      for (const l of this.lifts) if (l.k > 0) { s += l.wait * l.thr; w += l.thr; }
      return w ? s / w : 0;
    }
    skiing() { return this.slopes.reduce((a, s) => a + s.occ, 0); }
    queued() { return this.lifts.reduce((a, l) => a + l.q, 0); }
  }

  window.SKI = {
    OPEN, CLOSE, NIGHT, Day, TARIFFS, CHANNELS, BIZ, LIFTS, SLOPES, RENTAL, POINTS, POINT_SHARE,
    BOOT_SIZES, LOCKER_ROOMS, SCENARIOS, C,
  };
})();
