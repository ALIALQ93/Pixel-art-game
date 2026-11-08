/* مدينة البكسل — محرك القواعد. بلا واجهة. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CityRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLORS = [
    { id: "rose", hex: "#d4537e", ink: "#fff" },
    { id: "teal", hex: "#0f9d8f", ink: "#fff" },
    { id: "violet", hex: "#7a5eb6", ink: "#fff" },
    { id: "gold", hex: "#c4922e", ink: "#fff" },
  ];

  const BUILD = { market: 40, gardens: 60, art: 80, port: 100 };
  const GROUPS = {
    market: [1, 2, 3],
    gardens: [6, 7, 8],
    art: [11, 12, 13],
    port: [16, 17, 18],
  };
  const GROUP_NAME = { market: "السوق", gardens: "الحدائق", art: "الفن", port: "الميناء" };

  const BOARD = [
    { i: 0, kind: "start", name: "الانطلاق", short: "انطلاق" },
    street(1, "market", "السوق", "السوق", 60, [10, 20, 40, 80], 30, 40),
    street(2, "market", "زقاق العطار", "العطار", 80, [10, 20, 50, 100], 40, 50),
    street(3, "market", "فرن الحي", "الفرن", 100, [20, 40, 70, 140], 50, 60),
    { i: 4, kind: "luck", name: "حظ", short: "حظ" },
    { i: 5, kind: "visit", name: "زيارة الحبس", short: "زيارة" },
    street(6, "gardens", "حديقة النخيل", "النخيل", 120, [10, 20, 60, 140], 60, 70),
    street(7, "gardens", "ساحة اللعب", "الساحة", 140, [20, 40, 80, 180], 70, 80),
    street(8, "gardens", "مقهى الركن", "المقهى", 160, [20, 40, 100, 220], 80, 90),
    { i: 9, kind: "tax", name: "ضريبة السوق", short: "ضريبة", amount: 50 },
    { i: 10, kind: "chest", name: "خزنة الحي", short: "خزنة", amount: 50 },
    street(11, "art", "برج الإطلالة", "البرج", 180, [20, 40, 120, 260], 90, 100),
    street(12, "art", "استوديو البكسل", "الاستوديو", 200, [30, 60, 140, 300], 100, 110),
    street(13, "art", "معرض الألوان", "المعرض", 220, [30, 60, 160, 340], 110, 130),
    { i: 14, kind: "luck", name: "حظ", short: "حظ" },
    { i: 15, kind: "gotojail", name: "اذهب إلى الحبس", short: "للحبس" },
    street(16, "port", "الميناء", "الميناء", 240, [30, 60, 180, 380], 120, 140),
    street(17, "port", "ورشة الأشرعة", "الورشة", 260, [40, 80, 200, 420], 130, 150),
    street(18, "port", "منارة الشاطئ", "المنارة", 280, [40, 80, 240, 480], 140, 160),
    { i: 19, kind: "tax", name: "ضريبة الميناء", short: "ضريبة", amount: 80 },
  ];

  function street(i, group, name, short, price, rent, mortgage, lift) {
    return { i, kind: "street", group, name, short, price, rent, mortgage, lift };
  }

  const CARD_DEFS = [
    { id: "bonus", name: "مكافأة السوق" },
    { id: "repair", name: "أجرة الترميم" },
    { id: "to_start", name: "إلى الانطلاق" },
    { id: "to_light", name: "إلى منارة الشاطئ" },
    { id: "back3", name: "ارجع ثلاث خطوات" },
    { id: "to_jail", name: "إلى الحبس" },
    { id: "freedom", name: "بطاقة حرية" },
    { id: "freedom", name: "بطاقة حرية" },
    { id: "facade", name: "ضريبة الواجهات" },
  ];

  function cleanName(name, fallback) {
    const t = String(name || "").replace(/\s+/g, " ").trim().slice(0, 12);
    return t || fallback;
  }

  function rngNext(state) {
    let s = state.seed >>> 0;
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17; s >>>= 0;
    s ^= s << 5; s >>>= 0;
    state.seed = s >>> 0;
    return state.seed;
  }

  function rngInt(state, n) {
    const max = 0x100000000;
    const lim = Math.floor(max / n) * n;
    let x;
    do { x = rngNext(state); } while (x >= lim);
    return x % n;
  }

  function rollDie(state) {
    return rngInt(state, 6) + 1;
  }

  function shuffle(state, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rngInt(state, i + 1);
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function createMatch(config) {
    const size = config && config.size;
    if (size !== 2 && size !== 3 && size !== 4) return { ok: false, error: "size" };
    if (!config.seats || config.seats.length !== size) return { ok: false, error: "seats" };
    if (config.teams && size !== 4) return { ok: false, error: "teams" };
    const seats = config.seats.map((seat, i) => ({
      name: cleanName(seat.name, "لاعب " + (i + 1)),
      bot: !!seat.bot,
    }));
    if (!seats.some((s) => !s.bot)) return { ok: false, error: "human" };

    let participants;
    if (config.teams) {
      participants = [0, 1].map((t) => {
        const a = seats[t * 2];
        const b = seats[t * 2 + 1];
        const bot = a.bot && b.bot;
        return side(t, a.name + " و" + b.name, bot, COLORS[t].hex, [a.name, b.name]);
      });
    } else {
      participants = seats.map((s, i) => side(i, s.name, s.bot, COLORS[i].hex, [s.name]));
    }

    let seed = config.seed >>> 0;
    if (!seed) seed = ((Date.now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0) || 1;

    const state = {
      v: 1,
      seed,
      teams: !!config.teams,
      participants,
      props: BOARD.map(() => ({ owner: null, level: 0, mortgaged: false })),
      bankHouses: 16,
      bankHotels: 8,
      deck: [],
      discard: [],
      current: 0,
      starter: 0,
      round: 1,
      phase: "rolloff",
      rolloff: { pending: participants.map((p) => p.id), rolls: {} },
      lastDice: null,
      pendingExtra: false,
      auction: null,
      debt: null,
      afterDebt: null,
      trade: null,
      tradePhase: null,
      luckChain: 0,
      log: [],
      winners: null,
      endReason: null,
      humanSet: false,
      humanHotel: false,
      fx: null,
      startedAt: Date.now(),
      playedMs: 0,
      statsSent: { set: false, hotel: false, match: false },
    };
    state.deck = shuffle(state, CARD_DEFS.map((c) => ({ id: c.id, name: c.name })));
    pushLog(state, "تبدأ مدينة البكسل. الرصيد ٨٠٠ لكل جانب.");
    return { ok: true, state };
  }

  function side(id, name, bot, color, members) {
    return {
      id,
      name,
      members,
      bot: !!bot,
      color,
      cash: 800,
      position: 0,
      jailed: false,
      jailTurns: 0,
      doubles: 0,
      freedom: 0,
      alive: true,
    };
  }

  function dispatch(state, action) {
    if (!state || !action || !action.type) return { ok: false, error: "phase", state };
    const s = structuredClone(state);
    s.fx = null;
    const err = reduce(s, action);
    if (err) return { ok: false, error: err, state };
    scanMilestones(s);
    return { ok: true, state: s };
  }

  function reduce(s, action) {
    switch (action.type) {
      case "ROLL_OFF": return rollOff(s, action.dice);
      case "JAIL_PAY": return jailPay(s);
      case "JAIL_CARD": return jailCard(s);
      case "JAIL_ROLL": return jailRoll(s, action.dice);
      case "ROLL": return doRoll(s, action.dice);
      case "BUY": return buy(s);
      case "DECLINE": return decline(s);
      case "BID": return bid(s, action.amount);
      case "PASS": return passBid(s);
      case "BUILD": return build(s, action.cell);
      case "SELL": return sell(s, action.cell);
      case "MORTGAGE": return mortgage(s, action.cell);
      case "UNMORTGAGE": return unmortgage(s, action.cell);
      case "OFFER_TRADE": return offerTrade(s, action);
      case "ACCEPT_TRADE": return acceptTrade(s);
      case "REJECT_TRADE": return rejectTrade(s);
      case "END_TURN": return endTurn(s);
      case "ADMIT": return admit(s);
      case "PAY_DEBT": return payDebt(s);
      default: return "phase";
    }
  }

  function cur(s) { return s.participants[s.current]; }
  function byId(s, id) { return s.participants[id]; }

  function pushLog(s, text) {
    s.log.push(text);
    if (s.log.length > 40) s.log.shift();
  }

  function diceOf(s, dice) {
    if (dice) {
      const a = dice[0];
      const b = dice[1];
      if (!Number.isInteger(a) || a < 1 || a > 6) return null;
      if (!Number.isInteger(b) || b < 1 || b > 6) return null;
      return [a, b];
    }
    return [rollDie(s), rollDie(s)];
  }

  function rollOff(s, dice) {
    if (s.phase !== "rolloff") return "phase";
    const pair = diceOf(s, dice);
    if (!pair) return "dice";
    const id = s.rolloff.pending[0];
    if (id == null) return "phase";
    s.rolloff.rolls[id] = pair;
    s.lastDice = pair;
    s.rolloff.pending = s.rolloff.pending.slice(1);
    const who = byId(s, id);
    pushLog(s, who.name + " يرمي " + pair[0] + " و" + pair[1] + ".");
    if (s.rolloff.pending.length) return null;
    const ids = Object.keys(s.rolloff.rolls).map(Number);
    let best = -1;
    ids.forEach((pid) => {
      const sum = s.rolloff.rolls[pid][0] + s.rolloff.rolls[pid][1];
      if (sum > best) best = sum;
    });
    const tied = ids.filter((pid) => s.rolloff.rolls[pid][0] + s.rolloff.rolls[pid][1] === best);
    if (tied.length === 1) {
      s.starter = tied[0];
      s.current = tied[0];
      s.round = 1;
      s.rolloff = null;
      pushLog(s, byId(s, tied[0]).name + " يبدأ اللعب.");
      openTurn(s);
      return null;
    }
    s.rolloff = { pending: tied.slice(), rolls: {} };
    pushLog(s, "تعادل على " + best + ". يعيد المتعادلون الرمي.");
    return null;
  }

  function openTurn(s) {
    const p = cur(s);
    p.doubles = 0;
    s.pendingExtra = false;
    if (p.jailed) s.phase = "jail_choice";
    else s.phase = "roll";
  }

  function jailPay(s) {
    if (s.phase !== "jail_choice") return "phase";
    const p = cur(s);
    if (p.cash < 50) return "cash";
    p.cash -= 50;
    p.jailed = false;
    p.jailTurns = 0;
    s.phase = "roll";
    pushLog(s, p.name + " يدفع ٥٠ ويخرج من الحبس.");
    return null;
  }

  function jailCard(s) {
    if (s.phase !== "jail_choice") return "phase";
    const p = cur(s);
    if (p.freedom < 1) return "card";
    p.freedom -= 1;
    s.discard.push({ id: "freedom", name: "بطاقة حرية" });
    p.jailed = false;
    p.jailTurns = 0;
    s.phase = "roll";
    pushLog(s, p.name + " يصرف بطاقة حرية.");
    return null;
  }

  function jailRoll(s, dice) {
    if (s.phase !== "jail_choice") return "phase";
    const pair = diceOf(s, dice);
    if (!pair) return "dice";
    const p = cur(s);
    s.lastDice = pair;
    s.luckChain = 0;
    pushLog(s, p.name + " يرمي " + pair[0] + " و" + pair[1] + " من الحبس.");
    if (pair[0] === pair[1]) {
      p.jailed = false;
      p.jailTurns = 0;
      s.pendingExtra = false;
      moveForward(s, pair[0] + pair[1]);
      resolveLanding(s);
      return null;
    }
    p.jailTurns += 1;
    if (p.jailTurns >= 3) {
      pushLog(s, "المحاولة الثالثة. الخروج يكلف ٥٠.");
      if (p.cash >= 50) {
        p.cash -= 50;
        p.jailed = false;
        p.jailTurns = 0;
        s.pendingExtra = false;
        moveForward(s, pair[0] + pair[1]);
        resolveLanding(s);
        return null;
      }
      s.debt = { debtor: p.id, creditor: "bank", amount: 50 };
      s.afterDebt = { kind: "jail_move", steps: pair[0] + pair[1] };
      s.phase = "debt";
      pushLog(s, p.name + " لا يملك ٥٠. تبدأ التصفية.");
      return null;
    }
    pushLog(s, "لا زوج. تبقى في الحبس.");
    finishSeat(s);
    return null;
  }

  function doRoll(s, dice) {
    if (s.phase !== "roll") return "phase";
    const pair = diceOf(s, dice);
    if (!pair) return "dice";
    const p = cur(s);
    s.lastDice = pair;
    s.luckChain = 0;
    const isDouble = pair[0] === pair[1];
    if (isDouble) p.doubles += 1;
    else p.doubles = 0;
    pushLog(s, p.name + " يرمي " + pair[0] + " و" + pair[1] + ".");
    if (isDouble && p.doubles >= 3) {
      pushLog(s, "ثلاثة أزواج متتالية. إلى الحبس.");
      sendToJail(s, p);
      p.doubles = 0;
      finishSeat(s);
      return null;
    }
    s.pendingExtra = isDouble;
    moveForward(s, pair[0] + pair[1]);
    resolveLanding(s);
    return null;
  }

  function moveForward(s, steps) {
    const p = cur(s);
    const from = p.position;
    const path = [];
    const salaries = [];
    for (let n = 0; n < steps; n++) {
      p.position = (p.position + 1) % 20;
      path.push(p.position);
      if (p.position === 0) {
        p.cash += 100;
        salaries.push(0);
        pushLog(s, p.name + " يمرّ بالانطلاق ويقبض ١٠٠.");
      }
    }
    appendFx(s, p.id, from, path, salaries);
  }

  function moveBack(s, steps) {
    const p = cur(s);
    const from = p.position;
    const path = [];
    for (let n = 0; n < steps; n++) {
      p.position = (p.position + 19) % 20;
      path.push(p.position);
    }
    appendFx(s, p.id, from, path, []);
    pushLog(s, p.name + " يرجع ثلاث خطوات.");
  }

  function appendFx(s, who, from, path, salaries) {
    if (!path.length) return;
    const extra = salaries || [];
    if (s.fx && s.fx.who === who && s.fx.path && s.fx.path.length && s.fx.path[s.fx.path.length - 1] === from) {
      s.fx.path = s.fx.path.concat(path);
      s.fx.salaries = (s.fx.salaries || []).concat(extra);
      return;
    }
    s.fx = { who, from, path: path.slice(), salaries: extra.slice() };
  }

  function sendToJail(s, p) {
    const from = p.position;
    p.position = 5;
    p.jailed = true;
    p.jailTurns = 0;
    s.pendingExtra = false;
    appendFx(s, p.id, from, [5], []);
    if (s.fx) s.fx.jail = true;
  }

  function resolveLanding(s) {
    if (s.phase === "end") return;
    const p = cur(s);
    const cell = BOARD[p.position];
    if (cell.kind === "start") {
      pushLog(s, p.name + " على الانطلاق.");
      enterManage(s);
      return;
    }
    if (cell.kind === "visit") {
      pushLog(s, p.name + " يزور الحبس.");
      enterManage(s);
      return;
    }
    if (cell.kind === "chest") {
      p.cash += cell.amount;
      pushLog(s, p.name + " يأخذ " + cell.amount + " من خزنة الحي.");
      enterManage(s);
      return;
    }
    if (cell.kind === "tax") {
      pushLog(s, p.name + " يدفع " + arabic(cell.amount) + " ضريبة.");
      charge(s, cell.amount, "bank");
      return;
    }
    if (cell.kind === "gotojail") {
      pushLog(s, p.name + " يذهب إلى الحبس.");
      sendToJail(s, p);
      finishSeat(s);
      return;
    }
    if (cell.kind === "luck") {
      drawCard(s);
      return;
    }
    const prop = s.props[cell.i];
    if (prop.owner == null) {
      pushLog(s, p.name + " يقف على " + cell.name + ".");
      if (p.cash >= cell.price) s.phase = "buy";
      else {
        pushLog(s, "السعر أعلى من المال. تبدأ المزايدة.");
        startAuction(s, cell.i);
      }
      return;
    }
    if (prop.owner === p.id) {
      pushLog(s, p.name + " يقف على ملكه " + cell.name + ".");
      enterManage(s);
      return;
    }
    const rent = rentOf(s, cell.i);
    if (rent <= 0) {
      pushLog(s, cell.name + " مرهون. لا إيجار.");
      enterManage(s);
      return;
    }
    pushLog(s, p.name + " يدفع إيجار " + rent + " لـ" + byId(s, prop.owner).name + ".");
    charge(s, rent, prop.owner);
  }

  function charge(s, amount, creditor) {
    const p = cur(s);
    if (amount <= 0) {
      enterManage(s);
      return;
    }
    if (p.cash >= amount) {
      p.cash -= amount;
      if (creditor !== "bank") {
        const c = byId(s, creditor);
        if (c && c.alive) c.cash += amount;
      }
      enterManage(s);
      return;
    }
    s.debt = { debtor: p.id, creditor, amount };
    s.afterDebt = { kind: "manage" };
    s.phase = "debt";
    pushLog(s, p.name + " يحتاج " + amount + " ولا يملكها. تبدأ التصفية.");
  }

  function drawCard(s) {
    s.luckChain = (s.luckChain || 0) + 1;
    if (s.luckChain > 6) {
      enterManage(s);
      return;
    }
    if (!s.deck.length) {
      s.deck = shuffle(s, s.discard);
      s.discard = [];
    }
    if (!s.deck.length) {
      enterManage(s);
      return;
    }
    const card = s.deck.shift();
    pushLog(s, "بطاقة: " + card.name + ".");
    if (card.id === "freedom") {
      cur(s).freedom += 1;
      enterManage(s);
      return;
    }
    s.discard.push(card);
    applyCard(s, card);
  }

  function applyCard(s, card) {
    const p = cur(s);
    if (card.id === "bonus") {
      p.cash += 100;
      pushLog(s, p.name + " يقبض ١٠٠.");
      enterManage(s);
      return;
    }
    if (card.id === "repair") {
      charge(s, 50, "bank");
      return;
    }
    if (card.id === "facade") {
      const n = hotelCount(s, p.id);
      const due = n * 50;
      pushLog(s, "فنادق: " + n + ". المستحق " + due + ".");
      charge(s, due, "bank");
      return;
    }
    if (card.id === "to_jail") {
      sendToJail(s, p);
      pushLog(s, p.name + " يُنقل إلى الحبس.");
      finishSeat(s);
      return;
    }
    if (card.id === "to_start") {
      const steps = (20 - p.position) % 20;
      if (steps) moveForward(s, steps);
      resolveLanding(s);
      return;
    }
    if (card.id === "to_light") {
      const steps = (18 - p.position + 20) % 20;
      if (steps) moveForward(s, steps);
      resolveLanding(s);
      return;
    }
    if (card.id === "back3") {
      moveBack(s, 3);
      resolveLanding(s);
    }
  }

  function enterManage(s) {
    if (s.phase === "end") return;
    const p = cur(s);
    if (!p.alive) {
      finishSeat(s);
      return;
    }
    s.phase = "manage";
  }

  function buy(s) {
    if (s.phase !== "buy") return "phase";
    const p = cur(s);
    const cell = BOARD[p.position];
    if (!cell || cell.kind !== "street") return "phase";
    if (s.props[cell.i].owner != null) return "owner";
    if (p.cash < cell.price) return "cash";
    p.cash -= cell.price;
    s.props[cell.i].owner = p.id;
    s.props[cell.i].level = 0;
    s.props[cell.i].mortgaged = false;
    pushLog(s, p.name + " يشتري " + cell.name + " بـ" + cell.price + ".");
    enterManage(s);
    return null;
  }

  function decline(s) {
    if (s.phase !== "buy") return "phase";
    const cell = BOARD[cur(s).position];
    pushLog(s, cur(s).name + " يرفض شراء " + cell.name + ".");
    startAuction(s, cell.i);
    return null;
  }

  function startAuction(s, cell) {
    const n = s.participants.length;
    const active = [];
    for (let k = 1; k <= n; k++) {
      const i = (s.current + k) % n;
      if (s.participants[i].alive) active.push(i);
    }
    s.auction = { cell, bid: 0, leader: null, active, turn: active[0], step: 1 };
    s.phase = "auction";
    pushLog(s, "مزايدة على " + BOARD[cell].name + ".");
    if (!active.length) closeAuction(s);
  }

  function bid(s, amount) {
    if (s.phase !== "auction" || !s.auction) return "phase";
    const a = s.auction;
    const who = a.turn;
    const p = byId(s, who);
    if (!Number.isInteger(amount) || amount % 10 !== 0) return "bid";
    if (amount > p.cash) return "cash";
    if (a.bid === 0) {
      if (amount < 10) return "bid";
    } else if (amount < a.bid + 10) return "bid";
    a.bid = amount;
    a.leader = who;
    pushLog(s, p.name + " يزايد بـ" + amount + ".");
    const idx = a.active.indexOf(who);
    if (a.active.length === 1) {
      closeAuction(s);
      return null;
    }
    for (let k = 1; k <= a.active.length; k++) {
      const cand = a.active[(idx + k) % a.active.length];
      if (cand !== a.leader) {
        advanceAuction(a, cand);
        return null;
      }
    }
    closeAuction(s);
    return null;
  }

  function passBid(s) {
    if (s.phase !== "auction" || !s.auction) return "phase";
    const a = s.auction;
    const actor = a.turn;
    const idx = a.active.indexOf(actor);
    if (idx === -1) return "phase";
    pushLog(s, byId(s, actor).name + " ينسحب من المزايدة.");
    a.active.splice(idx, 1);
    const rivals = a.leader == null ? a.active.slice() : a.active.filter((id) => id !== a.leader);
    if (!rivals.length) {
      closeAuction(s);
      return null;
    }
    const start = idx % a.active.length;
    for (let k = 0; k < a.active.length; k++) {
      const cand = a.active[(start + k) % a.active.length];
      if (a.leader != null && cand === a.leader) continue;
      advanceAuction(a, cand);
      return null;
    }
    closeAuction(s);
    return null;
  }

  function advanceAuction(a, id) {
    a.turn = id;
    a.step = (a.step || 0) + 1;
  }

  function closeAuction(s) {
    const a = s.auction;
    const cell = BOARD[a.cell];
    if (a.leader == null || a.bid <= 0) {
      pushLog(s, cell.name + " يبقى للبنك.");
    } else {
      const w = byId(s, a.leader);
      if (w.cash < a.bid) {
        pushLog(s, cell.name + " يبقى للبنك.");
      } else {
        w.cash -= a.bid;
        s.props[a.cell].owner = w.id;
        s.props[a.cell].level = 0;
        s.props[a.cell].mortgaged = false;
        pushLog(s, w.name + " يفوز بـ" + cell.name + " مقابل " + a.bid + ".");
      }
    }
    s.auction = null;
    enterManage(s);
  }

  function build(s, cell) {
    if (s.phase !== "manage") return "phase";
    const reason = buildBlock(s, cur(s).id, cell);
    if (reason) return reason;
    const p = cur(s);
    const info = BOARD[cell];
    const cost = BUILD[info.group];
    const prop = s.props[cell];
    p.cash -= cost;
    if (prop.level === 0) {
      prop.level = 1;
      s.bankHouses -= 1;
      pushLog(s, p.name + " يبني بيتاً على " + info.name + ".");
    } else {
      prop.level = 2;
      s.bankHotels -= 1;
      s.bankHouses += 1;
      if (!p.bot) s.humanHotel = true;
      pushLog(s, p.name + " يبني فندقاً على " + info.name + ".");
    }
    trySettle(s);
    return null;
  }

  function buildBlock(s, pid, cell) {
    const info = BOARD[cell];
    if (!info || info.kind !== "street") return "cell";
    const ids = GROUPS[info.group];
    const mine = ids.map((i) => s.props[i]);
    if (mine.some((prop) => prop.owner !== pid || prop.mortgaged)) return "set";
    const prop = s.props[cell];
    if (prop.level >= 2) return "level";
    const cost = BUILD[info.group];
    if (byId(s, pid).cash < cost) return "cash";
    if (prop.level === 0 && s.bankHouses < 1) return "pieces";
    if (prop.level === 1 && s.bankHotels < 1) return "pieces";
    const levels = ids.map((i) => s.props[i].level + (i === cell ? 1 : 0));
    if (Math.max.apply(null, levels) - Math.min.apply(null, levels) > 1) return "even";
    return null;
  }

  function sell(s, cell) {
    if (s.phase !== "manage" && s.phase !== "debt") return "phase";
    const reason = sellBlock(s, cur(s).id, cell);
    if (reason) return reason;
    const p = cur(s);
    const info = BOARD[cell];
    const prop = s.props[cell];
    const refund = BUILD[info.group] / 2;
    p.cash += refund;
    if (prop.level === 2) {
      prop.level = 1;
      s.bankHotels += 1;
      s.bankHouses -= 1;
      pushLog(s, p.name + " يبيع فندق " + info.name + " ويسترد " + refund + ".");
    } else {
      prop.level = 0;
      s.bankHouses += 1;
      pushLog(s, p.name + " يبيع بيت " + info.name + " ويسترد " + refund + ".");
    }
    trySettle(s);
    return null;
  }

  function sellBlock(s, pid, cell) {
    const info = BOARD[cell];
    if (!info || info.kind !== "street") return "cell";
    const prop = s.props[cell];
    if (prop.owner !== pid || prop.level === 0) return "owner";
    if (prop.level === 2 && s.bankHouses < 1) return "pieces";
    const ids = GROUPS[info.group];
    const levels = ids.map((i) => s.props[i].level - (i === cell ? 1 : 0));
    if (Math.max.apply(null, levels) - Math.min.apply(null, levels) > 1) return "even";
    return null;
  }

  function mortgage(s, cell) {
    if (s.phase !== "manage" && s.phase !== "debt") return "phase";
    const reason = mortgageBlock(s, cur(s).id, cell);
    if (reason) return reason;
    const p = cur(s);
    const info = BOARD[cell];
    s.props[cell].mortgaged = true;
    p.cash += info.mortgage;
    pushLog(s, p.name + " يرهن " + info.name + " ويقبض " + info.mortgage + ".");
    trySettle(s);
    return null;
  }

  function mortgageBlock(s, pid, cell) {
    const info = BOARD[cell];
    if (!info || info.kind !== "street") return "cell";
    const prop = s.props[cell];
    if (prop.owner !== pid || prop.mortgaged) return "owner";
    const ids = GROUPS[info.group];
    if (ids.some((i) => s.props[i].level > 0)) return "mortgage";
    return null;
  }

  function unmortgage(s, cell) {
    if (s.phase !== "manage") return "phase";
    const info = BOARD[cell];
    const prop = s.props[cell];
    const p = cur(s);
    if (!info || info.kind !== "street") return "cell";
    if (prop.owner !== p.id || !prop.mortgaged) return "owner";
    if (p.cash < info.lift) return "cash";
    p.cash -= info.lift;
    prop.mortgaged = false;
    pushLog(s, p.name + " يفك رهن " + info.name + " مقابل " + info.lift + ".");
    trySettle(s);
    return null;
  }

  function offerTrade(s, action) {
    if (s.phase !== "manage" && s.phase !== "debt") return "phase";
    const from = cur(s);
    const toId = action.to;
    const to = byId(s, toId);
    if (!to || !to.alive || to.id === from.id) return "trade";
    const giveCash = action.giveCash || 0;
    const takeCash = action.takeCash || 0;
    const giveProps = unique(action.giveProps || []);
    const takeProps = unique(action.takeProps || []);
    const giveFreedom = action.giveFreedom || 0;
    const takeFreedom = action.takeFreedom || 0;
    if (!moneyOk(giveCash) || !moneyOk(takeCash)) return "trade";
    if (giveCash > from.cash || takeCash > to.cash) return "cash";
    if (!Number.isInteger(giveFreedom) || !Number.isInteger(takeFreedom) || giveFreedom < 0 || takeFreedom < 0) return "trade";
    if (giveFreedom > from.freedom || takeFreedom > to.freedom) return "trade";
    if (overlaps(giveProps, takeProps)) return "trade";
    if (giveProps.some((c) => !propFree(s, from.id, c))) return "trade";
    if (takeProps.some((c) => !propFree(s, to.id, c))) return "trade";
    const moves = giveCash + takeCash + giveProps.length + takeProps.length + giveFreedom + takeFreedom;
    if (!moves) return "trade";
    s.tradePhase = s.phase;
    s.trade = { from: from.id, to: toId, giveCash, takeCash, giveProps, takeProps, giveFreedom, takeFreedom };
    s.phase = "trade_response";
    pushLog(s, from.name + " يعرض مقايضة على " + to.name + ".");
    return null;
  }

  function moneyOk(n) {
    return Number.isInteger(n) && n >= 0 && n % 10 === 0;
  }

  function unique(list) {
    const out = [];
    list.forEach((n) => {
      const i = Number(n);
      if (out.indexOf(i) === -1) out.push(i);
    });
    return out;
  }

  function overlaps(a, b) {
    return a.some((n) => b.indexOf(n) !== -1);
  }

  function propFree(s, pid, cell) {
    const info = BOARD[cell];
    if (!info || info.kind !== "street") return false;
    if (s.props[cell].owner !== pid) return false;
    const ids = GROUPS[info.group];
    return ids.every((i) => s.props[i].level === 0);
  }

  function acceptTrade(s) {
    if (s.phase !== "trade_response" || !s.trade) return "phase";
    const t = s.trade;
    const from = byId(s, t.from);
    const to = byId(s, t.to);
    if (t.giveCash > from.cash || t.takeCash > to.cash) return "cash";
    if (t.giveFreedom > from.freedom || t.takeFreedom > to.freedom) return "trade";
    if (t.giveProps.some((c) => !propFree(s, from.id, c))) return "trade";
    if (t.takeProps.some((c) => !propFree(s, to.id, c))) return "trade";
    from.cash = from.cash - t.giveCash + t.takeCash;
    to.cash = to.cash - t.takeCash + t.giveCash;
    from.freedom = from.freedom - t.giveFreedom + t.takeFreedom;
    to.freedom = to.freedom - t.takeFreedom + t.giveFreedom;
    t.giveProps.forEach((c) => { s.props[c].owner = to.id; });
    t.takeProps.forEach((c) => { s.props[c].owner = from.id; });
    pushLog(s, to.name + " يقبل المقايضة.");
    const back = s.tradePhase || "manage";
    s.trade = null;
    s.tradePhase = null;
    s.phase = back;
    trySettle(s);
    return null;
  }

  function rejectTrade(s) {
    if (s.phase !== "trade_response" || !s.trade) return "phase";
    pushLog(s, byId(s, s.trade.to).name + " يرفض المقايضة.");
    s.phase = s.tradePhase || "manage";
    s.trade = null;
    s.tradePhase = null;
    return null;
  }

  function endTurn(s) {
    if (s.phase !== "manage") return "phase";
    const p = cur(s);
    if (s.pendingExtra && p.alive && !p.jailed) {
      s.pendingExtra = false;
      s.phase = "roll";
      pushLog(s, "رمية إضافية لـ" + p.name + ".");
      return null;
    }
    finishSeat(s);
    return null;
  }

  function payDebt(s) {
    if (s.phase !== "debt" || !s.debt) return "phase";
    if (cur(s).cash < s.debt.amount) return "cash";
    settleDebt(s);
    return null;
  }

  function admit(s) {
    if (s.phase !== "debt" || !s.debt) return "phase";
    if (cur(s).cash >= s.debt.amount) {
      settleDebt(s);
      return null;
    }
    bankrupt(s);
    return null;
  }

  function trySettle(s) {
    if (s.phase !== "debt" || !s.debt) return;
    if (cur(s).cash >= s.debt.amount) settleDebt(s);
  }

  function settleDebt(s) {
    const d = s.debt;
    const p = byId(s, d.debtor);
    p.cash -= d.amount;
    if (d.creditor !== "bank") {
      const c = byId(s, d.creditor);
      if (c && c.alive) c.cash += d.amount;
    }
    pushLog(s, p.name + " يسدد " + d.amount + ".");
    const after = s.afterDebt;
    s.debt = null;
    s.afterDebt = null;
    if (after && after.kind === "jail_move") {
      p.jailed = false;
      p.jailTurns = 0;
      s.pendingExtra = false;
      moveForward(s, after.steps);
      resolveLanding(s);
      return;
    }
    enterManage(s);
  }

  function bankrupt(s) {
    const d = s.debt;
    const p = byId(s, d.debtor);
    const creditor = d.creditor;
    for (let i = 0; i < 20; i++) {
      const prop = s.props[i];
      if (prop.owner !== p.id) continue;
      if (prop.level === 2) s.bankHotels += 1;
      else if (prop.level === 1) s.bankHouses += 1;
      prop.level = 0;
      if (creditor === "bank") {
        prop.owner = null;
        prop.mortgaged = false;
      } else {
        prop.owner = creditor;
      }
    }
    if (creditor === "bank") {
      while (p.freedom > 0) {
        s.discard.push({ id: "freedom", name: "بطاقة حرية" });
        p.freedom -= 1;
      }
      p.cash = 0;
    } else {
      const c = byId(s, creditor);
      c.cash += p.cash;
      c.freedom += p.freedom;
      p.cash = 0;
      p.freedom = 0;
    }
    p.alive = false;
    p.jailed = false;
    s.debt = null;
    s.afterDebt = null;
    s.pendingExtra = false;
    s.trade = null;
    s.auction = null;
    pushLog(s, p.name + " يفلس ويخرج.");
    const alive = s.participants.filter((x) => x.alive);
    if (alive.length <= 1) {
      s.phase = "end";
      s.winners = alive.map((x) => x.id);
      s.endReason = "last";
      if (alive.length === 1) pushLog(s, alive[0].name + " يفوز.");
      return;
    }
    finishSeat(s);
  }

  function finishSeat(s) {
    if (s.phase === "end") return;
    const n = s.participants.length;
    let next = null;
    for (let k = 1; k <= n; k++) {
      const i = (s.current + k) % n;
      if (s.participants[i].alive) { next = i; break; }
    }
    if (next == null) {
      endByScore(s);
      return;
    }
    const wrapped = crossedAnchor(s.current, next, s.starter, n);
    s.current = next;
    s.pendingExtra = false;
    if (wrapped) {
      s.round += 1;
      if (s.round > 40) {
        endByScore(s);
        return;
      }
    }
    openTurn(s);
  }

  function crossedAnchor(from, to, anchor, n) {
    let i = from;
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      if (i === anchor) return true;
      if (i === to) return false;
    }
    return false;
  }

  function endByScore(s) {
    const alive = s.participants.filter((p) => p.alive);
    let best = null;
    alive.forEach((p) => {
      const worth = netWorth(s, p.id);
      const key = worth * 100000 + p.cash;
      if (best == null || key > best.key) best = { key, worth, ids: [p.id] };
      else if (key === best.key) best.ids.push(p.id);
    });
    s.phase = "end";
    s.winners = best ? best.ids : [];
    s.endReason = "rounds";
    if (s.winners.length === 1) pushLog(s, byId(s, s.winners[0]).name + " الأغنى ويفوز.");
    else if (s.winners.length > 1) pushLog(s, "تعادل في القيمة والمال. فوز مشترك.");
  }

  function netWorth(state, id) {
    const p = state.participants[id];
    if (!p) return 0;
    let worth = p.cash;
    BOARD.forEach((cell) => {
      if (cell.kind !== "street") return;
      const prop = state.props[cell.i];
      if (prop.owner !== id) return;
      worth += prop.mortgaged ? cell.mortgage : cell.price;
      if (prop.level === 1) worth += BUILD[cell.group];
      if (prop.level === 2) worth += BUILD[cell.group] * 2;
    });
    return worth;
  }

  function rentOf(state, cellIndex) {
    const cell = BOARD[cellIndex];
    if (!cell || cell.kind !== "street") return 0;
    const prop = state.props[cellIndex];
    if (prop.owner == null || prop.mortgaged) return 0;
    if (prop.level === 1) return cell.rent[2];
    if (prop.level === 2) return cell.rent[3];
    const ids = GROUPS[cell.group];
    const full = ids.every((i) => {
      const q = state.props[i];
      return q.owner === prop.owner && !q.mortgaged;
    });
    return full ? cell.rent[1] : cell.rent[0];
  }

  function groupRent(state, group) {
    let sum = 0;
    GROUPS[group].forEach((i) => { sum += rentOf(state, i); });
    return sum;
  }

  function hotelCount(s, pid) {
    let n = 0;
    BOARD.forEach((cell) => {
      if (cell.kind === "street" && s.props[cell.i].owner === pid && s.props[cell.i].level === 2) n += 1;
    });
    return n;
  }

  function scanMilestones(s) {
    s.participants.forEach((p) => {
      if (!p || p.bot) return;
      Object.keys(GROUPS).forEach((g) => {
        if (GROUPS[g].every((i) => s.props[i].owner === p.id)) s.humanSet = true;
      });
      BOARD.forEach((cell) => {
        if (cell.kind === "street" && s.props[cell.i].owner === p.id && s.props[cell.i].level === 2) {
          s.humanHotel = true;
        }
      });
    });
  }

  function groupOf(cell) {
    const info = BOARD[cell];
    return info && info.group;
  }

  function wouldComplete(s, pid, cell) {
    const g = groupOf(cell);
    if (!g) return false;
    return GROUPS[g].every((i) => i === cell || s.props[i].owner === pid);
  }

  function ownsCompleted(s, pid, cell) {
    const g = groupOf(cell);
    if (!g) return false;
    return GROUPS[g].every((i) => s.props[i].owner === pid);
  }

  function chasingPartial(s, pid) {
    return Object.keys(GROUPS).some((g) => {
      const n = GROUPS[g].filter((i) => s.props[i].owner === pid).length;
      return n > 0 && n < 3;
    });
  }

  function actorId(state) {
    if (!state) return 0;
    if (state.phase === "auction" && state.auction) return state.auction.turn;
    if (state.phase === "trade_response" && state.trade) return state.trade.to;
    if (state.phase === "rolloff" && state.rolloff && state.rolloff.pending.length) return state.rolloff.pending[0];
    return state.current;
  }

  function suggestBotAction(state) {
    if (!state || state.phase === "end") return null;
    const id = actorId(state);
    const p = state.participants[id];
    if (!p || !p.bot) return null;
    if (state.phase === "rolloff") return { type: "ROLL_OFF" };
    if (state.phase === "jail_choice") {
      if (p.cash >= 200) return { type: "JAIL_PAY" };
      if (p.freedom > 0) return { type: "JAIL_CARD" };
      return { type: "JAIL_ROLL" };
    }
    if (state.phase === "roll") return { type: "ROLL" };
    if (state.phase === "buy") {
      const cell = BOARD[p.position];
      const reserve = wouldComplete(state, p.id, cell.i) ? 100 : 200;
      if (p.cash - cell.price >= reserve) return { type: "BUY" };
      return { type: "DECLINE" };
    }
    if (state.phase === "auction") return botBid(state, p);
    if (state.phase === "trade_response") return botTrade(state) ? { type: "ACCEPT_TRADE" } : { type: "REJECT_TRADE" };
    if (state.phase === "debt") return botDebt(state, p);
    if (state.phase === "manage") {
      const built = bestBuild(state, p);
      if (built != null) return { type: "BUILD", cell: built };
      return { type: "END_TURN" };
    }
    return null;
  }

  function botBid(state, p) {
    const a = state.auction;
    const cell = BOARD[a.cell];
    const reserve = wouldComplete(state, p.id, cell.i) ? 100 : 200;
    const cap = Math.min(p.cash - reserve, cell.price);
    if (cap < 10) return { type: "PASS" };
    if (a.bid === 0) {
      const half = Math.ceil(cell.price / 2 / 10) * 10;
      if (half > cap) return { type: "PASS" };
      return { type: "BID", amount: half };
    }
    const next = a.bid + 10;
    if (next > cap) return { type: "PASS" };
    return { type: "BID", amount: next };
  }

  function botTrade(state) {
    const t = state.trade;
    const bot = byId(state, t.to);
    if (t.takeCash > 50) return false;
    if (bot.cash - t.takeCash + t.giveCash < 100) return false;
    const received = t.giveProps;
    if (!received.length) return false;
    const completes = received.some((cell) => completesAfter(state, bot.id, cell, t.takeProps, t.giveProps));
    if (!completes) return false;
    if (t.takeProps.some((cell) => ownsCompleted(state, bot.id, cell))) return false;
    return true;
  }

  function completesAfter(state, pid, cell, giving, getting) {
    const g = groupOf(cell);
    if (!g) return false;
    return GROUPS[g].every((i) => {
      if (i === cell) return true;
      if (getting.indexOf(i) !== -1) return true;
      if (giving.indexOf(i) !== -1) return false;
      return state.props[i].owner === pid;
    });
  }

  function botDebt(state, p) {
    if (p.cash >= state.debt.amount) return { type: "PAY_DEBT" };
    let mort = null;
    let mortRent = Infinity;
    BOARD.forEach((cell) => {
      if (mortgageBlock(state, p.id, cell.i)) return;
      const rent = cell.rent[0];
      if (rent < mortRent || (rent === mortRent && (mort == null || cell.i < mort))) {
        mortRent = rent;
        mort = cell.i;
      }
    });
    if (mort != null) return { type: "MORTGAGE", cell: mort };
    let sellCell = null;
    let sellRent = Infinity;
    BOARD.forEach((cell) => {
      if (sellBlock(state, p.id, cell.i)) return;
      const rent = cell.rent[3];
      if (rent < sellRent || (rent === sellRent && (sellCell == null || cell.i < sellCell))) {
        sellRent = rent;
        sellCell = cell.i;
      }
    });
    if (sellCell != null) return { type: "SELL", cell: sellCell };
    return { type: "ADMIT" };
  }

  function bestBuild(state, p) {
    const reserve = chasingPartial(state, p.id) ? 150 : 100;
    let pick = null;
    let best = -1;
    BOARD.forEach((cell) => {
      if (cell.kind !== "street") return;
      if (buildBlock(state, p.id, cell.i)) return;
      const cost = BUILD[cell.group];
      if (p.cash - cost < reserve) return;
      const prop = state.props[cell.i];
      const before = groupRent(state, cell.group);
      prop.level += 1;
      const after = groupRent(state, cell.group);
      prop.level -= 1;
      if (after <= before) return;
      const hotel = cell.rent[3];
      if (hotel > best || (hotel === best && (pick == null || cell.i < pick))) {
        best = hotel;
        pick = cell.i;
      }
    });
    return pick;
  }

  function options(state) {
    if (!state || state.phase === "end") return [];
    const p = state.participants[actorId(state)];
    if (state.phase === "rolloff") return [{ type: "ROLL_OFF", label: "ارمِ للقرعة" }];
    if (state.phase === "jail_choice") {
      const list = [];
      if (p.cash >= 50) list.push({ type: "JAIL_PAY", label: "ادفع ٥٠ واخرج" });
      if (p.freedom > 0) list.push({ type: "JAIL_CARD", label: "اصرف بطاقة حرية" });
      list.push({ type: "JAIL_ROLL", label: "ارمِ طلباً لزوج" });
      return list;
    }
    if (state.phase === "roll") return [{ type: "ROLL", label: "ارمِ النرد" }];
    if (state.phase === "buy") {
      const cell = BOARD[p.position];
      return [
        { type: "BUY", label: "اشترِ " + cell.name + " · " + cell.price },
        { type: "DECLINE", label: "ارفض وافتح المزايدة" },
      ];
    }
    if (state.phase === "auction") {
      const min = state.auction.bid === 0 ? 10 : state.auction.bid + 10;
      return [{ type: "BID", min, max: p.cash - (p.cash % 10), step: 10, label: "زايد" }, { type: "PASS", label: "انسحب" }];
    }
    if (state.phase === "trade_response") {
      return [
        { type: "ACCEPT_TRADE", label: "اقبل المقايضة" },
        { type: "REJECT_TRADE", label: "ارفض" },
      ];
    }
    if (state.phase === "debt") {
      return manageLike(state, true);
    }
    if (state.phase === "manage") return manageLike(state, false);
    return [];
  }

  function manageLike(state, debt) {
    const p = cur(state);
    const list = [];
    if (debt && p.cash >= state.debt.amount) list.push({ type: "PAY_DEBT", label: "سدّد " + state.debt.amount });
    BOARD.forEach((cell) => {
      if (!debt && !buildBlock(state, p.id, cell.i)) {
        const step = state.props[cell.i].level === 0 ? "بيت" : "فندق";
        list.push({ type: "BUILD", cell: cell.i, label: "ابنِ " + step + " · " + cell.short + " · " + BUILD[cell.group] });
      }
      if (!sellBlock(state, p.id, cell.i)) {
        list.push({ type: "SELL", cell: cell.i, label: "بِع بناء · " + cell.short });
      }
      if (!mortgageBlock(state, p.id, cell.i)) {
        list.push({ type: "MORTGAGE", cell: cell.i, label: "ارهن · " + cell.short + " · +" + cell.mortgage });
      }
      if (!debt && cell.kind === "street" && state.props[cell.i].owner === p.id && state.props[cell.i].mortgaged && p.cash >= cell.lift) {
        list.push({ type: "UNMORTGAGE", cell: cell.i, label: "فك الرهن · " + cell.short + " · " + cell.lift });
      }
    });
    const rivals = state.participants.filter((x) => x.alive && x.id !== p.id);
    if (rivals.length) list.push({ type: "TRADE_UI", label: "قايض" });
    if (debt) list.push({ type: "ADMIT", label: "أقرّ بالعجز" });
    else list.push({ type: "END_TURN", label: state.pendingExtra ? "الرمي مرة أخرى" : "أنهِ الدور" });
    return list;
  }

  function statusLine(state) {
    if (!state) return "";
    if (state.phase === "end") {
      if (!state.winners || !state.winners.length) return "انتهت المباراة.";
      const names = state.winners.map((id) => state.participants[id].name).join(" و");
      return state.winners.length > 1 ? "فوز مشترك: " + names : "الفائز: " + names;
    }
    const p = state.participants[actorId(state)];
    const name = p ? p.name : "";
    if (state.phase === "rolloff") return "قرعة البداية: " + name;
    if (state.phase === "jail_choice") return name + " في الحبس";
    if (state.phase === "roll") return "دور " + name;
    if (state.phase === "buy") return name + " يستطيع الشراء";
    if (state.phase === "auction") return "مزايدة: دور " + name;
    if (state.phase === "debt") return name + " يصفّي ديناً قدره " + state.debt.amount;
    if (state.phase === "trade_response") return name + " ينظر في المقايضة";
    if (state.phase === "manage") return name + " يدير أملاكه";
    return name;
  }

  function tradeText(state) {
    const t = state && state.trade;
    if (!t) return "";
    const bits = [];
    if (t.giveCash) bits.push(t.giveCash + " من " + byId(state, t.from).name);
    if (t.takeCash) bits.push(t.takeCash + " من " + byId(state, t.to).name);
    t.giveProps.forEach((c) => bits.push(BOARD[c].name + " من " + byId(state, t.from).name));
    t.takeProps.forEach((c) => bits.push(BOARD[c].name + " من " + byId(state, t.to).name));
    if (t.giveFreedom) bits.push("حرية ×" + t.giveFreedom + " من العارض");
    if (t.takeFreedom) bits.push("حرية ×" + t.takeFreedom + " من الآخر");
    return bits.join(" · ");
  }

  function arabic(n) { return String(n); }

  function errorText(code) {
    const map = {
      phase: "هذا القرار غير متاح الآن.",
      cash: "المال لا يكفي.",
      even: "ابنِ أو بِع بشكل متوازن داخل المجموعة.",
      pieces: "قطع البناء غير متاحة في البنك.",
      bid: "العرض غير صالح.",
      trade: "المقايضة غير صالحة.",
      mortgage: "بع البناء أولاً قبل رهن المجموعة.",
      set: "البناء يحتاج المجموعة كاملة وبلا رهن.",
      owner: "هذا الشارع ليس متاحاً لهذا القرار.",
      dice: "النرد غير صالح.",
      card: "لا توجد بطاقة حرية.",
      cell: "المربع غير مناسب.",
      level: "لا يمكن البناء فوق فندق.",
      size: "حجم الطاولة غير صالح.",
      seats: "المقاعد غير مكتملة.",
      teams: "الفريقان لطاولتين من أربعة.",
      human: "يلزم لاعب إنسان واحد على الأقل.",
    };
    return map[code] || "تعذر تنفيذ القرار.";
  }

  return {
    COLORS,
    BOARD,
    BUILD,
    GROUPS,
    GROUP_NAME,
    createMatch,
    dispatch,
    suggestBotAction,
    options,
    actorId,
    statusLine,
    tradeText,
    netWorth,
    rentOf,
    errorText,
  };
});
