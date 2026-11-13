# Sentinel Pulse

מפת מחקר: React + Vite + Leaflet, עם Supabase (בסיס נתונים, התחברות, עדכונים בזמן אמת) ואירוח ב-Vercel.
הועבר מ-Base44; הקוד ממשיך לקרוא ל-`base44.entities...`, ו-`src/api/base44Client.js` מתרגם את הקריאות ל-Supabase.

## הקמה

1. **Supabase** — שתי המיגרציות בתיקייה `supabase/migrations/` יוצרות את הטבלאות ומייבאות את כל הנתונים מ-Base44 (כולל כתובת האימייל המורשית). עם חיבור GitHub של Supabase הן רצות אוטומטית בדחיפה לענף `main`; בלי החיבור, הרץ אותן לפי הסדר ב-SQL Editor.
2. **Vercel** — ייבא את הריפו והגדר את משתני הסביבה `VITE_SUPABASE_URL` ו-`VITE_SUPABASE_ANON_KEY` (מ-Supabase > Project Settings > API).
3. **משתמש** — ב-Supabase > Authentication > Users צור משתמש עם אימייל וסיסמה (Auto Confirm User), באותו אימייל שברשימת המורשים. כבה הרשמה ציבורית ב-Authentication > Sign In / Providers > Allow new users to sign up.
4. **AI** — הכלים "חוקר שטח" ו"תרגום" רצים דרך `api/llm.js` על Vercel AI Gateway, בלי מפתח API. נדרש שה-AI Gateway יהיה פעיל בצוות ב-Vercel (אמצעי תשלום רשום; אין חיוב במודלים של ה-Free Tier).

## פרטיות

האתר פרטי: התחברות לבדה לא מספיקה. רק כתובות שמופיעות בטבלה `allowed_emails` יכולות לקרוא או לכתוב נתונים ולהשתמש ב-AI, והבדיקה נעשית במסד הנתונים עצמו.

```sql
insert into public.allowed_emails (email) values ('someone@example.com');
```

## פיתוח מקומי

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run dev
```

## נתונים

`npm run seed` בונה מחדש את מיגרציית הנתונים מקובצי ה-CSV שבתיקייה `data/`.
