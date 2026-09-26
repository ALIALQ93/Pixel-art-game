(() => {
  "use strict";

  const PREF_KEY = "xo-prefs-v1";
  const COLORS = ["#d4537e", "#0f9d8f", "#c4840a", "#6d5bd0"];
  const DEFAULT_NAMES = ["لاعب 1", "لاعب 2", "لاعب 3", "لاعب 4"];
  const MARKS = [
    `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><path d="M28 28 L72 72 M72 28 L28 72"/></svg>`,
    `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="24"/></svg>`,
    `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 24 L78 74 H22 Z"/></svg>`,
    `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><rect x="28" y="28" width="44" height="44" rx="8"/></svg>`,
  ];

  const state = {
    mode: "duo",
    partyCount: 3,
    difficulty: "medium",
    first: "human",
    size: 3,
    target: 2,
    names: ["", "", "", ""],
    sound: true,
    handoff: false,
    players: [],
    scores: [],
    board: [],
    turn: 0,
    starter: 0,
    history: [],
    over: false,
    winner: null,
    winCells: null,
    round: 1,
    thinking: false,
    lock: false,
    waiting: false,
    aiTimer: 0,
    modalTimer: 0,
  };

  let handoffManual = false;
  let lineKey = null;
  let lastTurnPlayer = "";
  let audioCtx = null;
  let timerId = 0;
  let roundStart = 0;

  const $ = (id) => document.getElementById(id);

  function winNeed(size) {
    return size <= 4 ? 3 : 4;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }

  function nameAt(index) {
    const typed = (state.names[index] || "").trim();
    return typed || DEFAULT_NAMES[index];
  }

  function boardOptions() {
    if (state.mode === "party" && state.partyCount >= 4) {
      return [
        { size: 5, label: "٥×٥", hint: "٤ على التوالي" },
        { size: 6, label: "٦×٦", hint: "٤ على التوالي" },
      ];
    }
    if (state.mode === "party") {
      return [
        { size: 4, label: "٤×٤", hint: "٣ على التوالي" },
        { size: 5, label: "٥×٥", hint: "٤ على التوالي" },
      ];
    }
    return [
      { size: 3, label: "٣×٣", hint: "كلاسيكي" },
      { size: 4, label: "٤×٤", hint: "٣ على التوالي" },
      { size: 5, label: "٥×٥", hint: "٤ على التوالي" },
    ];
  }

  function preferredSize() {
    if (state.mode !== "party") return 3;
    return state.partyCount >= 4 ? 6 : 5;
  }

  function ensureSize() {
    if (!boardOptions().some((option) => option.size === state.size)) {
      state.size = preferredSize();
    }
  }

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
      if (saved.mode) state.mode = saved.mode;
      if (saved.partyCount === 3 || saved.partyCount === 4) state.partyCount = saved.partyCount;
      if (saved.difficulty) state.difficulty = saved.difficulty;
      if (saved.first) state.first = saved.first;
      if (saved.size) state.size = saved.size;
      if (saved.target) state.target = saved.target;
      if (Array.isArray(saved.names)) {
        saved.names.slice(0, 4).forEach((name, index) => {
          state.names[index] = typeof name === "string" ? name : "";
        });
      }
      if (typeof saved.sound === "boolean") state.sound = saved.sound;
      if (typeof saved.handoff === "boolean") {
        state.handoff = saved.handoff;
        handoffManual = true;
      }
    } catch (_) {}
    ensureSize();
    if (!handoffManual) state.handoff = state.mode === "party";
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        mode: state.mode,
        partyCount: state.partyCount,
        difficulty: state.difficulty,
        first: state.first,
        size: state.size,
        target: state.target,
        names: state.names,
        sound: state.sound,
        handoff: state.handoff,
      }));
    } catch (_) {}
  }

  function readNames() {
    document.querySelectorAll("[data-name-index]").forEach((input) => {
      state.names[Number(input.dataset.nameIndex)] = input.value.slice(0, 14);
    });
  }

  function setChips(container, attr, value) {
    container.querySelectorAll(".xo-chip").forEach((chip) => {
      chip.classList.toggle("on", chip.dataset[attr] === String(value));
    });
  }

  function renderBoardChips() {
    const box = $("board-chips");
    box.innerHTML = boardOptions().map((option) => `
      <button type="button" class="xo-chip ${option.size === state.size ? "on" : ""}" data-size="${option.size}">
        ${option.label}<small>${option.hint}</small>
      </button>`).join("");
  }

  function renderNames() {
    const box = $("name-fields");
    const count = state.mode === "party" ? state.partyCount : state.mode === "ai" ? 1 : 2;
    const key = `${state.mode}:${count}`;
    if (box.dataset.key === key) {
      box.querySelectorAll("[data-name-index]").forEach((input) => {
        const index = Number(input.dataset.nameIndex);
        if (document.activeElement !== input) input.value = state.names[index] || "";
      });
      return;
    }
    box.dataset.key = key;
    const fields = [];
    for (let i = 0; i < count; i++) {
      fields.push(`
        <label class="xo-name">
          <span class="xo-swatch" style="--p:${COLORS[i]}">${MARKS[i]}</span>
          <input data-name-index="${i}" maxlength="14" enterkeyhint="done" autocomplete="off"
            placeholder="${DEFAULT_NAMES[i]}" value="${escapeHtml(state.names[i] || "")}" aria-label="${DEFAULT_NAMES[i]}" />
        </label>`);
    }
    if (state.mode === "ai") {
      fields.push(`
        <div class="xo-name">
          <span class="xo-swatch" style="--p:${COLORS[1]}">${MARKS[1]}</span>
          <span class="xo-static-name">الكمبيوتر</span>
        </div>`);
    }
    box.innerHTML = fields.join("");
  }

  function ruleSentence() {
    const need = winNeed(state.size) === 3 ? "ثلاثة" : "أربعة";
    if (state.mode === "ai") return `أنت ضد الكمبيوتر. الفوز بخط من ${need} رموز.`;
    if (state.mode === "party") {
      const crowd = state.partyCount === 4 ? "أربعة لاعبين" : "ثلاثة لاعبين";
      return `${crowd} على نفس الهاتف. الفوز بخط من ${need} رموز.`;
    }
    return `لاعبان على نفس الهاتف. الفوز بخط من ${need} رموز.`;
  }

  function syncLobby() {
    ensureSize();
    setChips($("mode-chips"), "mode", state.mode);
    setChips($("count-chips"), "count", state.partyCount);
    setChips($("diff-chips"), "diff", state.difficulty);
    setChips($("first-chips"), "first", state.first);
    setChips($("target-chips"), "target", state.target);
    $("party-box").hidden = state.mode !== "party";
    $("ai-box").hidden = state.mode !== "ai";
    $("handoff-row").hidden = state.mode === "ai";
    $("handoff-toggle").checked = state.handoff;
    $("sound-toggle").checked = state.sound;
    renderBoardChips();
    renderNames();
    $("rule-hint").textContent = ruleSentence();
    updateSoundButton();
  }

  function playerCount() {
    if (state.mode === "party") return state.partyCount;
    return 2;
  }

  function buildPlayers() {
    const count = playerCount();
    const players = [];
    for (let i = 0; i < count; i++) {
      const ai = state.mode === "ai" && i === 1;
      players.push({
        name: ai ? "الكمبيوتر" : nameAt(i),
        ai,
        color: COLORS[i],
        mark: i,
      });
    }
    return players;
  }

  function startingIndex() {
    if (state.mode !== "ai") return 0;
    if (state.first === "ai") return 1;
    if (state.first === "random") return Math.random() < 0.5 ? 0 : 1;
    return 0;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function elapsedSec() {
    return Math.max(0, Math.round((Date.now() - roundStart) / 1000));
  }

  function startClock() {
    roundStart = Date.now();
    clearInterval(timerId);
    const tick = () => {
      const clock = $("clock");
      if (clock) clock.textContent = formatTime(Math.floor((Date.now() - roundStart) / 1000));
    };
    tick();
    timerId = setInterval(tick, 1000);
  }

  function buzz(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
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
    if (!ctx || !state.sound) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, when);
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur);
  }

  function playPlace() {
    const ctx = audio();
    if (!ctx || !state.sound) return;
    tone(620, ctx.currentTime, 0.07, "sine", 0.04);
  }

  function playWin() {
    const ctx = audio();
    if (!ctx || !state.sound) return;
    [523, 659, 784].forEach((freq, index) => {
      tone(freq, ctx.currentTime + index * 0.08, 0.16, "sine", 0.05);
    });
  }

  function playDraw() {
    const ctx = audio();
    if (!ctx || !state.sound) return;
    tone(311, ctx.currentTime, 0.18, "triangle", 0.04);
  }

  function updateSoundButton() {
    const button = $("sound-btn");
    if (button) button.textContent = state.sound ? "🔊 الصوت" : "🔇 صامت";
  }

  function winnerFrom(board, size, need, index) {
    const player = board[index];
    if (player == null) return null;
    const row = Math.floor(index / size);
    const col = index % size;
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
      const cells = [index];
      for (const sign of [1, -1]) {
        for (let step = 1; step < size; step++) {
          const rr = row + dr * step * sign;
          const cc = col + dc * step * sign;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) break;
          if (board[rr * size + cc] !== player) break;
          cells.push(rr * size + cc);
        }
      }
      if (cells.length >= need) {
        cells.sort((a, b) => a - b);
        return { player, cells };
      }
    }
    return null;
  }

  function emptyCells() {
    const cells = [];
    for (let i = 0; i < state.board.length; i++) {
      if (state.board[i] == null) cells.push(i);
    }
    return cells;
  }

  function isWinMove(index, player) {
    state.board[index] = player;
    const win = winnerFrom(state.board, state.size, winNeed(state.size), index);
    state.board[index] = null;
    return !!win;
  }

  function windowScore(row, col, dr, dc, player, need) {
    const { board, size } = state;
    let score = 0;
    for (let offset = 0; offset < need; offset++) {
      const startRow = row - dr * offset;
      const startCol = col - dc * offset;
      let own = 0;
      let enemy = 0;
      let valid = true;
      for (let step = 0; step < need; step++) {
        const rr = startRow + dr * step;
        const cc = startCol + dc * step;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) {
          valid = false;
          break;
        }
        const value = board[rr * size + cc];
        if (value == null) continue;
        if (value === player) own += 1;
        else enemy += 1;
      }
      if (!valid || enemy) continue;
      score += own * own;
    }
    return score;
  }

  function scoreCell(index) {
    const { size, turn, players } = state;
    const need = winNeed(size);
    const row = Math.floor(index / size);
    const col = index % size;
    const mid = (size - 1) / 2;
    let score = (size - (Math.abs(row - mid) + Math.abs(col - mid))) * 2;
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
      score += windowScore(row, col, dr, dc, turn, need) * 5;
      for (let p = 0; p < players.length; p++) {
        if (p === turn) continue;
        score += windowScore(row, col, dr, dc, p, need) * 3;
      }
    }
    return score;
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function bestScored(list) {
    let best = list[0];
    let bestScore = -Infinity;
    for (const index of list) {
      const score = scoreCell(index);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    }
    return best;
  }

  function minimax(board, size, need, turn, ai, depth, alpha, beta, last) {
    if (last != null) {
      const win = winnerFrom(board, size, need, last);
      if (win) return win.player === ai ? 10 - depth : depth - 10;
    }
    const empties = [];
    for (let i = 0; i < board.length; i++) if (board[i] == null) empties.push(i);
    if (!empties.length) return 0;
    const maximizing = turn === ai;
    let best = maximizing ? -Infinity : Infinity;
    const center = (size * size - 1) / 2;
    empties.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
    for (const index of empties) {
      board[index] = turn;
      const score = minimax(board, size, need, 1 - turn, ai, depth + 1, alpha, beta, index);
      board[index] = null;
      if (maximizing) {
        if (score > best) best = score;
        if (score > alpha) alpha = score;
      } else {
        if (score < best) best = score;
        if (score < beta) beta = score;
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  function minimaxBest() {
    const { board, size, turn } = state;
    const need = winNeed(size);
    const empties = emptyCells();
    let bestScore = -Infinity;
    let best = [];
    for (const index of empties) {
      board[index] = turn;
      const score = minimax(board, size, need, 1 - turn, turn, 1, -Infinity, Infinity, index);
      board[index] = null;
      if (score > bestScore) {
        bestScore = score;
        best = [index];
      } else if (score === bestScore) {
        best.push(index);
      }
    }
    best.sort((a, b) => scoreCell(b) - scoreCell(a));
    const topScore = scoreCell(best[0]);
    return pick(best.filter((index) => scoreCell(index) === topScore));
  }

  function chooseAiMove() {
    const empties = emptyCells();
    if (!empties.length) return null;
    const diff = state.difficulty;
    if (diff === "easy" && Math.random() < 0.5) return pick(empties);

    const winning = empties.find((index) => isWinMove(index, state.turn));
    if (winning != null) return winning;

    const scan = diff === "easy" ? 1 : state.players.length - 1;
    for (let step = 1; step <= scan; step++) {
      const opponent = (state.turn + step) % state.players.length;
      const threats = empties.filter((index) => isWinMove(index, opponent));
      if (threats.length) return bestScored(threats);
    }

    if (state.players.length === 2 && state.size === 3 && (diff === "hard" || (diff === "medium" && Math.random() < 0.82))) {
      return minimaxBest();
    }

    const ranked = empties
      .map((index) => ({ index, score: scoreCell(index) }))
      .sort((a, b) => b.score - a.score);
    if (diff === "hard") return ranked[0].index;
    const pool = ranked.slice(0, diff === "easy" ? Math.min(5, ranked.length) : Math.min(3, ranked.length));
    return pick(pool).index;
  }

  function hideOverlays() {
    $("modal").hidden = true;
    $("handoff").hidden = true;
    state.waiting = false;
  }

  function renderScores() {
    $("scores").innerHTML = state.players.map((player, index) => `
      <div class="xo-score ${!state.over && index === state.turn ? "on" : ""}" style="--p:${player.color}">
        ${MARKS[player.mark]}
        <strong>${escapeHtml(player.name)}</strong>
        <em>${state.scores[index]}</em>
      </div>`).join("");
  }

  function renderTurn() {
    const player = state.players[state.turn];
    const el = $("turn");
    if (!player) return;
    el.style.setProperty("--p", state.over && state.winner != null ? state.players[state.winner].color : player.color);
    const markHost = el.querySelector(".xo-turn-mark");
    const shown = state.over && state.winner != null ? state.winner : state.turn;
    if (el.dataset.player !== String(shown)) {
      el.dataset.player = String(shown);
      markHost.innerHTML = MARKS[state.players[shown].mark];
    }
    const small = el.querySelector("small");
    const strong = el.querySelector("strong");
    small.classList.toggle("xo-dots", state.thinking);
    if (state.over && state.winner != null) {
      small.textContent = "انتهت الجولة";
      strong.textContent = `فاز ${state.players[state.winner].name}`;
    } else if (state.over) {
      small.textContent = "انتهت الجولة";
      strong.textContent = "تعادل";
    } else if (state.thinking) {
      small.textContent = "يفكر";
      strong.textContent = player.name;
    } else {
      small.textContent = "الدور الآن";
      strong.textContent = player.name;
    }
    const key = `${shown}:${state.thinking}:${state.over}`;
    if (key !== lastTurnPlayer) {
      lastTurnPlayer = key;
      el.classList.remove("swap");
      void el.offsetWidth;
      el.classList.add("swap");
    }
  }

  function targetPhrase() {
    if (state.target === 1) return "جولة واحدة";
    if (state.target === 2) return "حتى فوزين";
    return "حتى ٣ فوزات";
  }

  function renderMeta() {
    const need = winNeed(state.size) === 3 ? "٣" : "٤";
    $("rule").textContent = `الجولة ${state.round} · خط من ${need} · ${targetPhrase()}`;
    $("moves").textContent = `${state.history.length} حركة`;
  }

  function drawWinLine() {
    const key = state.winCells ? state.winCells.join(",") : "";
    if (key === lineKey) return;
    lineKey = key;
    requestAnimationFrame(() => {
      const svg = $("winline");
      const frame = $("frame");
      svg.innerHTML = "";
      if (!key || !state.winCells || !state.players[state.winner]) return;
      const boardRect = frame.getBoundingClientRect();
      const ends = [state.winCells[0], state.winCells[state.winCells.length - 1]];
      const point = (index) => {
        const cell = frame.querySelector(`[data-i="${index}"]`);
        const rect = cell.getBoundingClientRect();
        return {
          x: rect.left - boardRect.left + rect.width / 2,
          y: rect.top - boardRect.top + rect.height / 2,
        };
      };
      const a = point(ends[0]);
      const b = point(ends[1]);
      svg.setAttribute("viewBox", `0 0 ${boardRect.width} ${boardRect.height}`);
      svg.style.setProperty("--p", state.players[state.winner].color);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      svg.appendChild(line);
    });
  }

  function renderBoard() {
    const boardEl = $("xo-grid");
    const size = state.size;
    if (boardEl.dataset.size !== String(size) || boardEl.children.length !== size * size) {
      boardEl.dataset.size = String(size);
      boardEl.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
      boardEl.innerHTML = "";
      for (let i = 0; i < size * size; i++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "xo-cell";
        cell.dataset.i = String(i);
        cell.addEventListener("click", () => onCell(i));
        boardEl.appendChild(cell);
      }
    }
    const winSet = new Set(state.winCells || []);
    const last = state.history[state.history.length - 1];
    [...boardEl.children].forEach((cell, index) => {
      const owner = state.board[index];
      const key = owner == null ? "" : String(owner);
      if (cell.dataset.owner !== key) {
        cell.dataset.owner = key;
        if (owner == null) {
          cell.innerHTML = "";
          cell.style.color = "";
        } else {
          cell.style.color = state.players[owner].color;
          cell.innerHTML = MARKS[owner];
        }
      }
      cell.classList.toggle("last", index === last && !state.over);
      cell.classList.toggle("win", winSet.has(index));
      const row = Math.floor(index / size) + 1;
      const col = (index % size) + 1;
      cell.setAttribute(
        "aria-label",
        owner == null ? `صف ${row} عمود ${col}` : `صف ${row} عمود ${col}، ${state.players[owner].name}`
      );
    });
    drawWinLine();
  }

  function renderMatch() {
    renderScores();
    renderTurn();
    renderMeta();
    renderBoard();
    const undo = $("undo-btn");
    undo.disabled = state.over || state.thinking || state.waiting || !state.history.length;
    updateSoundButton();
  }

  function shouldHandoff() {
    if (state.mode === "ai" || !state.handoff || state.over) return false;
    return !state.players[state.turn].ai;
  }

  function openHandoff() {
    state.waiting = true;
    state.lock = true;
    const player = state.players[state.turn];
    const mark = $("handoff-mark");
    mark.style.setProperty("--p", player.color);
    mark.innerHTML = MARKS[player.mark];
    $("handoff-name").textContent = player.name;
    $("handoff-rule").textContent = `اصنع خطاً من ${winNeed(state.size) === 3 ? "٣" : "٤"} رموز`;
    $("handoff").hidden = false;
    $("undo-btn").disabled = true;
  }

  function continueTurn() {
    if (state.over || state.waiting) return;
    if (state.players[state.turn].ai) {
      maybeAi();
      return;
    }
    state.lock = true;
    setTimeout(() => {
      if (!state.waiting && !state.thinking && !state.over) state.lock = false;
    }, 180);
  }

  function maybeAi() {
    if (state.over || state.waiting || !state.players[state.turn].ai) return;
    state.thinking = true;
    state.lock = true;
    renderTurn();
    clearTimeout(state.aiTimer);
    const wait = state.difficulty === "hard" ? 460 : 320;
    state.aiTimer = setTimeout(() => {
      state.thinking = false;
      state.lock = false;
      if (state.over || state.waiting) return;
      const move = chooseAiMove();
      if (move == null) return;
      place(move);
    }, wait);
  }

  function place(index) {
    state.board[index] = state.turn;
    state.history.push(index);
    playPlace();
    buzz(10);
    const win = winnerFrom(state.board, state.size, winNeed(state.size), index);
    const full = state.board.every((cell) => cell != null);
    if (win || full) {
      finish(win);
      return;
    }
    state.turn = (state.starter + state.history.length) % state.players.length;
    renderMatch();
    if (shouldHandoff()) {
      openHandoff();
      return;
    }
    continueTurn();
  }

  function onCell(index) {
    if (state.over || state.waiting || state.thinking || state.lock) return;
    if (!state.players[state.turn] || state.players[state.turn].ai) return;
    if (state.board[index] != null) {
      const cell = $("xo-grid").children[index];
      cell.classList.remove("shake");
      void cell.offsetWidth;
      cell.classList.add("shake");
      return;
    }
    place(index);
  }

  function burst(active) {
    const layer = $("confetti");
    layer.innerHTML = "";
    if (!active) return;
    const colors = ["#d4537e", "#0f9d8f", "#c4840a", "#6d5bd0", "#f2b8c6", "#f7d9a8"];
    for (let i = 0; i < 30; i++) {
      const bit = document.createElement("i");
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${Math.random() * 0.18}s`;
      bit.style.animationDuration = `${0.9 + Math.random() * 0.45}s`;
      layer.appendChild(bit);
    }
  }

  function showModal() {
    const mark = $("modal-mark");
    const title = $("modal-title");
    const sub = $("modal-sub");
    const next = $("modal-next");
    $("modal-scores").innerHTML = state.players.map((player, index) =>
      `<span class="xo-mini"><b>${state.scores[index]}</b> ${escapeHtml(player.name)}</span>`
    ).join("");
    if (state.winner == null) {
      mark.style.setProperty("--p", "#8a76c4");
      mark.innerHTML = `<span class="xo-draw-mark">=</span>`;
      title.textContent = "تعادل";
      sub.textContent = "امتلأت اللوحة من غير خط فائز.";
      next.textContent = "الجولة التالية";
      burst(false);
    } else {
      const player = state.players[state.winner];
      const wonMatch = state.scores[state.winner] >= state.target;
      mark.style.setProperty("--p", player.color);
      mark.innerHTML = MARKS[player.mark];
      if (wonMatch && state.target > 1) {
        title.textContent = "بطل المباراة";
        sub.textContent = player.name;
        next.textContent = "مباراة جديدة";
      } else {
        title.textContent = `فاز ${player.name}`;
        sub.textContent = wonMatch ? "جولة جميلة." : targetPhrase();
        next.textContent = wonMatch ? "العب مجدداً" : "الجولة التالية";
      }
      burst(true);
    }
    $("modal").hidden = false;
    next.focus();
  }

  function finish(win) {
    clearTimeout(state.aiTimer);
    clearInterval(timerId);
    state.over = true;
    state.lock = true;
    state.thinking = false;
    state.waiting = false;
    if (win) {
      state.winner = win.player;
      state.winCells = win.cells;
      state.scores[win.player] += 1;
      playWin();
      buzz([12, 36, 16]);
    } else {
      state.winner = null;
      state.winCells = null;
      playDraw();
      buzz(16);
    }
    if (window.PlayData) {
      PlayData.recordXoRound({
        timeSec: elapsedSec(),
        vsAi: state.mode === "ai",
        difficulty: state.difficulty,
        players: state.players.length,
        humanWon: !!(win && state.mode === "ai" && !state.players[win.player].ai),
      });
    }
    renderMatch();
    clearTimeout(state.modalTimer);
    state.modalTimer = setTimeout(showModal, 480);
  }

  function resetBoard(passPhone) {
    clearTimeout(state.aiTimer);
    clearTimeout(state.modalTimer);
    state.board = Array(state.size * state.size).fill(null);
    state.history = [];
    state.winCells = null;
    state.winner = null;
    state.over = false;
    state.thinking = false;
    state.lock = false;
    state.waiting = false;
    state.turn = state.starter;
    lineKey = null;
    lastTurnPlayer = "";
    hideOverlays();
    const svg = $("winline");
    if (svg) svg.innerHTML = "";
    startClock();
    renderMatch();
    if (passPhone && state.handoff && state.mode !== "ai" && !state.players[state.turn].ai) {
      openHandoff();
      return;
    }
    continueTurn();
  }

  function matchWon() {
    return state.winner != null && state.scores[state.winner] >= state.target;
  }

  function nextRound() {
    if (matchWon()) {
      state.scores = state.players.map(() => 0);
      state.round = 1;
      state.starter = startingIndex();
    } else {
      state.starter = (state.starter + 1) % state.players.length;
      state.round += 1;
    }
    resetBoard(true);
  }

  function startMatch() {
    readNames();
    savePrefs();
    audio();
    state.players = buildPlayers();
    state.scores = state.players.map(() => 0);
    state.round = 1;
    state.starter = startingIndex();
    $("lobby").hidden = true;
    $("match").hidden = false;
    resetBoard(false);
  }

  function showLobby() {
    clearTimeout(state.aiTimer);
    clearTimeout(state.modalTimer);
    clearInterval(timerId);
    hideOverlays();
    $("match").hidden = true;
    $("lobby").hidden = false;
    syncLobby();
  }

  function undo() {
    if (state.over || state.thinking || state.waiting || !state.history.length) return;
    clearTimeout(state.aiTimer);
    do {
      const index = state.history.pop();
      state.board[index] = null;
      if (!state.history.length) break;
      const restored = (state.starter + state.history.length) % state.players.length;
      if (!state.players[restored].ai) break;
    } while (state.history.length);
    state.turn = (state.starter + state.history.length) % state.players.length;
    state.thinking = false;
    state.lock = false;
    state.winCells = null;
    lineKey = null;
    renderMatch();
    if (state.players[state.turn].ai) maybeAi();
  }

  function onLobbyClick(event) {
    const chip = event.target.closest(".xo-chip");
    if (!chip) return;
    readNames();
    if (chip.dataset.mode) {
      const previous = state.mode;
      state.mode = chip.dataset.mode;
      if (state.mode === "party" && previous !== "party") state.handoff = true;
      else if (!handoffManual && state.mode !== "party") state.handoff = false;
    } else if (chip.dataset.count) {
      state.partyCount = Number(chip.dataset.count);
    } else if (chip.dataset.diff) {
      state.difficulty = chip.dataset.diff;
    } else if (chip.dataset.first) {
      state.first = chip.dataset.first;
    } else if (chip.dataset.size) {
      state.size = Number(chip.dataset.size);
    } else if (chip.dataset.target) {
      state.target = Number(chip.dataset.target);
    }
    ensureSize();
    syncLobby();
  }

  async function shareResult() {
    const bits = [...$("modal-scores").querySelectorAll(".xo-mini")].map((el) => el.textContent.trim());
    const text = `${$("modal-title").textContent} — ${bits.join(" · ")}`;
    const button = $("share-btn");
    if (navigator.share) {
      try {
        await navigator.share({ title: "إكس أو", text, url: location.href });
      } catch (_) {}
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "تم النسخ";
      setTimeout(() => {
        button.textContent = "مشاركة النتيجة";
      }, 1400);
    } catch (_) {}
  }

  function bind() {
    $("lobby").addEventListener("click", onLobbyClick);
    $("name-fields").addEventListener("input", (event) => {
      const input = event.target.closest("[data-name-index]");
      if (!input) return;
      state.names[Number(input.dataset.nameIndex)] = input.value.slice(0, 14);
    });
    $("handoff-toggle").addEventListener("change", (event) => {
      state.handoff = event.target.checked;
      handoffManual = true;
    });
    $("sound-toggle").addEventListener("change", (event) => {
      state.sound = event.target.checked;
      if (state.sound) audio();
      updateSoundButton();
    });
    $("start-btn").addEventListener("click", startMatch);
    $("undo-btn").addEventListener("click", undo);
    $("replay-btn").addEventListener("click", () => {
      if (state.over) return;
      resetBoard(false);
    });
    $("sound-btn").addEventListener("click", () => {
      state.sound = !state.sound;
      if (state.sound) audio();
      $("sound-toggle").checked = state.sound;
      updateSoundButton();
      savePrefs();
    });
    $("lobby-btn").addEventListener("click", showLobby);
    $("handoff-go").addEventListener("click", () => {
      state.waiting = false;
      state.lock = false;
      $("handoff").hidden = true;
      renderMatch();
      continueTurn();
    });
    $("modal-next").addEventListener("click", nextRound);
    $("modal-lobby").addEventListener("click", showLobby);
    $("share-btn").addEventListener("click", shareResult);
  }

  loadPrefs();
  bind();
  syncLobby();
})();
