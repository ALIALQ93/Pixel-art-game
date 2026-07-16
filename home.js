(() => {
  "use strict";

  function renderHome() {
    if (!window.PlayData) return;
    const data = PlayData.load();
    const unlocked = new Set(data.achievements);
    const achievements = PlayData.getAchievementsList();

    const statsEl = document.getElementById("home-stats");
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-pill"><strong>${data.stats.colorWins}</strong><span>لوحات</span></div>
        <div class="stat-pill"><strong>${data.stats.puzzleWins}</strong><span>بازل</span></div>
        <div class="stat-pill"><strong>${data.streak.count}</strong><span>أيام متتالية</span></div>
        <div class="stat-pill"><strong>${unlocked.size}</strong><span>شارات</span></div>`;
    }

    const dailyEl = document.getElementById("daily-card");
    if (dailyEl) {
      const done = PlayData.isDailyDone();
      dailyEl.classList.toggle("daily-done", done);
      dailyEl.querySelector(".daily-status").textContent = done
        ? "✓ أُنجز اليوم"
        : "متاح الآن";
    }

    const achEl = document.getElementById("home-achievements");
    if (achEl) {
      achEl.innerHTML = achievements
        .map((a) => {
          const on = unlocked.has(a.id);
          return `<div class="badge ${on ? "unlocked" : ""}" title="${a.desc}"><span>${a.icon}</span><small>${a.name}</small></div>`;
        })
        .join("");
    }

    const galEl = document.getElementById("home-gallery");
    if (galEl) {
      if (!data.gallery.length) {
        galEl.innerHTML = '<p class="gallery-empty">أكمل أول لوحة لتظهر هنا 🎨</p>';
        return;
      }
      galEl.innerHTML = data.gallery
        .slice(0, 8)
        .map(
          (g) => `
        <figure class="gallery-item" title="${g.meta}">
          <img src="${g.thumb}" alt="${g.name}" loading="lazy" />
          <figcaption>${g.name}</figcaption>
        </figure>`
        )
        .join("");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderHome);
  } else {
    renderHome();
  }
})();
