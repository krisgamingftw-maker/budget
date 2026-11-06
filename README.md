# התקציב שלנו

אפליקציית תקציב חודשי למשפחות: הוצאות קבועות שעוברות מחודש לחודש, סימון מה שולם, סיכומים אוטומטיים, מטרות חיסכון והיסטוריה.

- כל משפחה נרשמת ומקבלת תקציב פרטי משלה. בן או בת הזוג מצטרפים עם קוד מעמוד ההגדרות.
- הנתונים נשמרים ב-Firebase (Firestore), ורק חברי המשפחה יכולים לקרוא ולכתוב אותם (`firestore.rules`).
- האתר מתארח ב-GitHub Pages ואפשר להתקין אותו למסך הבית.

## Setup
1. Put the Firebase web config in `config.js`.
2. Paste `firestore.rules` into Firebase console → Firestore → Rules → Publish.
3. Enable Email/Password in Firebase Authentication.

Tests (`tests/`) run against the Firebase emulator: `npx firebase emulators:exec --only firestore,auth "node tests/e2e.js"`.
