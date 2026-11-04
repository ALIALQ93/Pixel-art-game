const C = require("./city-rules.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function seat(name, bot) {
  return { name, bot: !!bot };
}

function match(extra) {
  const made = C.createMatch(Object.assign({
    seed: 42,
    size: 2,
    seats: [seat("أ", false), seat("ب", false)],
  }, extra || {}));
  assert(made.ok, made.error || "create");
  return made.state;
}

function go(state, action) {
  const res = C.dispatch(state, action);
  assert(res.ok, (res.error || "fail") + " @ " + action.type + " phase " + state.phase);
  return res.state;
}

function started() {
  let s = match();
  s = go(s, { type: "ROLL_OFF", dice: [6, 5] });
  s = go(s, { type: "ROLL_OFF", dice: [1, 2] });
  assert(s.phase === "roll", "phase after rolloff " + s.phase);
  assert(s.current === 0, "starter");
  assert(s.starter === 0, "anchor");
  return s;
}

function testPassGo() {
  let s = started();
  s.participants[0].position = 18;
  s = go(s, { type: "ROLL", dice: [1, 3] });
  assert(s.participants[0].position === 2, "landed " + s.participants[0].position);
  assert(s.participants[0].cash === 900, "salary cash " + s.participants[0].cash);
  assert(s.phase === "buy", "buy phase");
}

function testLandOnStart() {
  let s = started();
  s.participants[0].position = 18;
  s = go(s, { type: "ROLL", dice: [1, 1] });
  assert(s.participants[0].position === 0, "on start");
  assert(s.participants[0].cash === 900, "one salary");
  assert(s.phase === "manage", s.phase);
  assert(s.pendingExtra === true, "double waits");
}

function testThirdDouble() {
  let s = started();
  s.participants[0].position = 3;
  s.participants[0].doubles = 2;
  s = go(s, { type: "ROLL", dice: [4, 4] });
  assert(s.participants[0].jailed === true, "jailed");
  assert(s.participants[0].position === 5, "jail square");
  assert(s.current === 1, "turn passed");
  assert(s.pendingExtra === false, "no extra");
}

function testRentColumns() {
  let s = started();
  s.props[1].owner = 1;
  s.props[2].owner = 1;
  s.props[3].owner = 1;
  assert(C.rentOf(s, 1) === 20, "set rent " + C.rentOf(s, 1));
  s.props[1].level = 1;
  assert(C.rentOf(s, 1) === 40, "house");
  assert(C.rentOf(s, 2) === 10, "bare sibling " + C.rentOf(s, 2));
  s.props[1].level = 0;
  s.props[2].mortgaged = true;
  assert(C.rentOf(s, 2) === 0, "mortgaged");
  assert(C.rentOf(s, 1) === 10, "set broken");
}

function testEvenBuild() {
  let s = started();
  s.phase = "manage";
  [1, 2, 3].forEach((i) => { s.props[i].owner = 0; });
  s = go(s, { type: "BUILD", cell: 1 });
  assert(s.props[1].level === 1, "house");
  assert(s.bankHouses === 15, "house taken");
  const again = C.dispatch(s, { type: "BUILD", cell: 1 });
  assert(!again.ok && again.error === "even", again.error);
  s = go(s, { type: "BUILD", cell: 2 });
  s = go(s, { type: "BUILD", cell: 3 });
  s = go(s, { type: "BUILD", cell: 1 });
  assert(s.props[1].level === 2, "hotel");
  assert(s.bankHotels === 7, "hotel taken");
  assert(s.bankHouses === 14, "house returned");
  assert(s.humanHotel === true, "milestone");
  assert(s.humanSet === true, "set milestone");
}

function testAuctionPass() {
  let s = started();
  s.participants[0].position = 19;
  s = go(s, { type: "ROLL", dice: [1, 1] });
  assert(s.phase === "buy", s.phase);
  assert(s.participants[0].position === 1, "market");
  s = go(s, { type: "DECLINE" });
  assert(s.phase === "auction", s.phase);
  s = go(s, { type: "PASS" });
  s = go(s, { type: "PASS" });
  assert(s.props[1].owner == null, "stays bank");
  assert(s.phase === "manage", s.phase);
}

function testBankruptcyTransfer() {
  let s = started();
  s.phase = "debt";
  s.current = 0;
  s.debt = { debtor: 0, creditor: 1, amount: 500 };
  s.afterDebt = { kind: "manage" };
  s.participants[0].cash = 100;
  s.participants[1].cash = 800;
  s.props[1].owner = 0;
  s.props[1].level = 1;
  s.bankHouses = 15;
  s.participants[0].freedom = 1;
  s = go(s, { type: "ADMIT" });
  assert(s.participants[0].alive === false, "out");
  assert(s.props[1].owner === 1, "transferred");
  assert(s.props[1].level === 0, "building cleared");
  assert(s.bankHouses === 16, "house back");
  assert(s.participants[1].cash === 900, "cash " + s.participants[1].cash);
  assert(s.participants[1].freedom === 1, "card moved");
  assert(s.phase === "end", "last one " + s.phase);
  assert(s.winners[0] === 1, "winner");
}

function testScoreTie() {
  let s = started();
  s.round = 40;
  s.current = 1;
  s.phase = "manage";
  s.participants[0].cash = 500;
  s.participants[1].cash = 500;
  s = go(s, { type: "END_TURN" });
  assert(s.phase === "end", s.phase);
  assert(s.endReason === "rounds", s.endReason);
  assert(s.winners.length === 2, "shared " + s.winners.join(","));

  s = started();
  s.round = 40;
  s.current = 1;
  s.phase = "manage";
  s.participants[0].cash = 900;
  s.participants[1].cash = 700;
  s.props[16].owner = 1;
  s = go(s, { type: "END_TURN" });
  const w0 = C.netWorth(s, 0);
  const w1 = C.netWorth(s, 1);
  assert(w1 > w0, "worth " + w1 + " vs " + w0);
  assert(s.winners.length === 1 && s.winners[0] === 1, "richer side");
}

function testNetWorthFormula() {
  let s = started();
  s.participants[0].cash = 100;
  s.props[1].owner = 0;
  s.props[2].owner = 0;
  s.props[2].mortgaged = true;
  s.props[3].owner = 0;
  s.props[3].level = 2;
  const worth = C.netWorth(s, 0);
  assert(worth === 100 + 60 + 40 + 100 + 80, "worth " + worth);
}

function testTeamsAndGuards() {
  const bad = C.createMatch({ size: 2, teams: true, seats: [seat("أ", false), seat("ب", true)] });
  assert(!bad.ok && bad.error === "teams", bad.error);
  const bots = C.createMatch({ size: 2, seats: [seat("أ", true), seat("ب", true)] });
  assert(!bots.ok && bots.error === "human", bots.error);
  const made = C.createMatch({
    seed: 7,
    size: 4,
    teams: true,
    seats: [seat("أ", false), seat("ب", false), seat("ج", true), seat("د", true)],
  });
  assert(made.ok, made.error);
  assert(made.state.participants.length === 2, "two sides");
  assert(made.state.participants[0].bot === false, "human team");
  assert(made.state.participants[1].bot === true, "bot team");
  assert(made.state.participants[0].cash === 800, "shared wallet");
}

function testPlayout() {
  let made = C.createMatch({
    seed: 99,
    size: 4,
    teams: true,
    seats: [seat("أنت", false), seat("ليان", false), seat("خصم", true), seat("خصم٢", true)],
  });
  let s = made.state;
  const order = ["ROLL_OFF", "ROLL", "JAIL_PAY", "JAIL_ROLL", "BUY", "PAY_DEBT", "MORTGAGE", "SELL", "END_TURN", "PASS", "DECLINE", "REJECT_TRADE", "ADMIT"];
  for (let i = 0; i < 4000 && s.phase !== "end"; i++) {
    const id = C.actorId(s);
    const actor = s.participants[id];
    let action;
    if (actor.bot) action = C.suggestBotAction(s);
    else {
      const opts = C.options(s);
      assert(opts.length, "no options " + s.phase);
      let found = null;
      for (let k = 0; k < order.length; k++) {
        found = opts.find((o) => o.type === order[k]);
        if (found) break;
      }
      if (!found) found = opts[0];
      action = { type: found.type, cell: found.cell, amount: found.min };
    }
    assert(action, "no bot action " + s.phase);
    const res = C.dispatch(s, action);
    assert(res.ok, res.error + " phase " + s.phase + " action " + action.type);
    s = res.state;
  }
  assert(s.phase === "end", "unfinished " + s.phase + " round " + s.round);
  assert(s.winners && s.winners.length >= 1, "winners");
}

function testRolloffTie() {
  let s = match();
  s = go(s, { type: "ROLL_OFF", dice: [3, 3] });
  s = go(s, { type: "ROLL_OFF", dice: [2, 4] });
  assert(s.phase === "rolloff", "still rolling");
  s = go(s, { type: "ROLL_OFF", dice: [1, 1] });
  s = go(s, { type: "ROLL_OFF", dice: [6, 1] });
  assert(s.current === 1, "second won tie " + s.current);
  assert(s.phase === "roll", s.phase);
}

const tests = [
  testPassGo,
  testLandOnStart,
  testThirdDouble,
  testRentColumns,
  testEvenBuild,
  testAuctionPass,
  testBankruptcyTransfer,
  testScoreTie,
  testNetWorthFormula,
  testTeamsAndGuards,
  testRolloffTie,
  testPlayout,
];

let failed = 0;
tests.forEach((fn) => {
  try {
    fn();
    console.log("ok  " + fn.name);
  } catch (err) {
    failed += 1;
    console.error("FAIL " + fn.name);
    console.error(err);
  }
});

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log(tests.length + " passed");
