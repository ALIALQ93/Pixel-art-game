(() => {
  "use strict";

  const KEY = "pixel-games-progress-v1";
  const MAX_GALLERY = 12;
  const DAILY_DEMOS = ["cabin", "cat", "sunset", "geo", "butterfly", "flower", "fish", "heart", "star"];

  const ACHIEVEMENTS = [
    { id: "first_color", icon: "🎨", name: "أول لوحة", desc: "أكمل أول تلوين بالبكسل" },
    { id: "color_5", icon: "🖼️", name: "فنان", desc: "أكمل 5 لوحات تلوين" },
    { id: "color_perfect", icon: "💎", name: "دقة مثالية", desc: "أكمل لوحة بدون أخطاء" },
    { id: "puzzle_first", icon: "🧩", name: "أول بازل", desc: "أكمل أول بازل" },
    { id: "puzzle_pro", icon: "🏆", name: "محترف", desc: "أكمل بازل 8×8 أو أكبر" },
    { id: "daily_done", icon: "☀️", name: "تحدي اليوم", desc: "أكمل تحدي اليوم" },
    { id: "streak_3", icon: "🔥", name: "سلسلة 3 أيام", desc: "العب 3 أيام متتالية" },
  ];

  function defaultData() {
    return {
      stats: {
        colorWins: 0,
        puzzleWins: 0,
        totalPlaySec: 0,
        bestColorAccuracy: 0,
        bestPuzzleMoves: null,
      },
      streak: { lastDay: "", count: 0 },
      daily: { date: "", colorDone: false },
      achievements: [],
      gallery: [],
      tutorials: { color: false, puzzle: false },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultData();
      return { ...defaultData(), ...JSON.parse(raw) };
    } catch {
      return defaultData();
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function dateKey(d = new Date()) {
    return d.toISOString().slice(0, 10);
  }

  function touchStreak(data) {
    const today = dateKey();
    if (data.streak.lastDay === today) return data;
    const yesterday = dateKey(new Date(Date.now() - 86400000));
    if (data.streak.lastDay === yesterday) data.streak.count += 1;
    else data.streak.count = 1;
    data.streak.lastDay = today;
    return data;
  }

  function unlock(data, id) {
    if (!data.achievements.includes(id)) data.achievements.push(id);
    return data;
  }

  function checkAchievements(data) {
    if (data.stats.colorWins >= 1) unlock(data, "first_color");
    if (data.stats.colorWins >= 5) unlock(data, "color_5");
    if (data.stats.puzzleWins >= 1) unlock(data, "puzzle_first");
    if (data.streak.count >= 3) unlock(data, "streak_3");
    if (data.daily.colorDone && data.daily.date === dateKey()) unlock(data, "daily_done");
    return data;
  }

  function addGallery(data, item) {
    data.gallery.unshift({
      id: Date.now(),
      game: item.game,
      name: item.name || "عمل",
      thumb: item.thumb,
      date: dateKey(),
      meta: item.meta || "",
    });
    if (data.gallery.length > MAX_GALLERY) data.gallery.length = MAX_GALLERY;
    return data;
  }

  function recordColorComplete({ name, timeMs, accuracy, mistakes, gridW, gridH, thumb, daily }) {
    let data = load();
    data = touchStreak(data);
    data.stats.colorWins += 1;
    data.stats.totalPlaySec += Math.round(timeMs / 1000);
    if (accuracy > data.stats.bestColorAccuracy) data.stats.bestColorAccuracy = accuracy;
    if (accuracy >= 100) unlock(data, "color_perfect");
    if (daily) {
      data.daily.date = dateKey();
      data.daily.colorDone = true;
    }
    if (thumb) {
      addGallery(data, {
        game: "color",
        name,
        thumb,
        meta: `${gridW}×${gridH} · ${accuracy}%`,
      });
    }
    data = checkAchievements(data);
    save(data);
    return data;
  }

  function recordPuzzleComplete({ timeSec, moves, gridN }) {
    let data = load();
    data = touchStreak(data);
    data.stats.puzzleWins += 1;
    data.stats.totalPlaySec += timeSec;
    if (data.stats.bestPuzzleMoves == null || moves < data.stats.bestPuzzleMoves) {
      data.stats.bestPuzzleMoves = moves;
    }
    if (gridN >= 8) unlock(data, "puzzle_pro");
    data = checkAchievements(data);
    save(data);
    return data;
  }

  function getDailyDemoId() {
    const key = dateKey();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    return DAILY_DEMOS[Math.abs(hash) % DAILY_DEMOS.length];
  }

  function isDailyDone() {
    const data = load();
    return data.daily.date === dateKey() && data.daily.colorDone;
  }

  function hasSeenTutorial(game) {
    return !!load().tutorials[game];
  }

  function markTutorialSeen(game) {
    const data = load();
    data.tutorials[game] = true;
    save(data);
  }

  function getAchievementsList() {
    return ACHIEVEMENTS;
  }

  function getUnlockedAchievements() {
    return load().achievements;
  }

  window.PlayData = {
    load,
    save,
    dateKey,
    getDailyDemoId,
    isDailyDone,
    recordColorComplete,
    recordPuzzleComplete,
    hasSeenTutorial,
    markTutorialSeen,
    getAchievementsList,
    getUnlockedAchievements,
    DAILY_DEMOS,
  };
})();
