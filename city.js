(() => {
  "use strict";

  const KEY = "pixel-city-match-v1";
  const GCOLOR = {
    market: "#f2b8c6",
    gardens: "#8ec9bf",
    art: "#c3b0e6",
    port: "#e7c56d",
  };

  const setupEl = document.getElementById("city-setup");
  const formEl = document.getElementById("city-form");
  const playEl = document.getElementById("city-play");
  const boardEl = document.getElementById("city-board");
  const playersEl = document.getElementById("city-players");
  const actionsEl = document.getElementById("city-actions");
  const statusEl = document.getElementById("city-status");
  const logEl = document.getElementById("city-log");
  const errorEl = document.getElementById("city-error");
  const formErrorEl = document.getElementById("city-form-error");
  const coverEl = document.getElementById("city-cover");
  const coverNameEl = document.getElementById("city-cover-name");
  const resumeBox = document.getElementById("city-resume");
  const seatsEl = document.getElementById("city-seats");
  const teamBox = document.getElementById("city-team-box");

  const FFA_SEATS = [
    { name: "أنت", bot: false },
    { name: "خصم", bot: true },
    { name: "ليان", bot: false },
    { name: "خصم ٢", bot: true },
  ];
  const TEAM_SEATS = [
    { name: "أنت", bot: false },
    { name: "ليان", bot: false },
    { name: "خصم", bot: true },
    { name: "خصم ٢", bot: true },
  ];

  function cloneSeats(list) {
    return list.map((seat) => ({ name: seat.name, bot: seat.bot }));
  }

  function sameSeats(list) {
    return draft.seats.length === list.length && draft.seats.every((seat, i) => seat.name === list[i].name && !!seat.bot === !!list[i].bot);
  }

  const draft = {
    size: 2,
    teams: false,
    seats: cloneSeats(FFA_SEATS),
  };

  let state = null;
  let busy = false;
  let botTimer = 0;
  let acked = null;
  let tradeOpen = false;
  let tradeTo = null;
  let giveSet = [];
  let takeSet = [];
  let giveCash = 0;
  let takeCash = 0;
  let giveFreedom = 0;
  let takeFreedom = 0;
  let bidValue = 10;
  let auctionCell = null;
  let visual = null;
  let shownDice = null;
  let diceRolling = false;
  let motionTimer = 0;
  const SOUND_KEY = "pixel-city-sound";
  let soundOn = true;
  let audioCtx = null;
  try { soundOn = localStorage.getItem(SOUND_KEY) !== "0"; } catch (_) {}

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1 || !data.participants) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function elapsedPlayMs() {
    if (!state) return 0;
    const running = state.activeSince ? Math.max(0, Date.now() - state.activeSince) : 0;
    return (state.playedMs || 0) + running;
  }

  function freezePlayTime() {
    if (!state || state.activeSince == null) return;
    state.playedMs = elapsedPlayMs();
    state.activeSince = null;
  }

  function resumePlayTime() {
    if (!state || state.phase === "end" || document.hidden) return;
    if (state.activeSince == null) state.activeSince = Date.now();
  }

  function save() {
    if (!state) return;
    freezePlayTime();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
    resumePlayTime();
  }

  function clearSaved() {
    try { localStorage.removeItem(KEY); } catch (_) {}
  }

  function syncStats() {
    if (!state || !window.PlayData) return;
    state.statsSent = state.statsSent || { set: false, hotel: false, match: false };
    if (state.humanSet && !state.statsSent.set && PlayData.recordCityMilestone) {
      PlayData.recordCityMilestone("set");
      state.statsSent.set = true;
    }
    if (state.humanHotel && !state.statsSent.hotel && PlayData.recordCityMilestone) {
      PlayData.recordCityMilestone("hotel");
      state.statsSent.hotel = true;
    }
    if (state.phase === "end" && !state.statsSent.match && PlayData.recordCityMatch) {
      const humanWon = (state.winners || []).some((id) => state.participants[id] && !state.participants[id].bot);
      PlayData.recordCityMatch({
        timeSec: Math.max(0, Math.round(elapsedPlayMs() / 1000)),
        humanWon,
        teamGame: !!state.teams,
      });
      state.statsSent.match = true;
    }
  }

  function cellPos(i) {
    if (i <= 5) return { col: 6 - i, row: 6 };
    if (i <= 10) return { col: 1, row: 6 - (i - 5) };
    if (i <= 15) return { col: 1 + (i - 10), row: 1 };
    return { col: 6, row: 1 + (i - 15) };
  }

  function tokenPos(p) {
    if (visual && visual.id === p.id) return visual.pos;
    return p.position;
  }

  function coverKey(s) {
    if (!s || s.phase === "end") return null;
    const humans = s.participants.filter((p) => p.alive && !p.bot).length;
    if (humans < 2) return null;
    const id = CityRules.actorId(s);
    const actor = s.participants[id];
    if (!actor || actor.bot) return null;
    if (s.phase === "rolloff") return "off:" + id;
    if (s.phase === "roll" || s.phase === "jail_choice") return "turn:" + s.round + ":" + s.current;
    if (s.phase === "trade_response" && s.trade) return "trade:" + s.log.length + ":" + id;
    if (s.phase === "auction" && s.auction) return "auction:" + s.auction.cell + ":" + id + ":" + (s.auction.step || 0);
    return null;
  }

  function renderSeats() {
    seatsEl.innerHTML = draft.seats.slice(0, draft.size).map((seat, i) => `
      <label class="city-seat">
        <span class="city-swatch" style="background:${CityRules.COLORS[draft.teams ? (i < 2 ? 0 : 1) : i].hex}"></span>
        <input data-name="${i}" maxlength="12" value="${esc(seat.name)}" aria-label="اسم المقعد ${i + 1}" />
        <button type="button" class="xo-chip ${seat.bot ? "" : "on"}" data-human="${i}">${seat.bot ? "آلي" : "إنسان"}</button>
      </label>`).join("");
    teamBox.hidden = draft.size !== 4;
    const hint = document.getElementById("city-team-hint");
    if (hint) hint.hidden = !draft.teams;
  }

  function audio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, when, dur, type, gain) {
    const ctx = audio();
    if (!ctx || !soundOn) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, when);
    amp.gain.setValueAtTime(Math.max(gain, 0.001), when);
    amp.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function noise(dur, peak) {
    const ctx = audio();
    if (!ctx || !soundOn) return;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1100;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(peak, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    src.start();
  }

  function buzz(pattern) {
    if (!soundOn || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (_) {}
  }

  function playSound(kind) {
    const ctx = audio();
    if (!ctx || !soundOn) return;
    const t = ctx.currentTime;
    if (kind === "roll") {
      noise(0.24, 0.07);
      tone(190, t, 0.05, "triangle", 0.04);
      tone(250, t + 0.09, 0.05, "triangle", 0.035);
      buzz(14);
      return;
    }
    if (kind === "tick") {
      tone(180 + Math.random() * 90, t, 0.03, "triangle", 0.02);
      return;
    }
    if (kind === "land") {
      tone(210, t, 0.07, "sine", 0.05);
      tone(150, t + 0.06, 0.09, "triangle", 0.04);
      buzz(10);
      return;
    }
    if (kind === "double") {
      tone(523, t, 0.08, "sine", 0.05);
      tone(784, t + 0.08, 0.12, "sine", 0.05);
      buzz([8, 30, 12]);
      return;
    }
    if (kind === "step") {
      tone(260 + Math.random() * 40, t, 0.045, "triangle", 0.03);
      return;
    }
    if (kind === "salary") {
      [523, 659, 784].forEach((freq, i) => tone(freq, t + i * 0.06, 0.1, "sine", 0.045));
      return;
    }
    if (kind === "jail") {
      tone(130, t, 0.16, "square", 0.03);
      tone(90, t + 0.1, 0.2, "triangle", 0.04);
      buzz(30);
      return;
    }
    if (kind === "buy") {
      tone(880, t, 0.06, "sine", 0.04);
      tone(1175, t + 0.07, 0.1, "sine", 0.04);
      return;
    }
    if (kind === "bid") {
      tone(640, t, 0.05, "sine", 0.035);
      return;
    }
    if (kind === "build") {
      tone(392, t, 0.07, "triangle", 0.04);
      tone(523, t + 0.08, 0.1, "triangle", 0.04);
      return;
    }
    if (kind === "sell") {
      tone(392, t, 0.08, "triangle", 0.035);
      tone(262, t + 0.08, 0.1, "triangle", 0.035);
      return;
    }
    if (kind === "pass") {
      tone(300, t, 0.06, "triangle", 0.03);
      return;
    }
    if (kind === "win") {
      [523, 659, 784, 1046].forEach((freq, i) => tone(freq, t + i * 0.09, 0.16, "sine", 0.05));
      buzz([12, 40, 16]);
      return;
    }
    if (kind === "error") tone(196, t, 0.12, "sawtooth", 0.02);
  }

  function paintSound() {
    const btn = document.getElementById("city-sound");
    if (!btn) return;
    btn.textContent = soundOn ? "صوت" : "صامت";
    btn.setAttribute("aria-pressed", soundOn ? "true" : "false");
  }

  function calmMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function haltMotion() {
    window.clearTimeout(motionTimer);
    motionTimer = 0;
    diceRolling = false;
    shownDice = null;
  }

  function faceDie(n, rolling, doubled) {
    const pips = "<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>";
    const cls = (rolling ? " is-rolling" : "") + (doubled ? " is-double" : "");
    const label = n ? "نرد " + n : "نرد";
    return `<span class="die${cls}" data-face="${n}" role="img" aria-label="${label}">${pips}</span>`;
  }

  function cueAction(action) {
    const map = {
      BUY: "buy",
      BID: "bid",
      BUILD: "build",
      SELL: "sell",
      MORTGAGE: "sell",
      UNMORTGAGE: "buy",
      PASS: "pass",
      DECLINE: "pass",
      JAIL_PAY: "buy",
      JAIL_CARD: "buy",
      ACCEPT_TRADE: "buy",
      REJECT_TRADE: "pass",
      ADMIT: "jail",
      PAY_DEBT: "buy",
    };
    if (map[action.type]) playSound(map[action.type]);
  }

  function renderBoard() {
    const cells = CityRules.BOARD.map((cell) => {
      const pos = cellPos(cell.i);
      const prop = state.props[cell.i];
      const owner = prop.owner != null ? state.participants[prop.owner] : null;
      const tint = cell.group ? GCOLOR[cell.group] : "#fff";
      let sub = "";
      if (cell.kind === "street") {
        if (prop.owner == null) sub = String(cell.price);
        else sub = String(CityRules.rentOf(state, cell.i));
      } else if (cell.kind === "tax") sub = "−" + cell.amount;
      else if (cell.kind === "chest" || cell.kind === "start") sub = "+" + (cell.amount || 100);
      const mark = prop.level === 2 ? "فندق" : prop.level === 1 ? "بيت" : "";
      const hot = visual && visual.hop && visual.pos === cell.i;
      const flags = [
        prop.mortgaged ? "is-mort" : "",
        owner ? "is-owned" : "",
        hot ? "is-hot" : "",
        hot && cell.i === 0 ? "is-pay" : "",
        hot && visual.jail ? "is-jail" : "",
      ].filter(Boolean).join(" ");
      return `<div class="city-cell ${flags}" data-i="${cell.i}" style="grid-column:${pos.col};grid-row:${pos.row};background:${tint};--owner:${owner ? owner.color : "transparent"}" title="${esc(cell.name)}">
        <b>${esc(cell.short)}</b>
        <small>${esc(sub)}</small>
        ${mark ? `<em>${mark}</em>` : ""}
      </div>`;
    }).join("");
    const faces = shownDice || state.lastDice;
    const doubled = !!(faces && faces[0] === faces[1] && !diceRolling);
    const dice = faces
      ? faceDie(faces[0], diceRolling, doubled) + faceDie(faces[1], diceRolling, doubled)
      : faceDie(0, false, false) + faceDie(0, false, false);
    const note = faces && !diceRolling ? String(faces[0] + faces[1]) + (doubled ? " · زوج" : "") : "";
    const diceLabel = faces && !diceRolling ? ` aria-label="النرد ${faces[0]} و${faces[1]}"` : ` aria-hidden="true"`;
    boardEl.innerHTML = cells + `<div class="city-center"><p>الدوران ${state.round} / ٤٠</p><div class="city-dice"${diceLabel}>${dice}</div><p class="city-roll-note">${esc(note)}</p><small>بيوت ${state.bankHouses} · فنادق ${state.bankHotels}</small></div>`;
    syncMovers(true);
  }

  function cellCenter(i) {
    const cell = boardEl.querySelector('[data-i="' + i + '"]');
    if (!cell) return null;
    const board = boardEl.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    return {
      x: rect.left - board.left + rect.width / 2,
      y: rect.top - board.top + rect.height / 2,
    };
  }

  function syncMovers(instant) {
    if (!state) return;
    let layer = boardEl.querySelector(".city-movers");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "city-movers";
      boardEl.appendChild(layer);
    }
    const groups = {};
    state.participants.forEach((p) => {
      if (!p.alive) return;
      const pos = tokenPos(p);
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    });
    state.participants.forEach((p) => {
      let el = layer.querySelector('[data-token="' + p.id + '"]');
      if (!p.alive) {
        if (el) el.remove();
        return;
      }
      if (!el) {
        el = document.createElement("i");
        el.className = "city-mover is-instant";
        el.dataset.token = String(p.id);
        el.title = p.name;
        layer.appendChild(el);
      }
      el.style.background = p.color;
      const mates = groups[tokenPos(p)] || [p];
      const n = mates.indexOf(p);
      const center = cellCenter(tokenPos(p));
      if (!center) return;
      if (instant) el.classList.add("is-instant");
      el.style.left = (center.x - 7 + (n - (mates.length - 1) / 2) * 12) + "px";
      el.style.top = (center.y - 18) + "px";
      if (instant) {
        void el.offsetWidth;
        el.classList.remove("is-instant");
      } else if (visual && visual.hop && visual.id === p.id && !calmMotion()) {
        el.classList.remove("is-hop");
        void el.offsetWidth;
        el.classList.add("is-hop");
      }
    });
  }

  function markLanding(cellIndex, jailed) {
    boardEl.querySelectorAll(".city-cell.is-hot, .city-cell.is-pay, .city-cell.is-jail").forEach((el) => {
      el.classList.remove("is-hot", "is-pay", "is-jail");
    });
    const cell = boardEl.querySelector('[data-i="' + cellIndex + '"]');
    if (!cell) return;
    cell.classList.add("is-hot");
    if (cellIndex === 0) cell.classList.add("is-pay");
    if (jailed) cell.classList.add("is-jail");
  }

  function paintDice() {
    const faces = shownDice || state.lastDice;
    const box = boardEl.querySelector(".city-dice");
    const note = boardEl.querySelector(".city-roll-note");
    if (!box || !faces) return;
    const doubled = faces[0] === faces[1] && !diceRolling;
    box.querySelectorAll(".die").forEach((die, i) => {
      die.dataset.face = String(faces[i]);
      die.setAttribute("aria-label", "نرد " + faces[i]);
      die.classList.toggle("is-double", doubled);
      die.classList.remove("is-rolling");
      if (diceRolling) {
        void die.offsetWidth;
        die.classList.add("is-rolling");
      }
    });
    if (note) note.textContent = diceRolling ? "" : String(faces[0] + faces[1]) + (doubled ? " · زوج" : "");
    if (diceRolling) box.setAttribute("aria-hidden", "true");
    else {
      box.removeAttribute("aria-hidden");
      box.setAttribute("aria-label", "النرد " + faces[0] + " و" + faces[1]);
    }
  }

  function renderPlayers() {
    const actor = CityRules.actorId(state);
    playersEl.innerHTML = state.participants.map((p) => {
      const worth = CityRules.netWorth(state, p.id);
      const tags = [];
      if (!p.alive) tags.push("خارج");
      else if (p.jailed) tags.push("حبس " + p.jailTurns);
      if (p.freedom) tags.push("حرية " + p.freedom);
      if (p.bot) tags.push("آلي");
      return `<article class="city-side ${p.id === state.current ? "is-current" : ""} ${p.alive ? "" : "is-out"} ${p.id === actor ? "is-actor" : ""}">
        <i style="background:${p.color}"></i>
        <div>
          <strong>${esc(p.name)}</strong>
          <small>${p.alive ? esc(String(p.cash)) + " · قيمة " + worth : "خرج"} ${tags.length ? "· " + tags.join(" · ") : ""}</small>
        </div>
      </article>`;
    }).join("");
  }

  function renderLog() {
    const lines = state.log.slice(-8).reverse();
    logEl.innerHTML = lines.map((line) => `<li>${esc(line)}</li>`).join("");
  }

  function renderActions() {
    if (busy) {
      coverEl.hidden = true;
      actionsEl.innerHTML = "";
      return;
    }
    const key = coverKey(state);
    if (key && key !== acked) {
      const actor = state.participants[CityRules.actorId(state)];
      coverNameEl.textContent = actor.name;
      coverEl.hidden = false;
      actionsEl.innerHTML = "";
      return;
    }
    coverEl.hidden = true;
    const actorNow = state.participants[CityRules.actorId(state)];
    if (state.phase !== "end" && actorNow && actorNow.bot) {
      actionsEl.innerHTML = `<p class="city-offer">${esc(actorNow.name)} يلعب…</p>`;
      return;
    }
    if (state.phase === "end") {
      const names = (state.winners || []).map((id) => state.participants[id].name).join(" و");
      const rows = state.participants.filter((p) => p.alive).map((p) =>
        `<li><b>${esc(p.name)}</b> · قيمة ${CityRules.netWorth(state, p.id)} · مال ${p.cash}</li>`
      ).join("");
      actionsEl.innerHTML = `<div class="city-end"><h2>${state.winners && state.winners.length > 1 ? "فوز مشترك" : "انتهت المدينة"}</h2><p>${esc(names)}</p><ul>${rows}</ul><button type="button" class="city-start" data-act="NEW">طاولة جديدة</button></div>`;
      return;
    }
    if (tradeOpen && (state.phase === "manage" || state.phase === "debt")) {
      renderTrade();
      return;
    }
    tradeOpen = false;
    const opts = CityRules.options(state);
    if (state.phase === "auction" && state.auction) {
      if (auctionCell !== state.auction.cell) {
        auctionCell = state.auction.cell;
        bidValue = 10;
      }
      const bidOpt = opts.find((o) => o.type === "BID");
      const cell = CityRules.BOARD[state.auction.cell];
      const min = bidOpt ? bidOpt.min : 10;
      const max = bidOpt ? bidOpt.max : 0;
      if (bidValue < min) bidValue = min;
      if (max >= min && bidValue > max) bidValue = max;
      const canBid = max >= min;
      actionsEl.innerHTML = `<div class="city-auction"><p>مزايدة ${esc(cell.name)} · أعلى عرض ${state.auction.bid || 0}</p>
        <div class="city-stepper">
          <button type="button" data-act="BID_DEC" ${canBid && bidValue > min ? "" : "disabled"}>−</button>
          <strong>${canBid ? bidValue : "—"}</strong>
          <button type="button" data-act="BID_INC" ${canBid && bidValue + 10 <= max ? "" : "disabled"}>＋</button>
        </div>
        <div class="xo-chips">
          <button type="button" class="xo-chip on" data-act="BID" ${canBid ? "" : "disabled"}>زايد بـ ${canBid ? bidValue : ""}</button>
          <button type="button" class="xo-chip" data-act="PASS">انسحب</button>
        </div></div>`;
      return;
    }
    if (state.phase === "trade_response" && state.trade) {
      actionsEl.innerHTML = `<p class="city-offer">${esc(CityRules.tradeText(state))}</p>` + opts.map(buttonFor).join("");
      return;
    }
    actionsEl.innerHTML = opts.map(buttonFor).join("");
  }

  function buttonFor(opt) {
    const cell = opt.cell != null ? ` data-cell="${opt.cell}"` : "";
    return `<button type="button" class="xo-chip ${opt.type === "ROLL" || opt.type === "ROLL_OFF" || opt.type === "BUY" || opt.type === "END_TURN" ? "on" : ""}" data-act="${opt.type}"${cell}>${esc(opt.label)}</button>`;
  }

  function renderTrade() {
    const me = state.participants[state.current];
    const rivals = state.participants.filter((p) => p.alive && p.id !== me.id);
    if (!rivals.length) { tradeOpen = false; return; }
    if (tradeTo == null || !rivals.some((p) => p.id === tradeTo)) tradeTo = rivals[0].id;
    const other = state.participants[tradeTo];
    const mine = streetsOf(me.id);
    const theirs = streetsOf(other.id);
    actionsEl.innerHTML = `<form class="city-trade" id="city-trade-form">
      <p>مقايضة مع</p>
      <div class="xo-chips">${rivals.map((p) => `<button type="button" class="xo-chip ${p.id === tradeTo ? "on" : ""}" data-act="TRADE_TO" data-cell="${p.id}">${esc(p.name)}</button>`).join("")}</div>
      <p>تعطي</p>
      <div class="xo-chips">${mine.map(streetButton("GIVE")).join("") || "<small>لا شارع حر</small>"}</div>
      <label>مال تعطيه <input id="trade-give-cash" type="number" min="0" step="10" value="${giveCash}" /></label>
      <label>حرية تعطيها <input id="trade-give-free" type="number" min="0" max="${me.freedom}" step="1" value="${Math.min(giveFreedom, me.freedom)}" ${me.freedom ? "" : "disabled"} /></label>
      <p>تأخذ</p>
      <div class="xo-chips">${theirs.map(streetButton("TAKE")).join("") || "<small>لا شارع حر</small>"}</div>
      <label>مال تأخذه <input id="trade-take-cash" type="number" min="0" step="10" value="${takeCash}" /></label>
      <label>حرية تأخذها <input id="trade-take-free" type="number" min="0" max="${other.freedom}" step="1" value="${Math.min(takeFreedom, other.freedom)}" ${other.freedom ? "" : "disabled"} /></label>
      <div class="xo-chips">
        <button type="submit" class="xo-chip on">أرسل العرض</button>
        <button type="button" class="xo-chip" data-act="TRADE_CLOSE">رجوع</button>
      </div>
    </form>`;
    const form = document.getElementById("city-trade-form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      apply({
        type: "OFFER_TRADE",
        to: tradeTo,
        giveCash: snap10(document.getElementById("trade-give-cash").value),
        takeCash: snap10(document.getElementById("trade-take-cash").value),
        giveFreedom: countOf(document.getElementById("trade-give-free").value, me.freedom),
        takeFreedom: countOf(document.getElementById("trade-take-free").value, other.freedom),
        giveProps: giveSet.slice(),
        takeProps: takeSet.slice(),
      });
    });
  }

  function streetsOf(pid) {
    return CityRules.BOARD.filter((cell) => {
      if (cell.kind !== "street" || state.props[cell.i].owner !== pid) return false;
      const ids = CityRules.GROUPS[cell.group];
      return ids.every((i) => state.props[i].level === 0);
    });
  }

  function streetButton(kind) {
    return (cell) => {
      const on = (kind === "GIVE" ? giveSet : takeSet).indexOf(cell.i) !== -1;
      return `<button type="button" class="xo-chip ${on ? "on" : ""}" data-act="${kind}" data-cell="${cell.i}">${esc(cell.short)}</button>`;
    };
  }

  function snap10(value) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    return n - (n % 10);
  }

  function countOf(value, max) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    return Math.min(n, max == null ? n : max);
  }

  function render() {
    if (!state) return;
    renderBoard();
    renderPlayers();
    renderLog();
    statusEl.textContent = CityRules.statusLine(state);
    renderActions();
  }

  function showPlay() {
    setupEl.hidden = true;
    playEl.hidden = false;
  }

  function showSetup() {
    playEl.hidden = true;
    setupEl.hidden = false;
    const saved = loadSaved();
    resumeBox.hidden = !saved;
    renderSeats();
  }

  function apply(action) {
    if (busy || !state) return;
    window.clearTimeout(botTimer);
    const res = CityRules.dispatch(state, action);
    if (!res.ok) {
      errorEl.textContent = CityRules.errorText(res.error);
      playSound("error");
      return;
    }
    errorEl.textContent = "";
    const fx = res.state.fx;
    res.state.fx = null;
    state = res.state;
    if (action.type === "OFFER_TRADE") {
      tradeOpen = false;
      giveSet = [];
      takeSet = [];
      giveCash = 0;
      takeCash = 0;
      giveFreedom = 0;
      takeFreedom = 0;
    }
    syncStats();
    save();
    const rolled = action.type === "ROLL" || action.type === "ROLL_OFF" || action.type === "JAIL_ROLL";
    if (rolled && state.lastDice) {
      busy = true;
      shownDice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      diceRolling = true;
      visual = fx && fx.who != null ? { id: fx.who, pos: fx.from } : null;
      render();
      tumbleDice(fx);
      return;
    }
    if (fx && fx.path && fx.path.length && fx.who != null) {
      busy = true;
      visual = { id: fx.who, pos: fx.from };
      render();
      stepFx(fx, 0);
      return;
    }
    visual = null;
    cueAction(action);
    if (state.phase === "end") playSound("win");
    render();
    queueBot();
  }

  function tumbleDice(fx) {
    const finalDice = state.lastDice.slice();
    const spins = calmMotion() ? 2 : 7;
    let tick = 0;
    const spin = () => {
      if (!state) return;
      tick += 1;
      if (tick < spins) {
        shownDice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
        diceRolling = true;
        playSound(tick === 1 ? "roll" : "tick");
        paintDice();
        motionTimer = window.setTimeout(spin, calmMotion() ? 30 : 70);
        return;
      }
      shownDice = null;
      diceRolling = false;
      playSound(finalDice[0] === finalDice[1] ? "double" : "land");
      paintDice();
      if (fx && fx.path && fx.path.length && fx.who != null) {
        motionTimer = window.setTimeout(() => stepFx(fx, 0), calmMotion() ? 30 : 110);
        return;
      }
      busy = false;
      if (state.phase === "end") playSound("win");
      render();
      queueBot();
    };
    spin();
  }

  function stepFx(fx, index) {
    if (!state) return;
    if (index >= fx.path.length) {
      busy = false;
      visual = null;
      if (state.phase === "end") playSound("win");
      render();
      queueBot();
      return;
    }
    const cell = fx.path[index];
    const jailed = !!(fx.jail && index === fx.path.length - 1);
    visual = { id: fx.who, pos: cell, hop: !calmMotion(), jail: jailed };
    markLanding(cell, jailed);
    syncMovers(false);
    if (jailed) playSound("jail");
    else if (cell === 0) playSound("salary");
    else playSound("step");
    const gap = calmMotion() ? 36 : jailed ? 240 : 210;
    motionTimer = window.setTimeout(() => stepFx(fx, index + 1), gap);
  }

  function queueBot() {
    if (busy || !state || state.phase === "end") return;
    if (coverKey(state) && coverKey(state) !== acked) return;
    const id = CityRules.actorId(state);
    const actor = state.participants[id];
    if (!actor || !actor.bot) return;
    const action = CityRules.suggestBotAction(state);
    if (!action) return;
    const rolling = action.type === "ROLL" || action.type === "ROLL_OFF" || action.type === "JAIL_ROLL";
    busy = true;
    botTimer = window.setTimeout(() => {
      busy = false;
      apply(action);
    }, calmMotion() ? 30 : rolling ? 200 : 120);
  }

  function begin(next) {
    state = next;
    acked = null;
    tradeOpen = false;
    giveSet = [];
    takeSet = [];
    giveCash = 0;
    takeCash = 0;
    giveFreedom = 0;
    takeFreedom = 0;
    auctionCell = null;
    bidValue = 10;
    visual = null;
    errorEl.textContent = "";
    state.playedMs = state.playedMs || 0;
    state.activeSince = null;
    if (state.phase !== "end" && !document.hidden) state.activeSince = Date.now();
    syncStats();
    save();
    showPlay();
    render();
    queueBot();
  }

  document.getElementById("city-size").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-size]");
    if (!btn) return;
    draft.size = Number(btn.dataset.size);
    document.querySelectorAll("#city-size .xo-chip").forEach((el) => el.classList.toggle("on", el === btn));
    if (draft.size !== 4) {
      draft.teams = false;
      if (sameSeats(TEAM_SEATS)) draft.seats = cloneSeats(FFA_SEATS);
    }
    renderSeats();
    document.getElementById("city-ffa").classList.toggle("on", !draft.teams);
    document.getElementById("city-teams").classList.toggle("on", draft.teams);
  });

  teamBox.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-teams]");
    if (!btn) return;
    const nextTeams = btn.dataset.teams === "1";
    if (nextTeams && !draft.teams && sameSeats(FFA_SEATS)) draft.seats = cloneSeats(TEAM_SEATS);
    if (!nextTeams && draft.teams && sameSeats(TEAM_SEATS)) draft.seats = cloneSeats(FFA_SEATS);
    draft.teams = nextTeams;
    document.getElementById("city-ffa").classList.toggle("on", !draft.teams);
    document.getElementById("city-teams").classList.toggle("on", draft.teams);
    renderSeats();
  });

  seatsEl.addEventListener("input", (e) => {
    const input = e.target.closest("[data-name]");
    if (!input) return;
    draft.seats[Number(input.dataset.name)].name = input.value;
  });

  seatsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-human]");
    if (!btn) return;
    const i = Number(btn.dataset.human);
    draft.seats[i].bot = !draft.seats[i].bot;
    renderSeats();
  });

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const made = CityRules.createMatch({
      size: draft.size,
      teams: draft.teams,
      seats: draft.seats.slice(0, draft.size),
    });
    if (!made.ok) {
      formErrorEl.textContent = CityRules.errorText(made.error);
      return;
    }
    formErrorEl.textContent = "";
    begin(made.state);
  });

  document.getElementById("city-resume-btn").addEventListener("click", () => {
    const saved = loadSaved();
    if (saved) begin(saved);
  });

  document.getElementById("city-discard-btn").addEventListener("click", () => {
    clearSaved();
    resumeBox.hidden = true;
  });

  document.getElementById("city-ready").addEventListener("click", () => {
    acked = coverKey(state);
    render();
    queueBot();
  });

  document.getElementById("city-quit").addEventListener("click", () => {
    if (state && state.phase !== "end" && !window.confirm("إنهاء المباراة الحالية؟")) return;
    window.clearTimeout(botTimer);
    haltMotion();
    busy = false;
    state = null;
    clearSaved();
    showSetup();
  });

  actionsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || busy || btn.disabled) return;
    const giveBox = document.getElementById("trade-give-cash");
    const takeBox = document.getElementById("trade-take-cash");
    const giveFree = document.getElementById("trade-give-free");
    const takeFree = document.getElementById("trade-take-free");
    if (giveBox) giveCash = snap10(giveBox.value);
    if (takeBox) takeCash = snap10(takeBox.value);
    if (giveFree) giveFreedom = countOf(giveFree.value, Number(giveFree.max));
    if (takeFree) takeFreedom = countOf(takeFree.value, Number(takeFree.max));
    const type = btn.dataset.act;
    if (type === "NEW") {
      window.clearTimeout(botTimer);
      haltMotion();
      state = null;
      clearSaved();
      showSetup();
      return;
    }
    if (type === "TRADE_UI") {
      tradeOpen = true;
      tradeTo = null;
      giveSet = [];
      takeSet = [];
      renderActions();
      return;
    }
    if (type === "TRADE_CLOSE") {
      tradeOpen = false;
      renderActions();
      return;
    }
    if (type === "TRADE_TO") {
      tradeTo = Number(btn.dataset.cell);
      giveSet = [];
      takeSet = [];
      takeFreedom = 0;
      renderActions();
      return;
    }
    if (type === "GIVE" || type === "TAKE") {
      const cell = Number(btn.dataset.cell);
      const bag = type === "GIVE" ? giveSet : takeSet;
      const at = bag.indexOf(cell);
      if (at === -1) bag.push(cell);
      else bag.splice(at, 1);
      renderActions();
      return;
    }
    if (type === "BID_INC" || type === "BID_DEC") {
      bidValue += type === "BID_INC" ? 10 : -10;
      renderActions();
      return;
    }
    const action = { type };
    if (btn.dataset.cell != null && btn.dataset.cell !== "") action.cell = Number(btn.dataset.cell);
    if (type === "BID") action.amount = bidValue;
    apply(action);
  });

  document.getElementById("city-sound").addEventListener("click", () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0"); } catch (_) {}
    paintSound();
    if (soundOn) playSound("land");
  });

  document.addEventListener("keydown", (e) => {
    if (!state || busy || coverEl && !coverEl.hidden) return;
    if (e.key !== " " && e.key !== "Enter") return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (state.phase === "roll") { e.preventDefault(); apply({ type: "ROLL" }); }
    if (state.phase === "rolloff") { e.preventDefault(); apply({ type: "ROLL_OFF" }); }
  });

  document.addEventListener("visibilitychange", () => {
    if (!state) return;
    if (document.hidden) save();
    else resumePlayTime();
  });

  window.addEventListener("resize", () => {
    if (state) syncMovers(true);
  });

  paintSound();
  renderSeats();
  const existing = loadSaved();
  if (existing) resumeBox.hidden = false;
})();
