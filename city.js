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

  const draft = {
    size: 2,
    teams: false,
    seats: [
      { name: "أنت", bot: false },
      { name: "خصم", bot: true },
      { name: "ليان", bot: false },
      { name: "خصم ٢", bot: true },
    ],
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
  let bidValue = 10;
  let auctionCell = null;
  let visual = null;

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

  function save() {
    if (!state) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
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
        timeSec: Math.max(0, Math.round((Date.now() - (state.startedAt || Date.now())) / 1000)),
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
  }

  function renderBoard() {
    const cells = CityRules.BOARD.map((cell) => {
      const pos = cellPos(cell.i);
      const prop = state.props[cell.i];
      const owner = prop.owner != null ? state.participants[prop.owner] : null;
      const here = state.participants.filter((p) => p.alive && tokenPos(p) === cell.i);
      const tint = cell.group ? GCOLOR[cell.group] : "#fff";
      let sub = "";
      if (cell.kind === "street") {
        if (prop.owner == null) sub = String(cell.price);
        else sub = String(CityRules.rentOf(state, cell.i));
      } else if (cell.kind === "tax") sub = "−" + cell.amount;
      else if (cell.kind === "chest" || cell.kind === "start") sub = "+" + (cell.amount || 100);
      const mark = prop.level === 2 ? "فندق" : prop.level === 1 ? "بيت" : "";
      const tokens = here.map((p, n) =>
        `<i class="city-token" style="background:${p.color};inset-inline-start:${2 + n * 12}px" title="${esc(p.name)}"></i>`
      ).join("");
      return `<div class="city-cell ${prop.mortgaged ? "is-mort" : ""} ${owner ? "is-owned" : ""}" style="grid-column:${pos.col};grid-row:${pos.row};background:${tint};--owner:${owner ? owner.color : "transparent"}" title="${esc(cell.name)}">
        ${tokens}
        <b>${esc(cell.short)}</b>
        <small>${esc(sub)}</small>
        ${mark ? `<em>${mark}</em>` : ""}
      </div>`;
    }).join("");
    const dice = state.lastDice
      ? `<span class="die">${state.lastDice[0]}</span><span class="die">${state.lastDice[1]}</span>`
      : `<span class="die">·</span><span class="die">·</span>`;
    boardEl.innerHTML = cells + `<div class="city-center"><p>الدوران ${state.round} / ٤٠</p><div class="city-dice" aria-hidden="true">${dice}</div><small>بيوت ${state.bankHouses} · فنادق ${state.bankHotels}</small></div>`;
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
      <p>تأخذ</p>
      <div class="xo-chips">${theirs.map(streetButton("TAKE")).join("") || "<small>لا شارع حر</small>"}</div>
      <label>مال تأخذه <input id="trade-take-cash" type="number" min="0" step="10" value="${takeCash}" /></label>
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
    }
    syncStats();
    save();
    if (fx && fx.path && fx.path.length && fx.who != null) {
      busy = true;
      visual = { id: fx.who, pos: fx.from };
      render();
      stepFx(fx, 0);
      return;
    }
    visual = null;
    render();
    queueBot();
  }

  function stepFx(fx, index) {
    if (index >= fx.path.length) {
      busy = false;
      visual = null;
      render();
      queueBot();
      return;
    }
    visual = { id: fx.who, pos: fx.path[index] };
    render();
    window.setTimeout(() => stepFx(fx, index + 1), 80);
  }

  function queueBot() {
    if (busy || !state || state.phase === "end") return;
    if (coverKey(state) && coverKey(state) !== acked) return;
    const id = CityRules.actorId(state);
    const actor = state.participants[id];
    if (!actor || !actor.bot) return;
    const action = CityRules.suggestBotAction(state);
    if (!action) return;
    busy = true;
    botTimer = window.setTimeout(() => {
      busy = false;
      apply(action);
    }, 420);
  }

  function begin(next) {
    state = next;
    acked = null;
    tradeOpen = false;
    giveSet = [];
    takeSet = [];
    giveCash = 0;
    takeCash = 0;
    auctionCell = null;
    bidValue = 10;
    visual = null;
    errorEl.textContent = "";
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
    if (draft.size !== 4) draft.teams = false;
    renderSeats();
    document.getElementById("city-ffa").classList.toggle("on", !draft.teams);
    document.getElementById("city-teams").classList.toggle("on", draft.teams);
  });

  teamBox.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-teams]");
    if (!btn) return;
    draft.teams = btn.dataset.teams === "1";
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
    if (giveBox) giveCash = snap10(giveBox.value);
    if (takeBox) takeCash = snap10(takeBox.value);
    const type = btn.dataset.act;
    if (type === "NEW") {
      window.clearTimeout(botTimer);
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

  document.addEventListener("keydown", (e) => {
    if (!state || busy || coverEl && !coverEl.hidden) return;
    if (e.key !== " " && e.key !== "Enter") return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (state.phase === "roll") { e.preventDefault(); apply({ type: "ROLL" }); }
    if (state.phase === "rolloff") { e.preventDefault(); apply({ type: "ROLL_OFF" }); }
  });

  renderSeats();
  const existing = loadSaved();
  if (existing) resumeBox.hidden = false;
})();
