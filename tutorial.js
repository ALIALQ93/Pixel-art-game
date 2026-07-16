(() => {
  "use strict";

  const OVERLAY_ID = "tutorial-overlay";

  const STEPS = {
    color: [
      { icon: "📷", title: "اختر صورة", text: "حمّل صورتك أو اختر نموذجاً جاهزاً من المعرض." },
      { icon: "⚙️", title: "اضبط الدقة", text: "كلما كبرت الشبكة زادت التفاصيل — ابدأ بـ «خفيف» أو «متوازن»." },
      { icon: "🎨", title: "لوّن بالرقم", text: "اختر لوناً من القائمة، ثم اضغط البكسلات التي تحمل نفس الرقم." },
      { icon: "💡", title: "استخدم الأدوات", text: "◫ للملء السريع · ◎ للتركيز · 💡 لتلميح البكسل التالي · قرّب بإصبعين على الهاتف." },
    ],
    puzzle: [
      { icon: "🧩", title: "بدّل القطع", text: "اضغط قطعتين لتبديل مكانهما — أو اسحب قطعة فوق أخرى." },
      { icon: "👀", title: "تابع المعاينة", text: "الصورة الصغيرة أعلى اللوحة هي هدفك — مرّر عليها للتكبير." },
      { icon: "📊", title: "اختر الصعوبة", text: "ابدأ بـ 3×3 أو 4×4 ثم جرّب مستويات أصعب." },
    ],
  };

  function buildOverlay(game) {
    const steps = STEPS[game];
    if (!steps) return null;

    const el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.className = "tutorial-overlay";
    el.innerHTML = `
      <div class="tutorial-card" role="dialog" aria-labelledby="tutorial-title">
        <p class="eyebrow">كيف تلعب؟</p>
        <h2 id="tutorial-title">${game === "color" ? "تلوين بالبكسل" : "بازل الصور"}</h2>
        <div class="tutorial-steps">
          ${steps
            .map(
              (s) => `
            <div class="tutorial-step">
              <span class="tutorial-icon">${s.icon}</span>
              <div>
                <strong>${s.title}</strong>
                <p>${s.text}</p>
              </div>
            </div>`
            )
            .join("")}
        </div>
        <button type="button" class="btn primary" id="tutorial-close">فهمت — لنبدأ!</button>
        <button type="button" class="tutorial-skip" id="tutorial-skip">لا تُظهر مرة أخرى</button>
      </div>`;

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));

    el.querySelector("#tutorial-close").addEventListener("click", () => close(false));
    el.querySelector("#tutorial-skip").addEventListener("click", () => close(true));
    el.addEventListener("click", (e) => {
      if (e.target === el) close(false);
    });

    function close(permanent) {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
      if (window.PlayData) {
        if (permanent) PlayData.markTutorialSeen(game);
        else if (!PlayData.hasSeenTutorial(game)) PlayData.markTutorialSeen(game);
      }
    }

    return el;
  }

  function maybeShow(game) {
    if (!window.PlayData || PlayData.hasSeenTutorial(game)) return;
    setTimeout(() => buildOverlay(game), 400);
  }

  window.Tutorial = { maybeShow, buildOverlay };
})();
