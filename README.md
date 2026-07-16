# ألعاب البكسل 🎨

مجموعة ألعاب فنية تفاعلية باللغة العربية — تلوين بالبكسل وبازل الصور.

## الألعاب

| اللعبة | الوصف |
|--------|--------|
| **تلوين بالبكسل** | حمّل صورة، حوّلها إلى شبكة بكسل، ولوّن كل خلية حسب رقمها |
| **بازل الصور** | اجمع قطع الصورة حتى تكتمل — من ٣×٣ إلى ١٦×١٦ |

## التشغيل محلياً

لا يحتاج المشروع أي build أو تثبيت حزم.

```bash
# الطريقة 1: افتح index.html مباشرة في المتصفح

# الطريقة 2: خادم محلي (مُفضّل لـ PWA)
npx serve .
# أو
python -m http.server 8080
```

ثم افتح `http://localhost:8080`

## النشر على GitHub Pages

1. ارفع المشروع إلى GitHub
2. من **Settings → Pages → Build and deployment**:
   - Source: **GitHub Actions**
3. عند كل push على `main`، يُنشر الموقع تلقائياً عبر workflow جاهز في `.github/workflows/pages.yml`

> إذا لم يعمل Actions فوراً، اختر **Deploy from branch** → `main` → `/ (root)`

## الملفات

```
index.html        ← الصفحة الرئيسية
color.html        ← لعبة تلوين بالبكسل
puzzle-game.html  ← لعبة بازل الصور
game.js           ← منطق التلوين وتحويل الصور
style.css         ← التصميم الموحّد
manifest.json     ← إعدادات PWA
sw.js             ← Service Worker للتخزين المؤقت
favicon.svg       ← أيقونة الموقع
```

## الميزات

- واجهة عربية كاملة (RTL)
- تحويل صور متقدم (CIE Lab، median-cut، dithering)
- حفظ واستئناف الجلسة
- تصدير ومشاركة النتيجة
- دعم PWA — يمكن تثبيته على الهاتف
- يعمل بدون إنترنت بعد الزيارة الأولى

## التقنيات

HTML · CSS · JavaScript (Vanilla) — بدون frameworks

---

صنعت بحب لتمضية الوقت ✨
