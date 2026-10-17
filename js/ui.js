/* Интерфейс пульта: KPI, графики, лента турникетов, прокат, шкафчики, подсказки. */
(function () {
  'use strict';
  const S = window.SKI, U = window.SKI_UTIL;
  const { OPEN, CLOSE, C } = S;
  const $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('ru-RU');
  const money = n => fmt(n) + ' ₽';
  const mln = (n, d = 2) => (n / 1e6).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' млн ₽';
  const kRub = n => n >= 1e6 ? mln(n) : n >= 1e4 ? fmt(n / 1000) + ' тыс ₽' : money(n);
  const hhmm = m => { m = Math.floor(m); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const pct = x => Math.round((isFinite(x) ? x : 0) * 100) + '%';
  const sum = a => { let s = 0; for (const v of a) s += v; return s; };
  const lvlColor = (x, w, b) => x >= b ? '#ef4444' : x >= w ? '#facc15' : '#22c55e';
  const niceMax = v => {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  };
  const stat = (l, v, cls = '') => `<div class="stat"><span>${l}</span><b class="${cls}">${v}</b></div>`;
  const delta = x => {
    if (!isFinite(x)) return '';
    const up = x >= 0;
    return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(x * 100))}%</span>`;
  };

  // «Прошлая суббота» — эталонный день, от него считаем план и прогноз
  const PLAN_K = 1.06;
  const base = new S.Day('normal', 4242, { k: 0.93, quiet: true });
  while (base.t < CLOSE) base.step();
  const PLAN = base.revenue * PLAN_K;

  const mapView = new window.MapView($('#map'), $('#tip'), $('#mapWrap'));
  let day, sid = 'normal', speed = 60, acc = 0;
  let cellEls = null, insSig = '', insKeys = new Set();
  const done = {};

  function stats() {
    const n = day.hist.rev.length, i = Math.max(0, n - 1);
    const bNow = base.hist.rev[i] || 1;
    const ratio = day.revenue / bNow;
    const fc = day.revenue + (base.revenue - bNow) * ratio;
    const pass60 = sum(day.hist.passes.slice(-60));
    const bPass60 = sum(base.hist.passes.slice(Math.max(0, n - 60), n));
    const maxL = day.lifts.reduce((a, l) => (l.k > 0 && l.wait > a.wait ? l : a), { wait: -1 });
    return { n, bNow, ratio, fc, pass60, bPass60, maxL, planNow: bNow * PLAN_K };
  }

  // ---------- KPI ----------
  const KPIS = [
    { id: 'rev', label: 'Выручка сегодня', color: '#1db56c', f: v => fmt(v) + '<small>₽</small>' },
    { id: 'sold', label: 'Продано ски-пассов', color: '#00aeef', f: v => fmt(v) },
    { id: 'guests', label: 'Гостей на курорте', color: '#9bd36a', f: v => fmt(v) },
    { id: 'turn', label: 'Проходов за последний час', color: '#f0cd36', f: v => fmt(v) },
    { id: 'wait', label: 'Средняя очередь к подъёмникам', color: '#ff6b57', f: v => v.toFixed(1).replace('.', ',') + '<small>мин</small>' },
    { id: 'fc', label: 'Прогноз выручки на 21:00', color: '#c9b28f', f: v => (v / 1e6).toFixed(1).replace('.', ',') + '<small>млн ₽</small>' },
  ];
  $('#kpis').innerHTML = KPIS.map(k => `<div class="kpi" style="--accent:${k.color}" id="k-${k.id}">
      <svg class="spark" viewBox="0 0 200 44" preserveAspectRatio="none"></svg>
      <div class="kpi-l">${k.label}</div><div class="kpi-v"></div><div class="kpi-s"></div></div>`).join('');
  const kEl = {};
  KPIS.forEach(k => {
    const r = $('#k-' + k.id);
    kEl[k.id] = { v: r.querySelector('.kpi-v'), s: r.querySelector('.kpi-s'), sp: r.querySelector('.spark'), color: k.color, f: k.f };
  });
  const tw = {};
  function setT(id, v) { if (!tw[id]) tw[id] = { cur: v, tgt: v }; tw[id].tgt = v; }
  function tickT(dt) {
    for (const id in tw) {
      const t = tw[id];
      t.cur += (t.tgt - t.cur) * Math.min(1, dt * 4);
      const s = kEl[id].f(t.cur);
      if (s !== t.last) { kEl[id].v.innerHTML = s; t.last = s; }
    }
  }

  function updateKPIs(st) {
    setT('rev', day.revenue);
    kEl.rev.s.innerHTML = `${delta(day.revenue / st.bNow - 1)}к прошлой субботе
      <div class="prog"><i style="width:${Math.min(100, day.revenue / PLAN * 100)}%"></i></div>
      план дня <b>${mln(PLAN, 1)}</b> · выполнено <b>${pct(day.revenue / PLAN)}</b>`;
    setT('sold', day.sold);
    const sh = id => pct(day.ch[id].n / day.sold);
    kEl.sold.s.innerHTML = `онлайн <b>${sh('online')}</b> · КСО <b>${sh('kso')}</b> · карта на турникете <b>${sh('card')}</b>`;
    setT('guests', day.on);
    kEl.guests.s.innerHTML = `на склонах <b>${fmt(day.skiing())}</b> · в очередях <b>${fmt(day.queued())}</b> · в кафе <b>${fmt(day.cafeLoad * C.CAFE_SEATS)}</b>`;
    setT('turn', st.pass60);
    kEl.turn.s.innerHTML = `${delta(st.pass60 / Math.max(1, st.bPass60) - 1)}к прошлой субботе · за день <b>${fmt(day.passes)}</b>`;
    const w = day.waitAvg();
    setT('wait', w);
    kEl.wait.v.style.color = U.waitColor(w);
    kEl.wait.s.innerHTML = st.maxL.wait >= 1 ? `максимум <b>${Math.round(st.maxL.wait)} мин</b> — ${st.maxL.name}` : 'очередей нет';
    setT('fc', st.fc);
    kEl.fc.s.innerHTML = `${delta(st.fc / PLAN - 1)}к плану дня · план <b>${mln(PLAN, 1)}</b><br>прошлая суббота <b>${mln(base.revenue, 1)}</b>`;
  }

  function rolling(a, w) {
    const out = new Array(a.length); let s = 0;
    for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= w) s -= a[i - w]; out[i] = s / Math.min(i + 1, w); }
    return out;
  }
  function spark(id, arr) {
    const k = kEl[id];
    if (!arr.length) { k.sp.innerHTML = ''; return; }
    const step = Math.max(1, Math.floor(arr.length / 120));
    let max = 0; for (const v of arr) if (v > max) max = v;
    max = max * 1.1 || 1;
    let line = '';
    for (let i = 0; i < arr.length; i += step) line += (line ? 'L' : 'M') + (i / (CLOSE - OPEN) * 200).toFixed(1) + ',' + (44 - arr[i] / max * 34).toFixed(1);
    const lastX = ((arr.length - 1) / (CLOSE - OPEN) * 200).toFixed(1);
    line += `L${lastX},${(44 - arr[arr.length - 1] / max * 34).toFixed(1)}`;
    k.sp.innerHTML = `<defs><linearGradient id="sg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.color}" stop-opacity=".28"/><stop offset="1" stop-color="${k.color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${line}L${lastX},44L0,44Z" fill="url(#sg-${id})"/>
      <path d="${line}" fill="none" stroke="${k.color}" stroke-width="1.5" stroke-opacity=".7" vector-effect="non-scaling-stroke"/>`;
  }

  // ---------- Шапка ----------
  function updateHeader() {
    const w = day.weather, t = Math.round(w.temp);
    const stopped = day.lifts.filter(l => l.k === 0).length;
    const chip = (h, c = '') => `<span class="chip ${c}">${h}</span>`;
    $('#weather').innerHTML =
      chip(`<b>${t < 0 ? '−' + Math.abs(t) : t}°</b> ${w.sky}`) +
      chip(`Ветер <b>${Math.round(w.wind)} м/с</b>`, w.wind >= 12 ? 'bad' : '') +
      chip(`❄ <b>${w.snow}</b>`) +
      (stopped ? chip(`<b>${stopped}</b> подъёмник остановлен`, 'bad') : chip('Все подъёмники работают', 'good'));
  }

  // ---------- Подъёмники, трассы ----------
  function updateLifts() {
    $('#lifts').innerHTML = day.lifts.map(l => {
      const util = l.thr * 60 / l.cap;
      const note = l.status === 'stop' ? ' · остановлен, ветер' : l.status === 'slow' ? ' · снижена скорость' : '';
      return `<div class="lift-row ${l.status === 'stop' ? 'stop' : ''}">
        <div class="lr-top"><span class="st ${l.status}"></span>
          <div><div class="lr-name">${l.name}</div><div class="lr-kind">${l.kind}${note}</div></div>
          <div class="lr-wait" style="color:${l.k === 0 ? '#ef4444' : U.waitColor(l.wait)}">${l.k === 0 ? 'стоп' : Math.round(l.wait) + '<small>мин</small>'}</div>
        </div>
        <div class="lr-bar"><i style="width:${Math.min(100, util * 100)}%"></i></div>
        <div class="lr-sub"><span>загрузка ${pct(util)} · ${fmt(l.thr * 60)} из ${fmt(l.cap)} чел/ч</span><span>в очереди ${fmt(l.q)}</span></div>
      </div>`;
    }).join('');
  }
  function updateSlopeChips() {
    $('#slopeChips').innerHTML = day.slopes.map(s => {
      const d = s.occ / s.cap;
      return `<div class="sc ${s.open ? '' : 'closed'}">
        <div class="sc-top"><i class="dm" style="background:${U.DIFF[s.diff]}"></i>${s.name}<b>${s.open ? fmt(s.occ) : '—'}</b></div>
        <div class="sc-bar"><i style="width:${s.open ? Math.min(100, d * 100) : 0}%;background:${U.densColor(d)}"></i></div>
        <div class="sc-sub">${s.open ? pct(d) + ' · ' + U.densLabel(d) : 'закрыта на вечер'}</div></div>`;
    }).join('');
  }

  // ---------- Умные подсказки ----------
  const ORDER = { bad: 0, warn: 1, good: 2, info: 3 };
  const ICON = { bad: '!', warn: '!', good: '↑', info: 'i' };
  function insights(st) {
    const out = [];
    // Учебный бугель не годится как альтернатива для катающихся с вершины
    const open = day.lifts.filter(l => l.k > 0 && l.id !== 'L4');
    const best = open.slice().sort((a, b) => a.wait - b.wait)[0];
    for (const l of day.lifts) {
      if (l.k === 0) {
        out.push({ key: 'stop' + l.id, lvl: 'bad', t: `${l.name} остановлен`,
          d: `Ветер ${Math.round(day.weather.wind)} м/с. Гости уходят на «${best ? best.short : '—'}». Предупредить гостей в BarsPay?`,
          a: 'Отправить push', r: `✓ Push отправлен ${fmt(day.on)} гостям` });
      } else if (l.wait >= 8 && day.lifts.filter(x => x.k > 0 && x.wait >= 8).length === 1) {
        const alt = best && best.id !== l.id && best.wait < l.wait - 3;
        out.push({ key: 'q' + l.id, lvl: 'bad', icon: '⏱', t: `Очередь ${Math.round(l.wait)} мин — ${l.name}`,
          d: alt ? `На «${best.short}» сейчас ${Math.round(best.wait)} мин. Подсказать гостям альтернативу?` : 'Все подъёмники загружены. Откройте доп. линию турникетов.',
          a: alt ? `Push: «Без очереди — ${best.short}»` : 'Открыть линию', r: alt ? `✓ Отправлено ${fmt(day.on * 0.6)} гостям` : '✓ Задача контролёру отправлена' });
      }
    }
    const jam = day.lifts.filter(x => x.k > 0 && x.wait >= 8);
    if (jam.length > 1) {
      const mx = Math.max(...jam.map(x => x.wait));
      out.push({ key: 'jam', lvl: 'bad', icon: '⏱', t: `Очереди на ${jam.length} подъёмниках — до ${Math.round(mx)} мин`,
        d: `${jam.map(x => x.short).join(', ')}. Откройте доп. линии турникетов и запустите продажу «Вечерний −20%», чтобы растянуть поток.`,
        a: 'Открыть все линии', r: '✓ Контролёры получили задачи' });
    }
    for (const id of ['ski', 'board']) {
      const c = day.rent[id];
      for (const pt of [0, 1]) {
        if (c.stock[pt] / c.init[pt] >= 0.15) continue;
        const other = 1 - pt, can = c.stock[other] > 30;
        out.push({ key: 'r' + id + pt, lvl: 'warn', icon: '⇄', t: `Прокат «${S.POINTS[pt]}»: ${id === 'ski' ? 'лыж' : 'сноубордов'} осталось ${c.stock[pt]}`,
          d: can ? `На «${S.POINTS[other]}» на складе ${c.stock[other]}. Переместить ${Math.min(40, Math.floor(c.stock[other] / 2))} шт.?` : 'Оба пункта на исходе — включите бронь проката в BarsPay.',
          a: can ? 'Создать перемещение' : null, r: '✓ Заявка на перемещение создана' });
      }
    }
    const low = S.BOOT_SIZES.map((s, i) => ({ s, n: day.bootStock[0][i] + day.bootStock[1][i] })).filter(x => x.n <= 5);
    if (low.length) out.push({ key: 'boots', lvl: 'warn', t: `Ботинки ${low.map(x => x.s).join(', ')} р. — на исходе`,
      d: `Осталось: ${low.map(x => `${x.s} р. — ${x.n}`).join(', ')}. Ускорьте выдачу из сервиса.` });
    if (day.lost.n >= 3) out.push({ key: 'lost', lvl: 'warn', t: `Упущено ${fmt(day.lost.n)} прокатов`, d: `Не хватило комплектов — недополучено ≈ ${kRub(day.lost.rev)}. Пора докупить парк проката.` });
    S.LOCKER_ROOMS.forEach((room, ri) => {
      const cells = day.cells.filter(c => c.room === ri && c.state !== 3), busy = cells.filter(c => c.state === 1).length;
      if (busy / cells.length >= 0.9) out.push({ key: 'lk' + ri, lvl: 'warn', t: `${room.name.split(' · ')[0]} заполнена на ${pct(busy / cells.length)}`,
        d: ri === 0 ? 'Направляйте гостей в раздевалку Б: табло на входе и подсказка в приложении.' : 'Свободные шкафчики остались в раздевалке А.' });
    });
    if (day.cars / C.PARK_CAP >= 0.9) out.push({ key: 'park', lvl: 'warn', t: `Парковка заполнена на ${pct(day.cars / C.PARK_CAP)}`, d: 'Включите на въезде табло «Резервная парковка P2» и шаттл.', a: 'Включить табло', r: '✓ Табло P2 включено' });
    if (day.cafeLoad >= 0.85) out.push({ key: 'cafe', lvl: 'warn', t: `Кафе заполнено на ${pct(day.cafeLoad)}`, d: 'Откройте веранду и предложите заказ «с собой» в BarsPay.' });
    if (day.lessonsLost > 0 && day.t < 17 * 60) out.push({ key: 'school', lvl: 'info', t: `Школа: ${day.lessonsLost} отказов в занятиях`, d: 'Нет свободных инструкторов. Выведите резерв на смену 12–16.' });
    if (st.n > 60) {
      if (st.fc >= PLAN) out.push({ key: 'fc', lvl: 'good', t: `Прогноз ${mln(st.fc, 1)} — выше плана на ${pct(st.fc / PLAN - 1)}`, d: `Ски-пассы: ${kRub(day.biz.skipass)}, прокат: ${kRub(day.biz.rental)}. День идёт лучше прошлой субботы.` });
      else out.push({ key: 'fc', lvl: st.fc < PLAN * 0.85 ? 'bad' : 'warn', t: `Прогноз ${mln(st.fc, 1)} — ниже плана на ${pct(1 - st.fc / PLAN)}`,
        d: 'Добрать выручку: вечерний ски-пасс −20% для гостей с покупками за 30 дней.', a: 'Запустить акцию в BarsPay', r: '✓ Акция запущена: 2 140 получателей' });
    }
    if (day.fraud.n > 0) out.push({ key: 'fraud', lvl: 'info', icon: '🛡', t: `Турникеты остановили ${day.fraud.n} нарушений`, d: `Сохранено ${money(day.fraud.saved)}: повторные проходы, стоп-лист, сверка по фото.` });
    return out.sort((a, b) => ORDER[a.lvl] - ORDER[b.lvl]).slice(0, 6);
  }
  function updateInsights(st) {
    const list = insights(st);
    const sig = list.map(i => i.key + i.t + i.d + (done[i.key] || '')).join('|');
    if (sig === insSig) return;
    insSig = sig;
    const prev = insKeys;
    insKeys = new Set(list.map(i => i.key));
    $('#insights').innerHTML = list.map(i => `<div class="ins ${i.lvl}${prev.has(i.key) ? '' : ' new'}"><div class="ins-i">${i.icon || ICON[i.lvl]}</div>
      <div><div class="ins-t">${i.t}</div><div class="ins-d">${i.d}</div>
      ${i.a ? (done[i.key] ? `<span class="ins-a done">${done[i.key]}</span>` : `<button class="ins-a" data-k="${i.key}" data-r="${i.r}">${i.a}</button>`) : ''}</div></div>`).join('');
  }
  $('#insights').addEventListener('click', e => {
    const b = e.target.closest('button.ins-a');
    if (!b) return;
    done[b.dataset.k] = b.dataset.r;
    insSig = '';
    updateInsights(stats());
  });

  // ---------- Выручка ----------
  function drawRevenue(st) {
    const svg = $('#revChart'), W = Math.max(300, svg.clientWidth || 640), H = 240, L = 50, R = 12, T = 12, B = 22;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const X = m => L + (m - OPEN) / (CLOSE - OPEN) * (W - L - R);
    const ymax = niceMax(Math.max(PLAN, st.fc, base.revenue) * 1.04);
    const Y = v => T + (1 - v / ymax) * (H - T - B);
    const idxs = (from, to) => { const r = []; for (let i = from; i < to; i += 4) r.push(i); if (to > from && r[r.length - 1] !== to - 1) r.push(to - 1); return r; };
    const pathOf = (arr, k = 1) => idxs(0, arr.length).map((i, j) => (j ? 'L' : 'M') + X(OPEN + i + 1).toFixed(1) + ',' + Y(arr[i] * k).toFixed(1)).join('');
    let g = '';
    for (let j = 0; j <= 4; j++) {
      const v = ymax * j / 4, y = Y(v).toFixed(1);
      g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="rgba(235,225,205,.08)"/>
        <text x="${L - 7}" y="${+y + 3.5}" text-anchor="end">${j ? (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн' : '0'}</text>`;
    }
    for (let h = 9; h <= 21; h += 2) g += `<text x="${X(h * 60).toFixed(1)}" y="${H - 5}" text-anchor="middle">${h}:00</text>`;
    const n = day.hist.rev.length, nowX = X(OPEN + n).toFixed(1), nowY = Y(day.revenue).toFixed(1);
    const today = pathOf(day.hist.rev);
    let fcp = `M${nowX},${nowY}`;
    for (let i = n; i < base.hist.rev.length; i += 6) fcp += `L${X(OPEN + i + 1).toFixed(1)},${Y(day.revenue + (base.hist.rev[i] - st.bNow) * st.ratio).toFixed(1)}`;
    fcp += `L${X(CLOSE).toFixed(1)},${Y(st.fc).toFixed(1)}`;
    const lblX = Math.min(+nowX + 8, W - R - 132);
    svg.innerHTML = `<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1db56c" stop-opacity=".32"/><stop offset="1" stop-color="#1db56c" stop-opacity="0"/></linearGradient></defs>
      ${g}
      <path d="${pathOf(base.hist.rev)}" fill="none" stroke="#7a7366" stroke-width="1.5"/>
      <path d="${pathOf(base.hist.rev, PLAN_K)}" fill="none" stroke="#f0cd36" stroke-width="1.5" stroke-dasharray="5 4"/>
      ${n ? `<path d="${today}L${nowX},${Y(0)}L${X(OPEN + 1)},${Y(0)}Z" fill="url(#ga)"/>
      <path d="${today}" fill="none" stroke="#1db56c" stroke-width="2.6" stroke-linejoin="round"/>` : ''}
      <path d="${fcp}" fill="none" stroke="#1db56c" stroke-width="2.2" stroke-dasharray="1 5" stroke-linecap="round"/>
      <circle cx="${X(CLOSE).toFixed(1)}" cy="${Y(st.fc).toFixed(1)}" r="4" fill="#1a1815" stroke="#1db56c" stroke-width="2"/>
      <line x1="${nowX}" x2="${nowX}" y1="${T}" y2="${H - B}" stroke="rgba(255,255,255,.22)" stroke-dasharray="3 3"/>
      <circle cx="${nowX}" cy="${nowY}" r="9" fill="#1db56c" opacity=".18"/>
      <circle cx="${nowX}" cy="${nowY}" r="4.5" fill="#1db56c" stroke="#fff" stroke-width="1.5"/>
      <g transform="translate(${lblX},${Math.max(T + 2, +nowY - 34)})"><rect width="124" height="22" rx="7" fill="rgba(24,22,19,.94)" stroke="rgba(235,225,205,.2)"/>
      <text x="62" y="15" text-anchor="middle" style="fill:#f2efe9;font-weight:700">${hhmm(day.t)} · ${mln(day.revenue)}</text></g>`;
    $('#revStats').innerHTML = stat('Факт', mln(day.revenue)) +
      stat('План на ' + hhmm(day.t), mln(st.planNow), day.revenue >= st.planNow ? 'good' : 'bad') +
      stat('Прошлая суббота', mln(st.bNow)) +
      stat('Прогноз на 21:00', mln(st.fc), st.fc >= PLAN ? 'good' : 'bad');
  }

  function drawTariffs() {
    const tot = sum(S.TARIFFS.map(t => day.tar[t.id].rev)) || 1;
    const r = 66, Cc = 2 * Math.PI * r;
    let off = 0, segs = '';
    for (const t of S.TARIFFS) {
      const len = day.tar[t.id].rev / tot * Cc;
      if (len > 1) segs += `<circle cx="90" cy="90" r="${r}" fill="none" stroke="${t.color}" stroke-width="22" stroke-dasharray="${(len - 2).toFixed(1)} ${Cc.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 90 90)"><title>${t.name}: ${pct(day.tar[t.id].rev / tot)}</title></circle>`;
      off += len;
    }
    $('#donut').innerHTML = `<circle cx="90" cy="90" r="${r}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="22"/>${segs}
      <text x="90" y="92" text-anchor="middle" class="donut-c1">${fmt(day.sold)}</text>
      <text x="90" y="110" text-anchor="middle" class="donut-c2">ски-пассов</text>`;
    $('#tariffs').innerHTML = S.TARIFFS.map(t => {
      const x = day.tar[t.id];
      return `<div class="lt-row"><i style="background:${t.color}"></i>${t.name}<span>${fmt(x.n)} шт</span><b>${kRub(x.rev)}</b></div>`;
    }).join('') + `<div class="lt-row lt-total"><i></i>Итого<span></span><b>${mln(tot)}</b></div>`;
  }

  function drawBiz() {
    const list = S.BIZ.map(b => ({ ...b, v: day.biz[b.id] })).sort((a, b) => b.v - a.v);
    const max = list[0].v || 1, tot = day.revenue || 1;
    $('#biz').innerHTML = list.map(b => `<div class="bar-row"><div class="bar-top"><span>${b.name}</span><b>${kRub(b.v)} <span>· ${pct(b.v / tot)}</span></b></div>
      <div class="bar"><i style="width:${b.v / max * 100}%;background:${b.color}"></i></div></div>`).join('');
    const ct = sum(S.CHANNELS.map(c => day.ch[c.id].rev)) || 1;
    $('#channels').innerHTML = `<div class="stack">${S.CHANNELS.map(c => `<i style="width:${day.ch[c.id].rev / ct * 100}%;background:${c.color}"></i>`).join('')}</div>` +
      S.CHANNELS.map(c => `<div class="ch-row"><i style="background:${c.color}"></i>${c.name}<b>${pct(day.ch[c.id].rev / ct)}</b></div>`).join('');
  }

  function drawHours() {
    const svg = $('#hours'), W = Math.max(220, svg.clientWidth || 300), H = 170, L = 4, R = 4, T = 18, B = 20;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const HN = 12;
    const per = (d, h) => sum(d.hist.arr.slice(h * 60, (h + 1) * 60));
    const today = [], prev = [];
    for (let h = 0; h < HN; h++) { today.push(per(day, h)); prev.push(per(base, h)); }
    const max = niceMax(Math.max(...today, ...prev) * 1.12);
    const bw = (W - L - R) / HN, cur = Math.floor((day.t - OPEN) / 60);
    let s = '';
    for (let h = 0; h < HN; h++) {
      const x = L + h * bw, yb = v => T + (1 - v / max) * (H - T - B);
      s += `<rect x="${(x + bw * 0.1).toFixed(1)}" y="${yb(prev[h]).toFixed(1)}" width="${(bw * 0.8).toFixed(1)}" height="${(H - B - yb(prev[h])).toFixed(1)}" rx="3" fill="#3a362f"/>`;
      if (h <= cur) s += `<rect x="${(x + bw * 0.24).toFixed(1)}" y="${yb(today[h]).toFixed(1)}" width="${(bw * 0.52).toFixed(1)}" height="${(H - B - yb(today[h])).toFixed(1)}" rx="3" fill="#9bd36a" opacity="${h === cur ? 0.55 : 1}"/>`;
      if (h % 2 === 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${9 + h}</text>`;
    }
    const pk = today.indexOf(Math.max(...today));
    s += `<text x="${(L + pk * bw + bw / 2).toFixed(1)}" y="${(T + (1 - today[pk] / max) * (H - T - B) - 5).toFixed(1)}" text-anchor="middle" style="fill:#f2efe9;font-weight:700">${fmt(today[pk])}</text>`;
    svg.innerHTML = s;
    const bCum = sum(base.hist.arr.slice(0, day.hist.arr.length));
    $('#hoursNote').innerHTML = `Пик прихода — <b>${9 + pk}:00–${10 + pk}:00</b>. Пришло за день <b>${fmt(day.arrCum)}</b> ${delta(day.arrCum / Math.max(1, bCum) - 1)}`;
  }

  // ---------- Турникеты ----------
  const GATES = [];
  S.LIFTS.forEach((l, li) => l.gates.forEach((g, gi) => GATES.push({ name: g, li, share: l.gates.length === 1 ? 1 : gi === 0 ? 0.54 : 0.46 })));
  function updateTurnstiles() {
    const last10 = sum(day.hist.passes.slice(-10));
    $('#turnStats').innerHTML = stat('Проходов сегодня', fmt(day.passes)) + stat('За 10 минут', fmt(last10)) +
      stat('Нарушений остановлено', fmt(day.fraud.n), day.fraud.n ? 'warn' : '') + stat('Сохранено выручки', money(day.fraud.saved), 'good');
    $('#gates').innerHTML = GATES.map(g => {
      const l = day.lifts[g.li], h = l.hist.slice(-15), mx = Math.max(1, ...l.hist) * g.share;
      const v = sum(l.hist.slice(-10)) * g.share;
      const bars = h.map((x, i) => { const hh = x * g.share / mx * 22; return `<rect x="${i * 100 / 15 + 0.6}" y="${24 - hh}" width="${100 / 15 - 1.2}" height="${Math.max(0.5, hh)}" rx="1" fill="${l.k === 0 ? '#ef4444' : '#f0cd36'}" opacity="${0.45 + 0.55 * i / 15}"/>`; }).join('');
      return `<div class="gate"><div class="gate-h"><span class="st ${l.status}"></span>${g.name}</div><div class="gate-l">${l.short}</div>
        <div class="gate-v">${fmt(v)}<small> / 10 мин</small></div><svg viewBox="0 0 100 24" preserveAspectRatio="none">${bars}</svg></div>`;
    }).join('');
  }
  const feed = $('#feed');
  function drainFeed() {
    if (!day.events.length) return;
    const di = day.events.findIndex(e => e.kind === 'deny');
    const ev = di >= 0 ? day.events.splice(di, 1)[0] : day.events.shift();
    if (day.events.length > 15) day.events.splice(0, day.events.length - 15);
    const li = document.createElement('li');
    if (ev.kind === 'deny') li.className = 'deny';
    li.innerHTML = `<time>${hhmm(ev.m)}</time><span class="g">${ev.gate}</span><span class="t"><b>${ev.lift}</b> · ${ev.text} · ${ev.id}</span><span class="tag ${ev.kind}">${ev.kind === 'deny' ? 'ОТКАЗ' : 'ПРОХОД'}</span>`;
    feed.prepend(li);
    while (feed.children.length > 8) feed.lastChild.remove();
  }

  // ---------- Прокат ----------
  const RF = { edges: {}, nodes: {}, parts: [], acc: {} };
  (function buildRentFlow() {
    const svg = $('#rentFlow'), NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, a, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };
    const E = {
      issA: { d: 'M160,34 C214,34 208,84 262,84', c: '#9bd36a' },
      retA: { d: 'M262,100 C204,100 214,58 160,58', c: '#1db56c' },
      issB: { d: 'M160,170 C214,170 208,116 262,116', c: '#9bd36a' },
      retB: { d: 'M262,130 C204,130 214,194 160,194', c: '#1db56c' },
      svcA: { d: 'M128,80 C150,140 214,182 262,186', c: '#f0cd36' },
      svcB: { d: 'M160,208 C206,208 218,204 262,204', c: '#f0cd36' },
    };
    for (const k in E) {
      const path = mk('path', { d: E[k].d, class: 'rf-edge', stroke: E[k].c }, svg);
      RF.edges[k] = { path, len: path.getTotalLength(), c: E[k].c };
    }
    const N = { A: [10, 14, 150, 66], B: [10, 150, 150, 66], SL: [262, 62, 148, 84], SV: [262, 172, 148, 46] };
    for (const k in N) {
      const [x, y, w, h] = N[k];
      const g = mk('g', { class: 'rf-node' }, svg);
      mk('rect', { x, y, width: w, height: h, rx: 11 }, g);
      const t1 = mk('text', { x: x + 12, y: y + 18, class: 't1' }, g);
      const t2 = mk('text', { x: x + 12, y: y + (k === 'SV' ? 37 : 39), class: 't2' }, g);
      const t3 = mk('text', { x: x + 12, y: y + 56, class: 't3' }, g);
      RF.nodes[k] = { t1, t2, t3 };
    }
    RF.nodes.A.t1.textContent = 'Прокат «Центральный»';
    RF.nodes.B.t1.textContent = 'Прокат «Восточный»';
    RF.nodes.SL.t1.textContent = '⛷ На склонах';
    RF.nodes.SV.t1.textContent = 'Сервис и заточка';
    RF.g = mk('g', null, svg);
  })();
  function flowRates() {
    const fh = day.flowHist;
    const r = {
      issA: sum(fh.map(m => m.issue[0])), issB: sum(fh.map(m => m.issue[1])),
      retA: sum(fh.map(m => m.ret[0])), retB: sum(fh.map(m => m.ret[1])),
    };
    const svc = sum(fh.map(m => m.svc)) / 3, rt = r.retA + r.retB || 1;
    r.svcA = svc * r.retA / rt; r.svcB = svc * r.retB / rt;
    return r;
  }
  function updateRental() {
    const R = day.rent, r = flowRates();
    const out = R.ski.out + R.board.out;
    const svcN = sum(S.RENTAL.map(c => R[c.id].svc));
    $('#rentStats').innerHTML = stat('Комплектов на склонах', fmt(out)) + stat('Выдача за час', fmt(r.issA + r.issB)) +
      stat('Возврат за час', fmt(r.retA + r.retB)) + stat('В сервисе', fmt(svcN) + ' ед.') +
      stat('Упущено прокатов', day.lost.n ? `${fmt(day.lost.n)} · ${kRub(day.lost.rev)}` : '0', day.lost.n ? 'bad' : '');
    const segs = [['Склад «Центр»', '#1db56c'], ['Склад «Восток»', '#00aeef'], ['На склонах', '#9bd36a'], ['Сервис', '#f0cd36']];
    $('#rentTable').innerHTML = S.RENTAL.map(c0 => {
      const c = R[c0.id], vals = [c.stock[0], c.stock[1], c.out, c.svc], tot = sum(vals) || 1;
      const st = c.stock[0] + c.stock[1], low = st / tot < 0.15;
      return `<div class="rt-row"><div class="rt-top"><b>${c.name}</b><span>${low ? '<em>мало · </em>' : ''}склад ${fmt(st)} · склоны ${fmt(c.out)} · сервис ${fmt(c.svc)}</span></div>
        <div class="stack" style="height:10px;margin:5px 0 0">${vals.map((v, i) => `<i style="width:${v / tot * 100}%;background:${segs[i][1]}"></i>`).join('')}</div></div>`;
    }).join('') + `<div class="rent-legend">${segs.map(s => `<span><i style="background:${s[1]}"></i>${s[0]}</span>`).join('')}</div>`;

    const kit = pt => R.ski.stock[pt] + R.board.stock[pt];
    const kitInit = pt => R.ski.init[pt] + R.board.init[pt];
    for (const [k, pt] of [['A', 0], ['B', 1]]) {
      const n = RF.nodes[k], fr = kit(pt) / kitInit(pt);
      n.t2.textContent = `${fmt(kit(pt))} компл. · ${pct(fr)}`;
      n.t2.style.fill = lvlColor(1 - fr, 0.7, 0.88);
      n.t3.textContent = `выдача ${fmt(pt ? r.issB : r.issA)}/ч · возврат ${fmt(pt ? r.retB : r.retA)}/ч`;
    }
    RF.nodes.SL.t2.textContent = `${fmt(out)} комплектов`;
    RF.nodes.SL.t3.textContent = `${fmt(day.renters)} гостей с прокатом`;
    RF.nodes.SV.t2.textContent = `${fmt(svcN)} единиц`;

    const sz = S.BOOT_SIZES.map((s, i) => ({ s, n: day.bootStock[0][i] + day.bootStock[1][i] })).sort((a, b) => a.n - b.n).slice(0, 6);
    $('#sizes').innerHTML = sz.map(x => `<span class="sz ${x.n <= 5 ? 'bad' : x.n <= 15 ? 'warn' : 'ok'}">${x.s} р. — ${x.n}</span>`).join(' ');
  }
  function tickParticles(dt) {
    if (speed > 0) {
      const r = flowRates();
      for (const k in RF.edges) {
        RF.acc[k] = (RF.acc[k] || 0) + Math.min(8, r[k] / 60 * speed / 60) * dt;
        while (RF.acc[k] >= 1) {
          RF.acc[k] -= 1;
          if (RF.parts.length > 90) continue;
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('r', 3); c.setAttribute('fill', RF.edges[k].c);
          RF.g.appendChild(c);
          RF.parts.push({ k, p: 0, el: c });
        }
      }
    }
    const mv = speed > 0 ? dt : 0;
    RF.parts = RF.parts.filter(p => {
      p.p += mv / 1.8;
      if (p.p >= 1) { p.el.remove(); return false; }
      const e = RF.edges[p.k], pt = e.path.getPointAtLength(p.p * e.len);
      p.el.setAttribute('cx', pt.x.toFixed(1)); p.el.setAttribute('cy', pt.y.toFixed(1));
      p.el.setAttribute('opacity', Math.min(1, (1 - p.p) * 4, p.p * 6).toFixed(2));
      return true;
    });
  }

  // ---------- Шкафчики ----------
  function buildRooms() {
    $('#rooms').innerHTML = S.LOCKER_ROOMS.map((r, ri) => `<div><div class="room-h"><b>${r.name}</b><span id="rs${ri}"></span></div>
      <div class="cells" id="cells${ri}" style="grid-template-columns:repeat(${r.cols},minmax(0,1fr))"></div></div>`).join('');
    cellEls = day.cells.map(c => { const i = document.createElement('i'); $('#cells' + c.room).appendChild(i); return i; });
  }
  function updateLockers() {
    const cnt = { free: 0, busy: 0, long: 0, broken: 0 }, room = S.LOCKER_ROOMS.map(() => ({ busy: 0, ok: 0 }));
    day.cells.forEach((c, k) => {
      const e = cellEls[k];
      let cls, title;
      const roomId = S.LOCKER_ROOMS[c.room].id;
      if (c.state === 3) { cls = 'c-broken'; cnt.broken++; title = 'неисправен — заявка в сервис'; }
      else {
        room[c.room].ok++;
        if (c.state === 1) {
          const mins = day.t - c.since, long = mins >= 300;
          cls = long ? 'c-long' : 'c-busy'; cnt[long ? 'long' : 'busy']++; room[c.room].busy++;
          title = `занят ${Math.floor(mins / 60)} ч ${mins % 60} мин`;
        } else { cls = 'c-free'; cnt.free++; title = 'свободен'; }
      }
      if (day.t - c.ch <= 1 && c.state !== 3) cls += ' flash';
      if (e._c !== cls) { e.className = cls; e._c = cls; }
      const tt = `${roomId}-${c.n}: ${title}`;
      if (e._t !== tt) { e.title = tt; e._t = tt; }
    });
    const ok = cnt.free + cnt.busy + cnt.long, busy = cnt.busy + cnt.long;
    $('#lockStats').innerHTML = stat('Занято', `${fmt(busy)} из ${fmt(ok)} · ${pct(busy / ok)}`, busy / ok >= 0.9 ? 'bad' : '') +
      stat('Свободно', fmt(cnt.free), 'good') + stat('Дольше 5 часов', fmt(cnt.long), cnt.long ? 'warn' : '') +
      stat('Неисправно', fmt(cnt.broken)) + stat('Выручка', kRub(day.biz.lockers)) +
      (day.lockerLost ? stat('Не хватило шкафчиков', fmt(day.lockerLost), 'bad') : '');
    room.forEach((r, ri) => { $('#rs' + ri).textContent = `${r.busy} / ${r.ok} · ${pct(r.busy / r.ok)}`; });
  }

  // ---------- Инфраструктура ----------
  const INF = ['parking', 'cafe', 'school'];
  $('#infra').innerHTML = INF.map(id => `<div class="inf" id="inf-${id}"><svg viewBox="0 0 66 66">
      <circle cx="33" cy="33" r="27" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="7"/>
      <circle class="arc" cx="33" cy="33" r="27" fill="none" stroke-width="7" stroke-linecap="round" transform="rotate(-90 33 33)"/>
      <text class="rv" x="33" y="38" text-anchor="middle"></text></svg>
      <div><div class="inf-t"></div><div class="inf-v"></div><div class="inf-s"></div></div></div>`).join('');
  function ring(id, fr, t, v, s) {
    const r = $('#inf-' + id), Cc = 2 * Math.PI * 27, f = Math.max(0, Math.min(1, fr));
    const arc = r.querySelector('.arc');
    arc.setAttribute('stroke-dasharray', `${(f * Cc).toFixed(1)} ${Cc.toFixed(1)}`);
    arc.setAttribute('stroke', lvlColor(f, 0.75, 0.92));
    r.querySelector('.rv').textContent = pct(f);
    r.querySelector('.inf-t').textContent = t;
    r.querySelector('.inf-v').innerHTML = v;
    r.querySelector('.inf-s').innerHTML = s;
  }
  function updateInfra() {
    ring('parking', day.cars / C.PARK_CAP, 'Парковка', `${fmt(day.cars)} из ${C.PARK_CAP} мест`,
      `въездов ${fmt(day.biz.parking / C.PARK_PRICE)} · ${kRub(day.biz.parking)}${day.parkLost ? ` · не хватило мест: ${fmt(day.parkLost)}` : ''}`);
    ring('cafe', day.cafeLoad, 'Кафе и рестораны', `${fmt(day.cafeLoad * C.CAFE_SEATS)} из ${C.CAFE_SEATS} мест`,
      `${fmt(day.cafeGuests)} чеков · ${kRub(day.biz.cafe)}`);
    ring('school', day.lessons.length / C.INSTRUCTORS, 'Школа инструкторов', `${day.lessons.length} из ${C.INSTRUCTORS} инструкторов на склоне`,
      `${fmt(day.lessonsCount)} занятий · ${kRub(day.biz.school)}${day.lessonsLost ? ` · отказов: ${day.lessonsLost}` : ''}`);
  }

  // ---------- Циклы обновления ----------
  function updateFast() {
    const st = stats();
    updateKPIs(st);
    updateLifts();
    updateSlopeChips();
    mapView.update(day);
    updateTurnstiles();
    updateRental();
    updateLockers();
    updateInfra();
  }
  function updateSlow() {
    const st = stats();
    updateHeader();
    drawRevenue(st);
    drawTariffs();
    drawBiz();
    drawHours();
    updateInsights(st);
    spark('rev', day.hist.rev);
    spark('sold', rolling(day.hist.sales, 15));
    spark('guests', day.hist.guests);
    spark('turn', rolling(day.hist.passes, 15));
    spark('wait', rolling(day.hist.wait, 5));
  }

  function start(id, until) {
    sid = id;
    day = new S.Day(id, (Math.random() * 1e9) | 0, { quiet: true });
    while (day.t < until) day.step();
    day.quiet = false; acc = 0;
    for (const k in tw) delete tw[k];
    feed.innerHTML = ''; insSig = '';
    if (!cellEls) buildRooms();
    updateFast(); updateSlow();
  }

  let clockStr = '';
  function updateClock() {
    const s = `${hhmm(day.t)}<small>:${String(Math.floor(acc * 60)).padStart(2, '0')}</small>`;
    if (s !== clockStr) { $('#clock').innerHTML = s; clockStr = s; }
  }

  let last = performance.now(), lastFast = 0, lastSlow = 0, lastFeed = 0;
  function frame(now) {
    // Модельное время идёт по реальным часам, анимация — с ограничением шага
    const real = Math.min(2, (now - last) / 1000), dt = Math.min(0.1, real);
    last = now;
    if (speed > 0) {
      acc += real * speed / 60;
      while (acc >= 1) {
        acc -= 1; day.step();
        if (day.t >= CLOSE) { start(sid, OPEN + 1); break; }
      }
    }
    if (!document.body.classList.contains('mode-3d-on')) mapView.animate(speed > 0 ? dt : 0);
    tickT(dt);
    tickParticles(dt);
    updateClock();
    if (now - lastFast > 350) { lastFast = now; updateFast(); }
    if (now - lastSlow > 1200) { lastSlow = now; updateSlow(); }
    if (speed > 0 && now - lastFeed > 420) { lastFeed = now; drainFeed(); }
    requestAnimationFrame(frame);
  }

  // ---------- Управление ----------
  $('#speed').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    speed = +b.dataset.speed;
    document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('on', x === b));
    document.body.classList.toggle('paused', speed === 0);
  });
  $('#scenario').addEventListener('change', e => start(e.target.value, Math.max(OPEN + 1, day.t)));
  $('#fs').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  });
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(updateSlow, 150); });

  // Лёгкий 3D-наклон KPI-карточек за курсором
  document.querySelectorAll('.kpi').forEach(k => {
    k.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = k.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      k.style.transform = `perspective(700px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg) translateZ(4px)`;
    });
    k.addEventListener('pointerleave', () => { k.style.transform = ''; });
  });

  // Общее состояние для 3D-карты (js/map3d.js)
  window.SKI_APP = { get day() { return day; }, get speed() { return speed; }, mapView };

  start('normal', 12 * 60 + 30);
  requestAnimationFrame(frame);
})();
