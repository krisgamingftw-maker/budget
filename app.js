(function () {
  'use strict';
  const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const MONTHS_SHORT = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];
  const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const RING = 2 * Math.PI * 34;
  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const todayKey = keyOf(now.getFullYear(), now.getMonth() + 1);

  const state = {
    fb: null, auth: null, db: null, user: null,
    hid: null, household: null,
    items: [], months: {}, goals: [], savings: [],
    loaded: false, unsubs: [],
    tab: 'vMonth', view: todayKey, showPaid: true,
    sheet: null, depositSign: 1, busy: false,
  };
  try { if (localStorage.getItem('budget-showpaid') === '0') state.showPaid = false; } catch (e) {}

  // ---------- helpers ----------
  function keyOf(y, m) { return y + '-' + String(m).padStart(2, '0'); }
  function shiftKey(k, d) { let [y, m] = k.split('-').map(Number); m += d; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return keyOf(y, m); }
  function monthIndex(k) { const [y, m] = k.split('-').map(Number); return y * 12 + (m - 1); }
  function label(k) { const [y, m] = k.split('-').map(Number); return MONTHS[m - 1] + ' ' + y; }
  function shortLabel(k) { const [y, m] = k.split('-').map(Number); return MONTHS_SHORT[m - 1]; }
  function fmt(n) { return (Math.round(n * 100) / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 }) + ' ₪'; }
  function parseAmount(s) { const n = Number(String(s || '').replace(/[,\s₪]/g, '')); return Number.isFinite(n) ? n : NaN; }

  // live thousands separators in amount fields: 4000 -> 4,000
  function groupNum(v) {
    let t = String(v || '').replace(/[^\d.]/g, '');
    const dot = t.indexOf('.');
    let int = dot >= 0 ? t.slice(0, dot) : t, dec = dot >= 0 ? t.slice(dot + 1).replace(/\./g, '').slice(0, 2) : null;
    int = int.replace(/^0+(?=\d)/, '');
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return dec === null ? int : (int || '0') + '.' + dec;
  }
  ['fAmount', 'fIncome', 'gTarget', 'gStart', 'dAmount', 'svBalance', 'svMonthly', 'sbAmount', 'spAmount'].forEach(id => {
    const inp = $(id);
    inp.addEventListener('input', () => {
      const caret = inp.selectionStart ?? inp.value.length;
      const before = inp.value.slice(0, caret).replace(/[^\d.]/g, '').length;
      const out = groupNum(inp.value);
      if (out === inp.value) return;
      inp.value = out;
      let n = 0, pos = 0;
      while (pos < out.length && n < before) { if (/[\d.]/.test(out[pos])) n++; pos++; }
      try { inp.setSelectionRange(pos, pos); } catch (e) {}
    });
  });
  // ---------- categories ----------
  const CATS = [
    { id: 'home', n: 'בית', e: '🏠' }, { id: 'bills', n: 'חשבונות', e: '💡' }, { id: 'food', n: 'אוכל וסופר', e: '🛒' },
    { id: 'car', n: 'רכב ותחבורה', e: '🚗' }, { id: 'health', n: 'בריאות וטיפוח', e: '💊' }, { id: 'kids', n: 'ילדים וחיות', e: '🐾' },
    { id: 'fun', n: 'בזבוזים ופנאי', e: '🎉' }, { id: 'save', n: 'חיסכון', e: '🐷' }, { id: 'misc', n: 'שונות', e: '📦' }
  ];
  const CAT_COLOR = { home: '#f0ad9a', bills: '#f2c66d', food: '#93cdb0', car: '#94bde3', health: '#e9a3c0', kids: '#c3a7e6', fun: '#f19aae', save: '#7fc9bb', misc: '#c9bdb4' };
  const CAT_SHORT = { home: 'בית', bills: 'חשבונות', food: 'אוכל', car: 'רכב', health: 'בריאות', kids: 'ילדים', fun: 'פנאי', save: 'חיסכון', misc: 'שונות' };
  const CAT_BY = Object.fromEntries(CATS.map(c => [c.id, c]));
  const CAT_WORDS = [
    ['save', /חיסכון|חסכון|הפקדה|השתלמות|פיקדון|פקדון|גמל/],
    ['food', /סופר|מכולת|שוק|אוכל|ירקות|מאפייה|קצב|רמי לוי|שופרסל|ויקטורי|יוחננוף/],
    ['car', /דלק|רכב|חניה|חנייה|טסט|מוסך|ביטוח רכב|רב.?קו|תחבורה|מונית|אוטובוס|כביש/],
    ['bills', /חשמל|מים|גז|ארנונה|אינטרנט|טלפון|סלולר|פלאפון|נטפליקס|ספוטיפיי|מנוי|כבלים|yes|hot|בזק|רואה חשבון|ביטוח לאומי|מס/i],
    ['home', /דירה|שכירות|משכנתא|ועד|בית|ניקיון|רהיט|כלי בית/],
    ['health', /רופא|קופת|תרופ|בית מרקחת|סופר.?פארם|שיניים|טיפול|קוסמטיק|ציפורניים|מספרה|שיער|כושר|חדר כושר|פילאטיס|יוגה|ביטוח בריאות/],
    ['kids', /גן|מעון|צהרון|חוג|ילד|תינוק|חיתול|כלב|חתול|וטרינר|אוכל כלבים|אוכל חתולים/],
    ['fun', /בית קפה|בתי קפה|קפה|מסעד|אוכל בחוץ|וולט|wolt|תן ביס|בילוי|סרט|הופעה|חופשה|טיול|בגדים|קניות|זארה|שופינג|מתנה|אמזון|עלי|shein/i]
  ];
  function guessCat(name) { const t = String(name || ''); for (const [id, re] of CAT_WORDS) if (re.test(t)) return id; return 'misc'; }
  const catOf = (it) => (it && it.cat && CAT_BY[it.cat]) ? it.cat : (it && it.linkType === 'sav' ? 'save' : guessCat(it && it.name));

  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function initial(name) { const m = String(name || '').trim().match(/[\p{L}\p{N}]/u); return m ? m[0] : '•'; }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function newCode() { let s = ''; const a = new Uint32Array(8); crypto.getRandomValues(a); for (const v of a) s += CODE_ABC[v % CODE_ABC.length]; return s; }
  function prettyCode(c) { return c ? c.slice(0, 4) + '-' + c.slice(4) : '—'; }
  function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function show(id) { state.screen = id; ['auth', 'setup', 'unlock', 'loading', 'shell'].forEach(x => { $(x).hidden = x !== id; }); }
  function status(msg) { const e = $('status'); e.textContent = msg || ''; e.hidden = !msg; }

  // ---------- look: palette + light/dark ----------
  const PALETTES = ['peach', 'green', 'blue', 'purple', 'teal', 'sun'];
  const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  let curPalette = 'peach', curTheme = 'auto';
  function applyLook() {
    const r = document.documentElement;
    r.setAttribute('data-palette', curPalette);
    if (curTheme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', curTheme);
    document.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', s.dataset.p === curPalette ? 'true' : 'false'));
    document.querySelectorAll('.seg-btn').forEach(s => s.setAttribute('aria-pressed', s.dataset.t === curTheme ? 'true' : 'false'));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(r).getPropertyValue('--bg').trim() || '#fbf6f2';
  }
  function setPalette(p, save) { curPalette = PALETTES.includes(p) ? p : 'peach'; applyLook(); if (save) { try { localStorage.setItem('budget-look-palette', curPalette); } catch (e) {} } }
  function setTheme(t, save) { curTheme = ['auto', 'light', 'dark'].includes(t) ? t : 'auto'; applyLook(); if (save) { try { localStorage.setItem('budget-look-theme', curTheme); } catch (e) {} } }
  try { curPalette = localStorage.getItem('budget-look-palette') || 'peach'; curTheme = localStorage.getItem('budget-look-theme') || 'auto'; } catch (e) {}
  setPalette(curPalette, false); setTheme(curTheme, false);
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyLook);
  document.querySelectorAll('.swatch').forEach(s => { s.onclick = () => setPalette(s.dataset.p, true); });
  document.querySelectorAll('.seg-btn').forEach(s => { s.onclick = () => setTheme(s.dataset.t, true); });

  // ---------- data paths ----------
  const hh = () => state.db.collection('households').doc(state.hid);
  const itemRef = (id) => hh().collection('items').doc(id);
  const monthRef = (k) => hh().collection('months').doc(k);
  const goalRef = (id) => hh().collection('goals').doc(id);
  const ITEM_SECRET = ['name', 'amount', 'cat'];
  const savRef = (id) => hh().collection('savings').doc(id);
  const SAV_FIELDS = ['name', 'kind', 'balance', 'monthly', 'endDate'];

  function failMsg(e) {
    if (e && e.code === 'permission-denied') return 'אין הרשאה לשמור. נסו לצאת ולהיכנס שוב.';
    if (e && e.code === 'resource-exhausted') return 'הגעתם למכסה היומית. נסו שוב מחר.';
    return 'השמירה לא הצליחה. בדקו את החיבור ונסו שוב.';
  }
  // Firestore saves on the phone right away and syncs when online, so the UI never waits for the server.
  function write(fn) {
    if (!state.db || !state.hid) return false;
    try { const p = fn(); if (p && p.catch) p.catch(e => { status(failMsg(e)); }); return true; }
    catch (e) { status(failMsg(e)); return false; }
  }

  // ---------- family encryption ----------
  // Names and amounts are encrypted on the phone with a random budget key. That key is
  // stored in the budget twice: locked with the family password and with a recovery code.
  // Each device keeps the unlocked key, so the password is typed once per device.
  const te = new TextEncoder(), td = new TextDecoder();
  const ITER = 250000;
  const b64 = (u8) => { let s = ''; u8 = new Uint8Array(u8); for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const decCache = new Map();
  async function deriveKey(secret, salt) {
    const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function aesEnc(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64(out);
  }
  async function aesDec(key, str) { const all = unb64(str); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12))); }
  async function wrapKey(rawKey, secret) { const salt = crypto.getRandomValues(new Uint8Array(16)); return { s: b64(salt), w: await aesEnc(await deriveKey(secret, salt), rawKey) }; }
  async function unwrapKey(wrapped, secret) { return aesDec(await deriveKey(secret, unb64(wrapped.s)), wrapped.w); }
  async function importDataKey(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
  function newRecoveryCode() { let s = ''; const a = new Uint32Array(20); crypto.getRandomValues(a); for (const v of a) s += CODE_ABC[v % CODE_ABC.length]; return s; }
  const prettyRecovery = (c) => c.match(/.{1,5}/g).join('-');
  const dkStoreKey = () => 'budget-dk-' + state.hid;
  function rememberKey(raw) { try { localStorage.setItem(dkStoreKey(), b64(raw)); } catch (e) {} }
  function forgetKeys() { try { Object.keys(localStorage).filter(k => k.startsWith('budget-dk-')).forEach(k => localStorage.removeItem(k)); } catch (e) {} }
  const isEncrypted = () => !!(state.household && state.household.crypto);
  async function seal(obj, fields, merge) {
    if (!isEncrypted() || !state.key) return obj;
    const secret = {}; const rest = Object.assign({}, obj);
    for (const f of fields) { if (f in rest) { secret[f] = rest[f]; delete rest[f]; if (merge) rest[f] = firebase.firestore.FieldValue.delete(); } }
    rest.e = await aesEnc(state.key, te.encode(JSON.stringify(secret)));
    return rest;
  }
  async function openDoc(d) {
    if (!d || !d.e) return d;
    if (!state.key) return Object.assign({}, d, { name: '🔒', locked: true });
    let v = decCache.get(d.e);
    if (!v) { try { v = JSON.parse(td.decode(await aesDec(state.key, d.e))); } catch (err) { v = { name: '(לא ניתן לפענח)' }; } decCache.set(d.e, v); }
    const out = Object.assign({}, d, v); delete out.e; return out;
  }
  async function openGoal(g) {
    const out = await openDoc(g);
    const deps = await Promise.all((Array.isArray(g.deposits) ? g.deposits : []).map(openDoc));
    out.deposits = deps;
    if (g.e || out.saved == null) out.saved = deps.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return out;
  }
  // Items used in parts (like groceries) keep a list of purchases.
  const sealAmount = async (x) => ({ id: x.id || rid(), at: x.at || Date.now(), e: await aesEnc(state.key, te.encode(JSON.stringify({ amount: Number(x.amount) || 0 }))) });
  async function openItem(d) {
    const out = await openDoc(d);
    if (!d || !Array.isArray(d.spends)) return out;
    out.spends = await Promise.all(d.spends.map(openDoc));
    out.spent = out.spends.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    if (out.split) out.paid = out.spent >= (Number(out.amount) || 0) && out.spent > 0;
    return out;
  }
  const raw = { items: [], months: {}, goals: [], savings: [] };
  let decodeRun = 0;
  async function decodeAll() {
    const run = ++decodeRun;
    const items = await Promise.all(raw.items.map(openItem));
    const mk = Object.keys(raw.months); const mv = await Promise.all(mk.map(k => openDoc(raw.months[k])));
    const goals = await Promise.all(raw.goals.map(openGoal));
    const savings = await Promise.all(raw.savings.map(async v => {
      const out = await openDoc(v);
      out.deposits = await Promise.all((Array.isArray(v.deposits) ? v.deposits : []).map(openDoc));
      return out;
    }));
    if (run !== decodeRun) return;
    state.savings = savings;
    state.items = items; state.months = {}; mk.forEach((k, i) => { state.months[k] = mv[i]; }); state.goals = goals;
    render();
  }
  async function tryStoredKey() {
    if (state.key) return true;
    let s = null; try { s = localStorage.getItem(dkStoreKey()); } catch (e) {}
    if (!s) return false;
    try { state.key = await importDataKey(unb64(s)); return true; } catch (e) { return false; }
  }
  async function enableEncryption(pass) {
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const code = newRecoveryCode();
    const cryptoDoc = { v: 1, iter: ITER, p: await wrapKey(rawKey, pass), r: await wrapKey(rawKey, code), at: Date.now() };
    state.key = await importDataKey(rawKey); rememberKey(rawKey);
    state.household = Object.assign({}, state.household, { crypto: cryptoDoc });
    await hh().update({ crypto: cryptoDoc });
    // Encrypt what is already stored.
    const FV = firebase.firestore.FieldValue; const writes = [];
    for (const d of raw.items) {
      const sp = Array.isArray(d.spends) && d.spends.some(x => !x.e);
      if (d.e && !sp) continue;
      const body = d.e ? {} : await seal({ name: d.name || '', amount: Number(d.amount) || 0, cat: d.cat || null }, ITEM_SECRET, true);
      if (sp) body.spends = await Promise.all(d.spends.map(x => x.e ? x : sealAmount(x)));
      writes.push([itemRef(d.id), body]);
    }
    for (const k of Object.keys(raw.months)) { const m = raw.months[k]; if (!m.e && m.income != null) writes.push([monthRef(k), await seal({ income: Number(m.income) || 0 }, ['income'], true)]); }
    for (const g of raw.goals) {
      if (g.e) continue;
      const body = await seal({ name: g.name || '', target: Number(g.target) || 0, deadline: g.deadline || null }, ['name', 'target', 'deadline'], true);
      body.saved = FV.delete();
      const deps = Array.isArray(g.deposits) ? g.deposits : [];
      const known = deps.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const list = deps.slice(); const diff = (Number(g.saved) || 0) - known;
      if (diff) list.push({ id: rid(), amount: diff, at: g.createdAt || Date.now() });
      body.deposits = await Promise.all(list.map(async x => x.e ? x : ({ id: x.id || rid(), at: x.at || Date.now(), e: await aesEnc(state.key, te.encode(JSON.stringify({ amount: Number(x.amount) || 0 }))) })));
      writes.push([goalRef(g.id), body]);
    }
    for (const v of raw.savings) {
      const sp = Array.isArray(v.deposits) && v.deposits.some(x => !x.e);
      if (v.e && !sp) continue;
      const body = {};
      if (!v.e) { const plain = {}; SAV_FIELDS.forEach(f => { plain[f] = v[f] ?? null; }); Object.assign(body, await seal(plain, SAV_FIELDS, true)); }
      if (sp) body.deposits = await Promise.all(v.deposits.map(x => x.e ? x : sealAmount(x)));
      writes.push([savRef(v.id), body]);
    }
    for (let i = 0; i < writes.length; i += 400) { const b = state.db.batch(); writes.slice(i, i + 400).forEach(([r, d]) => b.update(r, d)); await b.commit(); }
    return code;
  }
  async function changeSecret(kind, secret) {
    const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', await currentRawKeyHolder()));
    const c = Object.assign({}, state.household.crypto); c[kind] = await wrapKey(rawKey, secret);
    await hh().update({ crypto: c });
  }
  // The device copy of the key is the extractable one we keep in storage.
  async function currentRawKeyHolder() {
    let s = null; try { s = localStorage.getItem(dkStoreKey()); } catch (e) {}
    if (!s) throw new Error('no-key');
    return crypto.subtle.importKey('raw', unb64(s), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }
  function renderEncCard() {
    const on = isEncrypted();
    $('encTitle').textContent = on ? 'הנתונים מוצפנים' : 'הצפנת הנתונים';
    $('encText').textContent = on
      ? 'שמות וסכומים נשמרים מוצפנים, ורק מי שיודע את הסיסמה המשפחתית יכול לקרוא אותם. גם מנהלת השרת לא.'
      : 'אפשר להצפין את שמות ההוצאות והסכומים עם סיסמה משפחתית, כך שאף אחד מחוץ למשפחה לא יוכל לקרוא אותם, גם לא מנהלת השרת. מקלידים את הסיסמה פעם אחת בכל טלפון, ומקבלים קוד שחזור למקרה ששוכחים.';
    $('encOnBtn').hidden = on; $('encPassBtn').hidden = !on; $('encCodeBtn').hidden = !on;
  }

  // ---------- unlock ----------
  let unlockMode = 'pass';
  function setUnlockMode(m) {
    unlockMode = m; $('uErr').hidden = true;
    $('uPassWrap').hidden = m !== 'pass'; $('uCodeWrap').hidden = m !== 'code';
    $('uSwitch').textContent = m === 'pass' ? 'שכחתי את הסיסמה, יש לי קוד שחזור' : 'יש לי את הסיסמה המשפחתית';
  }
  $('uSwitch').onclick = () => setUnlockMode(unlockMode === 'pass' ? 'code' : 'pass');
  $('uLogout').onclick = () => { forgetKeys(); state.key = null; decCache.clear(); state.auth && state.auth.signOut(); };
  $('unlockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = state.household && state.household.crypto; if (!c) return;
    const secret = unlockMode === 'pass' ? $('uPass').value : cleanCode($('uCode').value);
    if (!secret) return;
    $('uBtn').disabled = true; $('uBtn').textContent = 'פותח…'; $('uErr').hidden = true;
    try {
      const rawKey = await unwrapKey(unlockMode === 'pass' ? c.p : c.r, secret);
      state.key = await importDataKey(rawKey); rememberKey(rawKey);
      $('uPass').value = ''; $('uCode').value = '';
      show('shell'); setTab('vMonth'); decodeAll();
      if (unlockMode === 'code') openSheet('encpass', { reset: true });
    } catch (err) {
      $('uErr').textContent = unlockMode === 'pass' ? 'הסיסמה לא נכונה. נסו שוב.' : 'קוד השחזור לא נכון. בדקו שהוא הוקלד במלואו.';
      $('uErr').hidden = false;
    }
    $('uBtn').disabled = false; $('uBtn').textContent = 'פתיחה';
  });
  $('encOnBtn').onclick = () => openSheet('encpass', { enable: true });
  $('encPassBtn').onclick = () => openSheet('encpass', {});
  $('encCodeBtn').onclick = async () => {
    try { const code = newRecoveryCode(); await changeSecret('r', code); openSheet('recovery', { code }); }
    catch (e) { status('לא הצלחנו ליצור קוד חדש. בדקו את החיבור ונסו שוב.'); }
  };
  $('recCopy').onclick = async () => { try { await navigator.clipboard.writeText($('recCode').textContent); $('recCopy').textContent = 'הועתק'; } catch (e) { const r = document.createRange(); r.selectNodeContents($('recCode')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } setTimeout(() => { $('recCopy').textContent = 'העתקה'; }, 2000); };
  $('recEmail').onclick = () => {
    const to = (state.user && state.user.email) || '';
    const name = (state.household && state.household.name) || 'התקציב';
    const body = 'קוד השחזור של "' + name + '" באפליקציית התקציב:\n\n' + $('recCode').textContent + '\n\nצריך אותו רק אם שוכחים את הסיסמה המשפחתית. אל תשתפו אותו עם אף אחד מחוץ למשפחה.\n\n' + location.origin + location.pathname;
    location.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent('קוד שחזור לתקציב') + '&body=' + encodeURIComponent(body);
  };
  $('recSaved').onchange = () => { $('saveBtn').disabled = !$('recSaved').checked; };

  // ---------- tabs ----------
  function setTab(t) {
    state.tab = t;
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== t; });
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.v === t ? 'true' : 'false'));
    const fab = $('fab');
    fab.hidden = !(t === 'vMonth' || t === 'vGoals' || t === 'vSavings');
    $('fabText').textContent = t === 'vGoals' ? 'מטרה חדשה' : t === 'vSavings' ? 'חיסכון חדש' : 'הוצאה חדשה';
    window.scrollTo(0, 0);
    render();
  }
  document.querySelectorAll('.tab').forEach(b => { b.onclick = () => setTab(b.dataset.v); });

  // ---------- render ----------
  function monthItems(k) { return state.items.filter(i => i.month === k).sort((a, b) => (a.order || 0) - (b.order || 0)); }
  function sourceMonth(k) {
    const ks = [...new Set(state.items.map(i => i.month))].filter(m => m < k).sort();
    return ks.length ? ks[ks.length - 1] : null;
  }
  function render() {
    if (!state.hid) return;
    renderMonth();
    if (state.tab === 'vGoals') renderGoals();
    if (state.tab === 'vSavings') renderSavings();
    if (state.sheet && state.sheet.mode === 'spend') { const it = state.items.find(x => x.id === state.sheet.id); if (it) renderSpendSheet(it); }
    if (state.tab === 'vHistory') renderHistory();
    if (state.tab === 'vSettings') renderSettings();
  }

  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const REPEAT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>';
  const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';

  // A split item counts what was spent so far; going over its budget raises the total.
  const isSplit = (i) => !!i.split;
  const itemTotal = (i) => isSplit(i) ? Math.max(Number(i.amount) || 0, i.spent || 0) : (Number(i.amount) || 0);
  const itemPaid = (i) => isSplit(i) ? (i.paid ? itemTotal(i) : (i.spent || 0)) : (i.paid ? (Number(i.amount) || 0) : 0);
  function monthStats(k) {
    const items = monthItems(k);
    const total = items.reduce((s, i) => s + itemTotal(i), 0);
    const paid = items.reduce((s, i) => s + itemPaid(i), 0);
    const income = Number((state.months[k] || {}).income) || 0;
    return { items, total, paid, income };
  }

  function renderMonth() {
    const k = state.view;
    $('monthTitle').textContent = label(k);
    $('monthSub').textContent = '';
    $('todayWrap').hidden = k === todayKey;

    const { items, total, paid, income } = monthStats(k);
    const left = total - paid;
    const pct = total > 0 ? Math.round(paid / total * 100) : 0;
    const allDone = items.length > 0 && left === 0;
    $('remain').textContent = fmt(left);
    $('remainLabel').textContent = allDone ? 'הכל שולם החודש 🎉' : 'נשאר לשלם החודש';
    $('sTotal').textContent = fmt(total);
    $('sPaid').textContent = fmt(paid);
    $('ringPct').textContent = pct + '%';
    $('pcPaid').style.width = pct + '%';
    const hr = new Date().getHours();
    const hello = hr >= 5 && hr < 12 ? 'בוקר טוב' : hr < 17 && hr >= 12 ? 'צהריים טובים' : hr >= 17 && hr < 22 ? 'ערב טוב' : 'לילה טוב';
    const hn = ((state.household && state.household.name) || '').trim();
    $('greet').textContent = hello + (hn && hn !== 'התקציב שלנו' ? ', ' + hn : '') + ' 👋';
    if (income) {
      const b = income - total;
      $('incomeLbl').textContent = 'הכנסה'; $('incomeAmt').textContent = fmt(income);
      $('afterChip').hidden = false;
      $('incomeText').textContent = b >= 0 ? 'יישאר אחרי ההוצאות' : 'חריגה של';
      $('balance').textContent = fmt(Math.abs(b));
      $('afterChip').classList.toggle('over', b < 0);
    } else { $('incomeLbl').textContent = '+ הוספת הכנסה'; $('incomeAmt').textContent = ''; $('afterChip').hidden = true; }

    const src = sourceMonth(k);
    const mdoc = state.months[k] || {};
    const srcRec = src ? monthItems(src).filter(i => i.recurring) : [];
    const have = new Set(items.map(i => i.seriesId).filter(Boolean));
    const missing = srcRec.filter(i => !have.has(i.seriesId));
    const showCarry = state.loaded && !mdoc.carried && missing.length > 0;
    $('carry').hidden = !showCarry;
    if (showCarry) {
      const p = $('carryText'); p.textContent = '';
      p.append(el('b', '', missing.length + ' הוצאות קבועות'), ' מ' + label(src) + ' בסך ' + fmt(missing.reduce((s, i) => s + (Number(i.amount) || 0), 0)) + '. הן ייכנסו כלא שולמו, ואפשר לשנות סכומים אחר כך.');
      $('carryBtn').disabled = state.busy;
    }

    renderCats(items);
    const shown = state.catFilter ? items.filter(i => catOf(i) === state.catFilter) : items;
    const open = shown.filter(i => !i.paid), done = shown.filter(i => i.paid);
    const ol = $('openList'); ol.textContent = '';
    if (!state.loaded && !state.items.length) ol.append(el('li', 'empty', 'טוען…'));
    else if (!items.length) ol.append(el('li', 'empty', 'אין עדיין הוצאות ב' + label(k) + '. לחצו על "הוצאה חדשה" למטה.'));
    else if (!open.length) ol.append(el('li', 'all-paid', 'כל ההוצאות של החודש שולמו'));
    else open.forEach(it => ol.append(rowEl(it)));
    $('openMeta').textContent = open.length ? (open.length === 1 ? 'פריט אחד' : open.length + ' פריטים') : '';
    $('paidSec').hidden = done.length === 0;
    const bulkOpen = open.filter(i => !isSplit(i)), bulkDone = done.filter(i => !isSplit(i));
    $('payAllBtn').hidden = bulkOpen.length < 2; $('unpayAllBtn').hidden = bulkDone.length < 2;
    if (!bulkArmed) { $('payAllBtn').textContent = 'סימון הכל כשולם'; $('unpayAllBtn').textContent = 'ביטול הכל'; }
    $('togglePaid').textContent = (state.showPaid ? 'הסתרה' : 'הצגה') + ' (' + done.length + ')';
    const pl = $('paidList'); pl.textContent = ''; pl.hidden = !state.showPaid;
    if (state.showPaid) done.forEach(it => pl.append(rowEl(it)));
  }


  // ---------- swipe left to delete ----------
  const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';
  const SWIPE_W = 92;
  let openSwipe = null;
  function closeSwipe(except) {
    if (openSwipe && openSwipe !== except) { openSwipe.close(); }
  }
  document.addEventListener('pointerdown', e => { if (openSwipe && !openSwipe.outer.contains(e.target)) closeSwipe(); }, true);
  function swipeable(outer, name, onDelete) {
    const inner = el('div', 'swipe-in');
    while (outer.firstChild) inner.append(outer.firstChild);
    const del = el('button', 'swipe-del'); del.type = 'button';
    del.innerHTML = TRASH_SVG; const dl = el('span', '', 'מחיקה'); del.append(dl);
    del.setAttribute('aria-label', 'מחיקת ' + name); del.tabIndex = -1;
    outer.classList.add('swipeable'); outer.append(del, inner);
    let x0 = 0, y0 = 0, base = 0, pos = 0, mode = null, id = null, armed = false, armTimer = null, justSwiped = false;
    const set = (v, anim) => { pos = v; outer.classList.toggle('swiped', v !== 0); inner.style.transition = anim ? '' : 'none'; inner.style.transform = v ? 'translateX(' + v + 'px)' : ''; };
    const ctl = { outer, close() { set(0, true); disarm(); if (openSwipe === ctl) openSwipe = null; } };
    function disarm() { armed = false; clearTimeout(armTimer); outer.classList.remove('armed'); dl.textContent = 'מחיקה'; }
    inner.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      x0 = e.clientX; y0 = e.clientY; base = pos; mode = null; id = e.pointerId;
    });
    inner.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!mode) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { mode = 'scroll'; return; }
        if (Math.abs(dx) > 10) { mode = 'swipe'; closeSwipe(ctl); try { inner.setPointerCapture(id); } catch (err) {} }
        else return;
      }
      if (mode !== 'swipe') return;
      let v = base + dx;
      if (v > 0) v = 0;
      if (v < -SWIPE_W) v = -SWIPE_W + (v + SWIPE_W) * 0.25;
      set(v, false);
    });
    const end = e => {
      if (e.pointerId !== id) return; id = null;
      if (mode !== 'swipe') return;
      if (pos < -SWIPE_W / 2) { set(-SWIPE_W, true); openSwipe = ctl; } else ctl.close();
      // swallow the click that follows a mouse drag
      justSwiped = true; setTimeout(() => { justSwiped = false; }, 60);
    };
    inner.addEventListener('pointerup', end);
    inner.addEventListener('pointercancel', e => { if (e.pointerId === id && mode === 'swipe') end(e); else id = null; });
    // a tap on an open row closes it instead of opening the editor
    inner.addEventListener('click', e => {
      if (justSwiped) { e.stopPropagation(); e.preventDefault(); return; }
      if (pos !== 0) { e.stopPropagation(); e.preventDefault(); ctl.close(); }
    }, true);
    del.onclick = () => {
      if (!armed) { armed = true; outer.classList.add('armed'); dl.textContent = 'בטוח?'; armTimer = setTimeout(disarm, 3000); return; }
      disarm(); openSwipe = null; outer.classList.add('removing');
      onDelete();
    };
    return outer;
  }

  function renderCats(items) {
    const box = $('catList'); box.textContent = '';
    const by = {};
    for (const i of items) { const c = catOf(i); (by[c] = by[c] || { total: 0, paid: 0, n: 0 }); by[c].total += itemTotal(i); by[c].paid += itemPaid(i); by[c].n++; }
    const ids = CATS.map(c => c.id).filter(id => by[id]).sort((a, b) => by[b].total - by[a].total);
    $('catSec').hidden = ids.length < 2 && !state.catFilter;
    for (const id of ids) {
      const c = CAT_BY[id], d = by[id];
      const b = el('button', 'cat-row' + (state.catFilter === id ? ' on' : '')); b.type = 'button';
      b.style.setProperty('--cc', CAT_COLOR[id]);
      b.setAttribute('aria-pressed', state.catFilter === id ? 'true' : 'false');
      b.setAttribute('aria-label', c.n + ' ' + fmt(d.total));
      b.append(el('span', 'cat-ico', c.e), el('b', 'num', fmt(d.total)), el('span', 'cat-name', CAT_SHORT[id] || c.n));
      b.onclick = () => { state.catFilter = state.catFilter === id ? null : id; render(); if (state.catFilter) $('openList').closest('.section').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      box.append(b);
    }
    const fl = $('catFilterNote');
    fl.hidden = !state.catFilter;
    if (state.catFilter) { const c = CAT_BY[state.catFilter]; $('catFilterText').textContent = 'מוצג רק: ' + c.e + ' ' + c.n; }
  }
  $('catClear').onclick = () => { state.catFilter = null; render(); };

  function rowEl(it) {
    const row = el('li', 'row' + (it.paid ? ' paid' : ''));
    row.style.setProperty('--cc', CAT_COLOR[catOf(it)]);
    const body = el('button', 'row-body'); body.setAttribute('aria-label', 'עריכת ' + it.name);
    const av = el('span', 'avatar', initial(it.name)); av.setAttribute('aria-hidden', 'true');
    const tx = el('span', 'row-text');
    tx.append(el('span', 'row-name', it.name));
    if (isSplit(it)) {
      const amt = Number(it.amount) || 0, spent = it.spent || 0, rest = amt - spent;
      const sub = el('span', 'row-sub split-sub' + (rest < 0 ? ' over' : ''));
      const cc = CAT_BY[catOf(it)]; sub.append(cc.e + ' ');
      sub.append(rest >= 0 ? 'נשארו ' : 'חריגה של ', el('b', 'num', fmt(Math.abs(rest))), ' מתוך ' + fmt(amt));
      const bar = el('span', 'split-bar'); const f = el('i'); f.style.width = (amt > 0 ? Math.min(100, spent / amt * 100) : 100) + '%'; bar.append(f);
      tx.append(sub, bar);
      body.append(av, tx, el('span', 'row-amt num', fmt(spent)));
      body.onclick = () => openSheet('spend', it);
    } else {
      const tgt = linkTarget(it); const c = CAT_BY[catOf(it)];
      const sub = el('span', 'row-sub');
      sub.append(el('span', 'cat-tag', c.e + ' ' + c.n));
      if (it.recurring) { sub.append(' · '); const r = el('span', 'rep'); r.innerHTML = REPEAT_SVG; sub.append(r, 'קבוע'); }
      if (tgt) sub.append(' · הפקדה ל' + tgt.name);
      tx.append(sub);
      body.append(av, tx, el('span', 'row-amt num', fmt(Number(it.amount) || 0)));
      body.onclick = () => openSheet('edit', it);
    }
    if (isSplit(it)) {
      const add = el('button', 'check add'); add.innerHTML = PLUS_SVG; add.setAttribute('aria-label', 'הוספת קנייה: ' + it.name);
      add.onclick = () => openSheet('spend', it);
      row.append(body, add);
      return swipeable(row, it.name, () => deleteItem(it));
    }
    const chk = el('button', 'check'); chk.innerHTML = CHECK_SVG;
    chk.setAttribute('aria-pressed', it.paid ? 'true' : 'false');
    chk.setAttribute('aria-label', (it.paid ? 'בטל סימון שולם: ' : 'סמן כשולם: ') + it.name);
    chk.onclick = () => togglePaid(it);
    row.append(body, chk);
    return swipeable(row, it.name, () => deleteItem(it));
  }

  // ---------- goals ----------
  const GOAL_ICONS = [[/טיול|יפן|חופשה|טיסה|חו"ל|חול|נסיעה/, '✈️'], [/מחשב|לפטופ|טלפון|אייפון|טאבלט/, '💻'], [/יום הולדת|מתנה|הולדת/, '🎁'], [/רכב|אוטו|מכונית/, '🚗'], [/דירה|בית|משכנתא|שיפוץ/, '🏡'], [/חתונה|טבעת/, '💍'], [/לימוד|תואר|קורס/, '🎓'], [/תינוק|לידה|ילד/, '🍼'], [/חירום|ביטחון/, '🛟']];
  const TILE_TINTS = ['#f6c7b6', '#a9d4bd', '#c9b2e6', '#f3cf86', '#94bde3', '#f19aae'];
  function goalIcon(name) { for (const [re, e] of GOAL_ICONS) if (re.test(name || '')) return e; return '🎯'; }
  function savIcon(v) { const t = (v.kind || '') + ' ' + (v.name || ''); return /השתלמות/.test(t) ? '🎓' : /פיקדון|פקדון/.test(t) ? '🔒' : /גמל|פנסי/.test(t) ? '🏦' : /ילד/.test(t) ? '🧸' : /מניות|השקע|תיק/.test(t) ? '📈' : '🌱'; }
  function tile(emoji, i) { const t = el('span', 'tile', emoji); t.style.setProperty('--tt', TILE_TINTS[i % TILE_TINTS.length]); t.setAttribute('aria-hidden', 'true'); return t; }
  function summaryCard(label, value, sub, pct) {
    const c = el('div', 'sum-card');
    const tx = el('div', 'sum-text');
    tx.append(el('div', 'k', label), el('div', 'v num', value));
    if (sub) tx.append(el('div', 's', sub));
    if (pct != null) {
      const r = el('div', 'sum-ring'); const p = Math.max(0, Math.min(100, pct));
      r.style.setProperty('--p', p);
      r.append(el('span', 'num', p + '%'));
      c.append(r);
    }
    c.prepend(tx);
    return c;
  }
  function renderGoals() {
    const wrap = $('goalsWrap'); wrap.textContent = '';
    const goals = state.goals.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (!goals.length) {
      const c = el('div', 'empty-card');
      c.append(el('b', '', 'עוד אין מטרות חיסכון'), el('span', '', 'לחצו על "מטרה חדשה" כדי להתחיל לחסוך לטיול, לרכב חדש או לכל דבר אחר.'));
      wrap.append(c); return;
    }
    const totalSaved = goals.reduce((s, g) => s + (Number(g.saved) || 0), 0);
    const totalTarget = goals.reduce((s, g) => s + (Number(g.target) || 0), 0);
    wrap.append(summaryCard('נחסך בכל המטרות', fmt(totalSaved), 'מתוך ' + fmt(totalTarget), totalTarget > 0 ? Math.round(totalSaved / totalTarget * 100) : 0));
    const nowIdx = monthIndex(todayKey);
    goals.forEach((g, gi) => {
      const saved = Number(g.saved) || 0, target = Number(g.target) || 0;
      const pct = target > 0 ? Math.min(100, Math.round(saved / target * 100)) : 0;
      const done = target > 0 && saved >= target;
      const card = el('article', 'goal' + (done ? ' done' : ''));
      const head = el('div', 'goal-head');
      const av = tile(goalIcon(g.name), gi);
      const title = el('div', 'goal-title');
      title.append(el('b', '', g.name), el('small', '', g.deadline ? 'יעד: ' + label(g.deadline) : 'בלי תאריך יעד'));
      const edit = el('button', 'goal-edit'); edit.innerHTML = EDIT_SVG; edit.setAttribute('aria-label', 'עריכת ' + g.name);
      edit.onclick = () => openSheet('goalEdit', g);
      head.append(av, title, edit);
      const nums = el('div', 'goal-nums');
      nums.append(el('span', 'goal-saved num', fmt(saved)), el('span', 'goal-target', 'מתוך ' + fmt(target) + ' · ' + pct + '%'));
      const bar = el('div', 'pbar'); const fill = el('span'); fill.style.width = pct + '%'; bar.append(fill);
      const foot = el('div', 'goal-foot');
      const tip = el('span', 'goal-tip');
      const remaining = Math.max(0, target - saved);
      if (done) tip.append(el('span', 'badge', 'הושג!'));
      else if (g.deadline) {
        const left = monthIndex(g.deadline) - nowIdx + 1;
        if (left > 0) { tip.append('כדי להגיע בזמן: '); tip.append(el('b', 'num', fmt(Math.ceil(remaining / left)))); tip.append(' בחודש'); }
        else { tip.append('תאריך היעד עבר. נשארו '); tip.append(el('b', 'num', fmt(remaining))); }
      } else { tip.append('נשארו '); tip.append(el('b', 'num', fmt(remaining))); }
      const dep = el('button', 'btn small', 'הפקדה'); dep.type = 'button';
      dep.onclick = () => openSheet('deposit', g);
      foot.append(tip, dep);
      card.append(head, nums, bar, foot);
      const deps = Array.isArray(g.deposits) ? g.deposits.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 3) : [];
      if (deps.length) {
        const ul = el('ul', 'deposits');
        for (const d of deps) {
          const li = el('li');
          const dt = new Date(d.at || 0);
          li.append(el('span', '', (d.amount >= 0 ? 'הפקדה' : 'משיכה') + ' · ' + dt.getDate() + '.' + (dt.getMonth() + 1) + '.' + String(dt.getFullYear()).slice(2)));
          li.append(el('span', 'num ' + (d.amount >= 0 ? 'plus' : 'minus'), (d.amount >= 0 ? '+' : '−') + fmt(Math.abs(d.amount))));
          ul.append(li);
        }
        card.append(ul);
      }
      wrap.append(swipeable(card, g.name, () => write(() => goalRef(g.id).delete())));
    });
  }


  // ---------- savings ----------
  function dateKey(ms) { const d = new Date(ms || Date.now()); return keyOf(d.getFullYear(), d.getMonth() + 1); }
  function shortDate(ms) { const d = new Date(ms || 0); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(2); }
  // Months of fixed deposits since the balance was last entered.
  function savMonthsSince(v) { return v.updatedAt ? Math.max(0, monthIndex(todayKey) - monthIndex(dateKey(v.updatedAt))) : 0; }
  // A saving fed by an expense line counts the deposits recorded since the last balance update;
  // otherwise the fixed monthly deposit is assumed.
  const savLinked = (v) => state.items.some(i => i.linkType === 'sav' && i.linkId === v.id && !i.split);
  const savNewDeps = (v) => (v.deposits || []).filter(d => (d.at || 0) > (v.updatedAt || 0));
  function savEstimate(v) {
    if (savLinked(v)) return (Number(v.balance) || 0) + savNewDeps(v).reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return (Number(v.balance) || 0) + (Number(v.monthly) || 0) * savMonthsSince(v);
  }
  function renderSavings() {
    const wrap = $('savWrap'); wrap.textContent = '';
    const list = state.savings.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (!list.length) {
      const c = el('div', 'empty-card');
      c.append(el('b', '', 'עוד אין חסכונות'), el('span', '', 'לחצו על "חיסכון חדש" כדי להוסיף קרן השתלמות, פיקדון או כל חיסכון אחר, עם הפקדה חודשית קבועה אם יש.'));
      wrap.append(c); return;
    }
    const total = list.reduce((s, v) => s + savEstimate(v), 0);
    const monthlyTotal = list.reduce((s, v) => s + (Number(v.monthly) || 0), 0);
    wrap.append(summaryCard('סך כל החסכונות', fmt(Math.round(total)), monthlyTotal ? 'הפקדות קבועות: ' + fmt(monthlyTotal) + ' בכל חודש' : '', null));
    const nowIdx = monthIndex(todayKey);
    list.forEach((v, vi) => {
      const card = el('article', 'goal');
      const head = el('div', 'goal-head');
      const av = tile(savIcon(v), vi + 1);
      const title = el('div', 'goal-title');
      title.append(el('b', '', v.name), el('small', '', (v.kind || 'חיסכון') + (v.endDate ? ' · משתחרר ב' + label(v.endDate) : '')));
      const edit = el('button', 'goal-edit'); edit.innerHTML = EDIT_SVG; edit.setAttribute('aria-label', 'עריכת ' + v.name);
      edit.onclick = () => openSheet('savEdit', v);
      head.append(av, title, edit);
      const est = savEstimate(v), since = savMonthsSince(v), monthly = Number(v.monthly) || 0;
      const nums = el('div', 'goal-nums');
      nums.append(el('span', 'goal-saved num', fmt(Math.round(est))));
      const linked = savLinked(v), nd = savNewDeps(v);
      if (linked && nd.length) nums.append(el('span', 'sav-est', 'כולל ' + (nd.length === 1 ? 'הפקדה אחת' : nd.length + ' הפקדות') + ' מהתקציב מאז העדכון'));
      else if (!linked && since && monthly) nums.append(el('span', 'sav-est', 'משוער, כולל ' + (since === 1 ? 'הפקדה אחת' : since + ' הפקדות') + ' מאז העדכון'));
      const facts = el('ul', 'sav-facts');
      const fact = (k, val) => { const li = el('li'); li.append(el('span', '', k), el('b', 'num', val)); facts.append(li); };
      if (monthly) fact('הפקדה קבועה בחודש', fmt(monthly));
      if (linked) { const ln = state.items.find(i => i.linkType === 'sav' && i.linkId === v.id); fact('מקושר להוצאה', ln ? ln.name : ''); }
      if ((linked && nd.length) || (!linked && since && monthly)) fact('יתרה בעדכון האחרון', fmt(Number(v.balance) || 0));
      if (v.endDate && monthly) { const left = monthIndex(v.endDate) - nowIdx; if (left > 0) fact('צפי ב' + label(v.endDate), fmt(Math.round(est + monthly * left))); }
      fact('עודכן לאחרונה', shortDate(v.updatedAt || v.createdAt));
      const foot = el('div', 'goal-foot');
      foot.append(el('span', 'goal-tip', ''));
      const upd = el('button', 'btn small', 'עדכון יתרה'); upd.type = 'button';
      upd.onclick = () => openSheet('savBal', v);
      foot.append(upd);
      card.append(head, nums, facts, foot);
      wrap.append(swipeable(card, v.name, () => write(() => savRef(v.id).delete())));
    });
  }

  // ---------- history ----------
  function monthsWithData() {
    const s = new Set(state.items.map(i => i.month));
    Object.keys(state.months).forEach(k => { if ((state.months[k] || {}).income) s.add(k); });
    return [...s].filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
  }
  function renderHistory() {
    const keys = monthsWithData();
    const chartCard = $('chartCard');
    chartCard.hidden = keys.length === 0;
    if (keys.length) {
      const last = keys.slice(-12);
      const totals = last.map(k => monthStats(k).total);
      const max = Math.max(1, ...totals);
      const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
      $('chartAvg').textContent = 'ממוצע ' + fmt(Math.round(avg));
      const chart = $('chart'); chart.textContent = '';
      const bars = el('div', 'bars'); const labels = el('div', 'labels');
      last.forEach((k, i) => {
        const b = el('button', 'bar-col' + (k === state.view ? ' cur' : ''));
        b.type = 'button'; b.setAttribute('aria-label', label(k) + ': ' + fmt(totals[i]));
        const fill = el('i'); fill.style.height = (totals[i] / max * 100) + '%';
        b.append(fill); b.onclick = () => { state.view = k; setTab('vMonth'); };
        bars.append(b);
        labels.append(el('small', '', shortLabel(k)));
      });
      if (last.length > 1) {
        const line = el('div', 'avg'); line.style.bottom = (avg / max * 100) + '%';
        bars.append(line);
      }
      chart.append(bars, labels);
    }

    const list = $('histList'); list.textContent = '';
    if (!keys.length) {
      const c = el('div', 'empty-card');
      c.append(el('b', '', 'עוד אין היסטוריה'), el('span', '', 'אחרי שתוסיפו הוצאות, כל חודש יופיע כאן עם הסיכום שלו.'));
      list.append(c);
    }
    for (const k of keys.slice().reverse()) {
      const { items, total, paid, income } = monthStats(k);
      const card = el('button', 'hist'); card.type = 'button';
      const top = el('div', 'hist-top'); top.append(el('b', '', label(k)), el('span', 'num', fmt(total)));
      const row = el('div', 'hist-row');
      row.append(el('span', '', items.length + ' הוצאות'), el('span', '', 'שולם ' + fmt(paid)));
      if (income) {
        const b = income - total;
        row.append(el('span', '', 'הכנסה ' + fmt(income)));
        row.append(el('span', b >= 0 ? 'pos' : 'neg', (b >= 0 ? 'נשאר ' : 'חריגה ') + fmt(Math.abs(b))));
      }
      card.append(top, row);
      card.onclick = () => { state.view = k; setTab('vMonth'); };
      list.append(card);
    }
    renderSearch();
  }
  function renderSearch() {
    const q = $('hSearch').value.trim().toLowerCase();
    const box = $('hResults');
    if (!q) { box.hidden = true; box.textContent = ''; return; }
    const hits = state.items.filter(i => String(i.name || '').toLowerCase().includes(q)).sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
    box.hidden = false; box.textContent = '';
    if (!hits.length) { box.append(el('div', 'sum', 'לא נמצאו הוצאות בשם הזה.')); return; }
    const sum = hits.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const head = el('div', 'sum');
    head.append('נמצאו ', el('b', '', String(hits.length)), ' פעמים · סה״כ ', el('b', 'num', fmt(sum)), ' · ממוצע ', el('b', 'num', fmt(Math.round(sum / hits.length))));
    const ul = el('ul');
    hits.slice(0, 60).forEach(i => {
      const li = el('li');
      const a = el('span'); a.append(i.name, el('small', '', label(i.month) + (i.paid ? ' · שולם' : ' · לא שולם')));
      li.append(a, el('span', 'num', fmt(Number(i.amount) || 0)));
      ul.append(li);
    });
    box.append(head, ul);
  }
  $('hSearch').addEventListener('input', renderSearch);

  // ---------- settings ----------
  function renderSettings() {
    const h = state.household || {};
    $('hhName').textContent = h.name || 'התקציב שלנו';
    const emails = h.emails ? Object.values(h.emails) : [];
    $('hhMembers').textContent = emails.length ? 'משתמשים בתקציב: ' + emails.join(', ') : '';
    $('codeText').textContent = prettyCode(state.hid);
    renderEncCard();
    $('whoami').textContent = 'מחוברים בתור ' + ((state.user && state.user.email) || '');
  }
  $('copyCode').onclick = async () => {
    const text = prettyCode(state.hid);
    try { await navigator.clipboard.writeText(text); $('copyCode').textContent = 'הועתק'; }
    catch (e) { const r = document.createRange(); r.selectNodeContents($('codeText')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    setTimeout(() => { $('copyCode').textContent = 'העתקה'; }, 2000);
  };
  const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');
  async function shareOrCopy(btn, data, label) {
    if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText((data.text ? data.text + '\n' : '') + data.url); btn.textContent = 'הקישור הועתק'; }
    catch (e) { btn.textContent = data.url; }
    setTimeout(() => { btn.textContent = label; }, 2500);
  }
  $('shareCodeBtn').onclick = () => shareOrCopy($('shareCodeBtn'), { title: 'התקציב שלנו', text: 'הצטרפות לתקציב המשותף שלנו: פותחים את הקישור, נרשמים, בוחרים "הצטרפות לתקציב קיים" ומקלידים את הקוד ' + prettyCode(state.hid) + '\n(אם כבר יש לך תקציב: הגדרות ← הצטרפות עם קוד)', url: APP_URL }, 'שליחת הקוד והקישור');
  $('renameBtn').onclick = () => openSheet('rename');
  $('joinOtherBtn').onclick = () => openSheet('joinOther');
  $('logoutBtn').onclick = () => { forgetKeys(); state.key = null; decCache.clear(); state.auth && state.auth.signOut(); };
  $('sLogout').onclick = () => { forgetKeys(); state.key = null; decCache.clear(); state.auth && state.auth.signOut(); };

  // ---------- sheet ----------
  const GROUP = { add: 'item', edit: 'item', income: 'income', goalNew: 'goal', goalEdit: 'goal', deposit: 'deposit', rename: 'rename', encpass: 'encpass', recovery: 'recovery', savNew: 'saving', savEdit: 'saving', savBal: 'savbal', spend: 'spend', joinOther: 'joinother', scan: 'scan' };
  function openSheet(mode, obj) {
    state.sheet = { mode, id: obj ? obj.id : null };
    document.querySelectorAll('.sgroup').forEach(g => { g.hidden = g.dataset.for !== GROUP[mode]; });
    sheetError('');
    $('confirmBox').hidden = true; $('sheetActions').hidden = false;
    $('deleteBtn').hidden = !(mode === 'edit' || mode === 'goalEdit' || mode === 'savEdit');
    $('saveBtn').textContent = mode === 'deposit' ? 'שמירה' : 'שמירה';
    let focus = null;
    if (mode === 'add') { $('sheetTitle').textContent = 'הוצאה חדשה ב' + label(state.view); $('fName').value = ''; $('fAmount').value = ''; $('fRec').checked = false; $('fSplit').checked = false; fillLink(null); setCat(state.catFilter || null, !state.catFilter); focus = 'fAmount'; }
    if (mode === 'edit') { $('sheetTitle').textContent = 'עריכת הוצאה'; $('fName').value = obj.name; $('fAmount').value = groupNum(obj.amount ?? ''); $('fRec').checked = !!obj.recurring; $('fSplit').checked = !!obj.split; fillLink(obj); setCat(catOf(obj), !obj.cat); }
    if (mode === 'income') { $('sheetTitle').textContent = 'הכנסה ב' + label(state.view); const inc = Number((state.months[state.view] || {}).income) || 0; $('fIncome').value = inc ? groupNum(inc) : ''; focus = 'fIncome'; }
    if (mode === 'goalNew') { $('sheetTitle').textContent = 'מטרה חדשה'; $('gName').value = ''; $('gTarget').value = ''; $('gDate').value = ''; $('gStart').value = ''; $('gStartWrap').hidden = false; focus = 'gName'; }
    if (mode === 'goalEdit') { $('sheetTitle').textContent = 'עריכת מטרה'; $('gName').value = obj.name; $('gTarget').value = groupNum(obj.target ?? ''); $('gDate').value = obj.deadline || ''; $('gStartWrap').hidden = true; }
    if (mode === 'deposit') { $('sheetTitle').textContent = obj.name; $('dAmount').value = ''; setDepositSign(1); focus = 'dAmount'; }
    if (mode === 'scan') { $('sheetTitle').textContent = 'סריקת הוצאות'; }
    $('scanBtn').hidden = mode !== 'add';
    if (mode === 'joinOther') { $('sheetTitle').textContent = 'הצטרפות לתקציב משותף'; $('joCode').value = ''; $('joNote').textContent = 'התקציב הנוכחי שלכם לא נמחק. אם תרצו לחזור אליו, הקוד שלו הוא ' + prettyCode(state.hid) + '. כדאי לשמור אותו.'; focus = 'joCode'; }
    if (mode === 'spend') { $('sheetTitle').textContent = obj.name; $('spAmount').value = ''; renderSpendSheet(obj); focus = 'spAmount'; }
    if (mode === 'savNew') { $('sheetTitle').textContent = 'חיסכון חדש'; $('svName').value = ''; $('svKind').value = 'קרן השתלמות'; $('svBalance').value = ''; $('svMonthly').value = ''; $('svEnd').value = ''; focus = 'svName'; }
    if (mode === 'savEdit') { $('sheetTitle').textContent = 'עריכת חיסכון'; $('svName').value = obj.name || ''; $('svKind').value = obj.kind || 'אחר'; $('svBalance').value = groupNum(obj.balance ?? ''); $('svMonthly').value = obj.monthly ? groupNum(obj.monthly) : ''; $('svEnd').value = obj.endDate || ''; }
    if (mode === 'savBal') { $('sheetTitle').textContent = obj.name; $('sbNote').textContent = 'הכניסו את הסכום שמופיע עכשיו בדוח או באפליקציה של הבנק. ההערכה של ההפקדות הקבועות תתחיל מחדש מהיום.'; $('sbAmount').value = ''; $('sbAmount').placeholder = groupNum(Math.round(savEstimate(obj))); focus = 'sbAmount'; }
    if (mode === 'encpass') {
      state.sheet.enable = !!obj.enable; state.sheet.reset = !!obj.reset;
      $('sheetTitle').textContent = obj.enable ? 'הפעלת הצפנה' : 'סיסמה משפחתית חדשה';
      $('epNote').textContent = obj.enable ? 'בחרו סיסמה שכל המשפחה תזכור. תקלידו אותה פעם אחת בכל טלפון. בשלב הבא תקבלו קוד שחזור.' : obj.reset ? 'נכנסתם עם קוד השחזור. בחרו עכשיו סיסמה משפחתית חדשה.' : 'הסיסמה החדשה תחליף את הקודמת. טלפונים שכבר פתוחים ימשיכו לעבוד.';
      $('epPass').value = ''; $('epPass2').value = ''; focus = 'epPass';
    }
    if (mode === 'recovery') { $('sheetTitle').textContent = 'קוד שחזור'; $('recCode').textContent = prettyRecovery(obj.code); $('recSaved').checked = false; }
    if (mode === 'rename') { $('sheetTitle').textContent = 'שם התקציב'; $('rName').value = (state.household && state.household.name) || ''; focus = 'rName'; }
    $('saveBtn').textContent = mode === 'scan' ? 'הוספה' : mode === 'joinOther' ? 'הצטרפות' : mode === 'recovery' ? 'סיום' : mode === 'encpass' && obj && obj.enable ? 'המשך' : 'שמירה';
    $('saveBtn').disabled = mode === 'recovery';
    $('cancelBtn').hidden = mode === 'recovery';
    $('scrim').hidden = false; $('sheet').hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { $('scrim').classList.add('open'); $('sheet').classList.add('open'); }));
    if (focus) setTimeout(() => $(focus).focus(), 260);
  }
  function closeSheet() {
    if (state.sheet && state.sheet.mode === 'scan') scanToken++;
    if (state.sheet && state.sheet.mode === 'recovery' && !$('recSaved').checked) return;
    state.sheet = null; $('saveBtn').disabled = false; $('cancelBtn').hidden = false;
    $('scrim').classList.remove('open'); $('sheet').classList.remove('open');
    if (document.activeElement) document.activeElement.blur();
    setTimeout(() => { if (!state.sheet) { $('scrim').hidden = true; $('sheet').hidden = true; } }, 260);
  }
  function sheetError(msg) { const e = $('sheetError'); e.textContent = msg || ''; e.hidden = !msg; }
  function setDepositSign(s) { state.depositSign = s; $('dIn').setAttribute('aria-pressed', s > 0 ? 'true' : 'false'); $('dOut').setAttribute('aria-pressed', s < 0 ? 'true' : 'false'); }
  $('dIn').onclick = () => setDepositSign(1);
  $('dOut').onclick = () => setDepositSign(-1);

  async function submitSheet(e) {
    e.preventDefault();
    const s = state.sheet; if (!s) return;
    if (s.mode === 'recovery') { if ($('recSaved').checked) closeSheet(); return; }
    if (s.mode === 'encpass') {
      const p1 = $('epPass').value, p2 = $('epPass2').value;
      if (p1.length < 4) { sheetError('הסיסמה צריכה לפחות 4 תווים.'); return $('epPass').focus(); }
      if (p1 !== p2) { sheetError('הסיסמאות לא זהות.'); return $('epPass2').focus(); }
      $('saveBtn').disabled = true; $('saveBtn').textContent = 'רגע…';
      try {
        if (s.enable) { const code = await enableEncryption(p1); state.sheet = null; openSheet('recovery', { code }); decodeAll(); }
        else { await changeSecret('p', p1); closeSheet(); status('הסיסמה המשפחתית עודכנה.'); setTimeout(() => status(''), 4000); }
      } catch (err) { sheetError('הפעולה לא הצליחה. בדקו שיש אינטרנט ונסו שוב.'); $('saveBtn').disabled = false; $('saveBtn').textContent = 'שמירה'; }
      return;
    }
    const FV = firebase.firestore.FieldValue;
    if (s.mode === 'add' || s.mode === 'edit') {
      const name = $('fName').value.trim(); const amtRaw = $('fAmount').value.trim(); const amount = parseAmount(amtRaw);
      if (!amtRaw || !Number.isFinite(amount) || amount < 0) { sheetError('צריך לכתוב סכום, למשל 350.'); return $('fAmount').focus(); }
      if (!name) { sheetError('צריך לכתוב על מה ההוצאה.'); return $('fName').focus(); }
      const recurring = $('fRec').checked, split = $('fSplit').checked, cat = pickedCat || guessCat(name);
      const lv = split ? '' : $('fLink').value; const linkType = lv ? lv.split(':')[0] : null, linkId = lv ? lv.split(':')[1] : null;
      if (s.mode === 'add') {
        const items = monthItems(state.view);
        const order = items.length ? Math.max(...items.map(i => i.order || 0)) + 1 : 1;
        const doc = { month: state.view, name, amount, paid: false, recurring, order, split, linkType, linkId, cat };
        if (recurring) doc.seriesId = rid();
        write(async () => itemRef(state.view + '_' + rid()).set(await seal(doc, ITEM_SECRET)));
      } else {
        const it = state.items.find(x => x.id === s.id); if (!it) return closeSheet();
        const patch = { name, amount, recurring, split, linkType, linkId, cat };
        if (recurring && !it.seriesId) patch.seriesId = rid();
        const after = Object.assign({}, it, patch);
        const relink = it.paid && (it.linkId !== linkId || Number(it.amount) !== amount || !!it.split !== split);
        write(async () => {
          if (relink) await linkDeposit(it, false);
          await itemRef(it.id).update(await seal(patch, ITEM_SECRET, true));
          if (relink) return linkDeposit(after, true);
        });
      }
      return closeSheet();
    }
    if (s.mode === 'scan') {
      const rows = [...$('scanList').querySelectorAll('li')].filter(li => li.querySelector('input[type=checkbox]').checked)
        .map(li => ({ name: li.querySelector('.nm').value.trim(), amount: parseAmount(li.querySelector('.amt').value) }))
        .filter(r => r.name && Number.isFinite(r.amount) && r.amount > 0);
      if (!rows.length) return sheetError('לא נבחרו הוצאות להוספה.');
      const recurring = $('scanRec').checked, k = state.view;
      const items = monthItems(k); let order = items.length ? Math.max(...items.map(i => i.order || 0)) : 0;
      write(async () => {
        const b = state.db.batch();
        for (const r of rows) {
          const doc = { month: k, name: r.name, amount: r.amount, paid: false, recurring, order: ++order, split: false, linkType: null, linkId: null, cat: guessCat(r.name) };
          if (recurring) doc.seriesId = rid();
          b.set(itemRef(k + '_' + rid()), await seal(doc, ITEM_SECRET));
        }
        return b.commit();
      });
      scanToken++;
      return closeSheet();
    }
    if (s.mode === 'joinOther') {
      const code = cleanCode($('joCode').value);
      if (code.length !== 8) { sheetError('הקוד צריך להיות 8 תווים, כמו ABCD-2345.'); return $('joCode').focus(); }
      if (code === state.hid) return sheetError('זה הקוד של התקציב שאתם כבר נמצאים בו.');
      const u = state.user; $('saveBtn').disabled = true;
      try {
        const ref = state.db.collection('households').doc(code);
        const snap = await ref.get();
        if (!snap.exists) { $('saveBtn').disabled = false; return sheetError('לא מצאנו תקציב עם הקוד הזה. בדקו שהוא הוקלד נכון.'); }
        const members = (snap.data().members) || [];
        if (!members.includes(u.uid)) await ref.update({ members: firebase.firestore.FieldValue.arrayUnion(u.uid), ['emails.' + u.uid]: u.email || '' });
        await state.db.collection('users').doc(u.uid).set({ householdId: code }, { merge: true });
      } catch (err) { $('saveBtn').disabled = false; return sheetError('ההצטרפות לא הצליחה. בדקו את החיבור ונסו שוב.'); }
      $('saveBtn').disabled = false; closeSheet(); openHousehold(code);
      return;
    }
    if (s.mode === 'spend') {
      const r = $('spAmount').value.trim(); const a = parseAmount(r);
      if (!r || !Number.isFinite(a) || a <= 0) { sheetError('כמה עלתה הקנייה? למשל 350.'); return $('spAmount').focus(); }
      const it = raw.items.find(x => x.id === s.id); if (!it) return closeSheet();
      const entry = { id: rid(), amount: a, at: Date.now() };
      write(async () => itemRef(s.id).update({ spends: FV.arrayUnion(it.e && state.key ? await sealAmount(entry) : entry) }));
      return closeSheet();
    }
    if (s.mode === 'income') {
      const raw = $('fIncome').value.trim(); const val = raw === '' ? 0 : parseAmount(raw);
      if (!Number.isFinite(val) || val < 0) return sheetError('ההכנסה צריכה להיות מספר, למשל 15000.');
      const mk = state.view; write(async () => monthRef(mk).set(await seal({ income: val }, ['income'], true), { merge: true }));
      return closeSheet();
    }
    if (s.mode === 'goalNew' || s.mode === 'goalEdit') {
      const name = $('gName').value.trim(); const target = parseAmount($('gTarget').value);
      const deadline = /^\d{4}-\d{2}$/.test($('gDate').value) ? $('gDate').value : null;
      if (!name) { sheetError('צריך לתת שם למטרה.'); return $('gName').focus(); }
      if (!Number.isFinite(target) || target <= 0) { sheetError('צריך לכתוב כמה רוצים לחסוך, למשל 8000.'); return $('gTarget').focus(); }
      if (s.mode === 'goalNew') {
        const start = $('gStart').value.trim() ? parseAmount($('gStart').value) : 0;
        if (!Number.isFinite(start) || start < 0) return sheetError('הסכום שכבר נחסך צריך להיות מספר.');
        const dep = start ? [{ id: rid(), amount: start, at: Date.now() }] : [];
        write(async () => {
          const doc = await seal({ name, target, deadline, saved: start, createdAt: Date.now() }, ['name', 'target', 'deadline']);
          if (doc.e) delete doc.saved;
          doc.deposits = doc.e ? await Promise.all(dep.map(async x => ({ id: x.id, at: x.at, e: await aesEnc(state.key, te.encode(JSON.stringify({ amount: x.amount }))) }))) : dep;
          return goalRef(rid()).set(doc);
        });
      } else {
        write(async () => goalRef(s.id).update(await seal({ name, target, deadline }, ['name', 'target', 'deadline'], true)));
      }
      return closeSheet();
    }
    if (s.mode === 'deposit') {
      const a = parseAmount($('dAmount').value);
      if (!$('dAmount').value.trim() || !Number.isFinite(a) || a <= 0) { sheetError('צריך לכתוב סכום, למשל 500.'); return $('dAmount').focus(); }
      const amount = a * state.depositSign;
      const g = raw.goals.find(x => x.id === s.id) || {};
      write(async () => {
        if (g.e && state.key) return goalRef(s.id).update({ deposits: FV.arrayUnion({ id: rid(), at: Date.now(), e: await aesEnc(state.key, te.encode(JSON.stringify({ amount }))) }) });
        return goalRef(s.id).update({ saved: FV.increment(amount), deposits: FV.arrayUnion({ id: rid(), amount, at: Date.now() }) });
      });
      return closeSheet();
    }
    if (s.mode === 'savNew' || s.mode === 'savEdit') {
      const name = $('svName').value.trim(); const kind = $('svKind').value;
      const balRaw = $('svBalance').value.trim(); const balance = balRaw ? parseAmount(balRaw) : 0;
      const monRaw = $('svMonthly').value.trim(); const monthly = monRaw ? parseAmount(monRaw) : 0;
      const endDate = /^\d{4}-\d{2}$/.test($('svEnd').value) ? $('svEnd').value : null;
      if (!name) { sheetError('צריך לתת שם, למשל "קרן השתלמות".'); return $('svName').focus(); }
      if (!Number.isFinite(balance) || balance < 0) { sheetError('היתרה צריכה להיות מספר, למשל 25,000.'); return $('svBalance').focus(); }
      if (!Number.isFinite(monthly) || monthly < 0) { sheetError('ההפקדה החודשית צריכה להיות מספר.'); return $('svMonthly').focus(); }
      const body = { name, kind, balance, monthly, endDate };
      if (s.mode === 'savNew') {
        const sid = rid();
        write(async () => { await savRef(sid).set(Object.assign(await seal(body, SAV_FIELDS), { createdAt: Date.now(), updatedAt: Date.now() })); return syncSavingExpense(sid, name, monthly); });
      } else {
        const old = state.savings.find(x => x.id === s.id) || {};
        const extra = (Number(old.balance) || 0) !== balance || (Number(old.monthly) || 0) !== monthly ? { updatedAt: Date.now() } : {};
        write(async () => { await savRef(s.id).update(Object.assign(await seal(body, SAV_FIELDS, true), extra)); return syncSavingExpense(s.id, name, monthly); });
      }
      return closeSheet();
    }
    if (s.mode === 'savBal') {
      const r = $('sbAmount').value.trim(); const balance = parseAmount(r);
      if (!r || !Number.isFinite(balance) || balance < 0) { sheetError('צריך לכתוב את היתרה, למשל 25,000.'); return $('sbAmount').focus(); }
      const old = state.savings.find(x => x.id === s.id) || {};
      const body = {}; SAV_FIELDS.forEach(f => { body[f] = old[f] ?? null; }); body.balance = balance;
      write(async () => savRef(s.id).update(Object.assign(await seal(body, SAV_FIELDS, true), { updatedAt: Date.now() })));
      return closeSheet();
    }
    if (s.mode === 'rename') {
      const name = $('rName').value.trim();
      if (!name) return sheetError('צריך לכתוב שם.');
      write(() => hh().update({ name }));
      return closeSheet();
    }
  }
  $('sheet').addEventListener('submit', submitSheet);
  $('cancelBtn').onclick = closeSheet;
  $('scrim').onclick = closeSheet;
  $('deleteBtn').onclick = () => {
    const s = state.sheet || {};
    const name = s.mode === 'goalEdit' ? (state.goals.find(g => g.id === s.id) || {}).name : s.mode === 'savEdit' ? (state.savings.find(g => g.id === s.id) || {}).name : (state.items.find(i => i.id === s.id) || {}).name;
    $('confirmText').textContent = 'למחוק את "' + (name || '') + '"?';
    $('confirmBox').hidden = false; $('sheetActions').hidden = true;
  };
  $('confirmNo').onclick = () => { $('confirmBox').hidden = true; $('sheetActions').hidden = false; };
  $('confirmYes').onclick = () => {
    const s = state.sheet || {}; if (!s.id) return;
    if (s.mode === 'goalEdit') write(() => goalRef(s.id).delete());
    else if (s.mode === 'savEdit') write(() => savRef(s.id).delete());
    else { const it = state.items.find(x => x.id === s.id); if (it) deleteItem(it); }
    closeSheet();
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.sheet) closeSheet(); });

  let pickedCat = null, catAuto = true;
  function setCat(id, auto) {
    catAuto = !!auto; pickedCat = id || guessCat($('fName').value);
    document.querySelectorAll('#fCats button').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === pickedCat ? 'true' : 'false'));
  }
  (function buildCatChips() {
    const box = $('fCats');
    for (const c of CATS) { const b = el('button', 'chip', c.e + ' ' + c.n); b.type = 'button'; b.dataset.c = c.id; b.onclick = () => setCat(c.id, false); box.append(b); }
  })();
  $('fName').addEventListener('input', () => { if (catAuto) setCat(null, true); });
  $('fLink').addEventListener('change', () => { if (catAuto && $('fLink').value.startsWith('sav:')) setCat('save', true); });
  // ---------- scan expenses from a picture (runs on the phone, nothing is uploaded) ----------
  let scanToken = 0, tessLoading = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!tessLoading) tessLoading = new Promise((res, rej) => {
      const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      sc.onload = () => res(window.Tesseract); sc.onerror = () => { tessLoading = null; rej(new Error('load')); }; document.head.append(sc);
    });
    return tessLoading;
  }
  async function prepImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(3, Math.max(1, 1600 / img.naturalWidth));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, cv.width, cv.height);
      const d = cx.getImageData(0, 0, cv.width, cv.height), p = d.data; let sum = 0;
      for (let i = 0; i < p.length; i += 4) { const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = g; sum += g; }
      if (sum / (p.length / 4) < 128) for (let i = 0; i < p.length; i += 4) { p[i] = p[i + 1] = p[i + 2] = 255 - p[i]; } // dark mode screenshot
      cx.putImageData(d, 0, 0);
      return cv;
    } finally { URL.revokeObjectURL(url); }
  }
  // Turn recognised text into {name, amount} lines.
  function parseScan(text) {
    const out = [];
    for (let line of String(text || '').split(/\n+/)) {
      line = line.replace(/[\u200e\u200f\u202a-\u202e]/g, '');
      line = line.replace(/₪|ש"ח|ש״ח|\bשח\b|nis/gi, ' ').trim();
      if (!line) continue;
      if (/^(ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s*\d{4}$|^\d{4}\s*(ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)$/.test(line)) continue; // a month title
      const MONTHS_RE = '(?:ינו(?:אר)?|פבר(?:ואר)?|מרץ|מרס|אפר(?:יל)?|מאי|יוני?|יולי?|אוג(?:וסט)?|ספט(?:מבר)?|אוק(?:טובר)?|נוב(?:מבר)?|דצמ(?:בר)?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z׳\']*';
      const noDates = line
        .replace(/\d{1,4}\s*[./\-]\s*\d{1,2}\s*[./\-]\s*\d{1,4}/g, ' ')            // 08/11/2026, 2026-11-08, 8 . 11 . 26
        .replace(/(^|[^\d,.])(\d{1,2})\s*([./])\s*(\d{1,2})(?![\d,])/g, (m, p, d, sep, mo) => // 08/11, 8.11 (but not a price like 12.50 alone)
          (Number(d) >= 1 && Number(d) <= 31 && Number(mo) >= 1 && Number(mo) <= 12 && (sep === '/' || (line.match(/\d+/g) || []).length > 2)) ? p + ' ' : m)
        .replace(new RegExp('\\d{1,2}\\s*(?:ב|ל)?' + MONTHS_RE + '(?:\\s*\\d{2,4})?', 'gi'), ' ') // 8 בנובמבר 2026
        .replace(new RegExp(MONTHS_RE + '\\s*\\d{2,4}', 'gi'), ' ')                // נובמבר 2026
        .replace(/\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?/g, ' ')                     // 14:29
        .replace(/(^|\D)(?:19|20)\d{2}(?=\D|$)/g, (m, p) => p + ' ')               // a lone year
        .replace(/\*+\s*\d{4}|\d{4}\s*\*+/g, ' ');                                  // card digits ****1234
      const nums = noDates.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g);
      if (!nums) continue;
      const cand = nums.map(n => ({ n, v: Number(n.replace(/,/g, '')) })).filter(x => x.v > 0 && x.v < 1000000);
      if (!cand.length) continue;
      const score = (x) => (/[.,]/.test(x.n) ? 2 : 0) + (x.v >= 1 ? 1 : 0);
      const best = cand.reduce((a, b) => (score(b) > score(a) || (score(b) === score(a) && b.v > a.v) ? b : a));
      const amount = best.v;
      // Keep other numbers in the name (like "3 months"), drop the amount and stray symbols such as ✅.
      const i = noDates.lastIndexOf(best.n);
      const name = (noDates.slice(0, i) + ' ' + noDates.slice(i + best.n.length))
        .replace(/[^\u0590-\u05FFA-Za-z0-9\s'"״׳-]/g, ' ').replace(/(^|\s)[-'"]+(?=\s|$)/g, ' ')
        .replace(/\s+/g, ' ').trim().replace(/^\d\s+|\s+\d$/g, '').trim(); // a lone digit at the edge is usually a misread icon
      const letters = (w) => (w.match(/[\u0590-\u05FFA-Za-z]/g) || []).length;
      const words = name.split(' ').filter(Boolean);
      if (!(words.some(w => letters(w) >= 3) || (words.length === 1 && letters(words[0]) >= 2))) continue; // skips status-bar noise
      const total = /סה\s*["״']?\s*כ|סך\s*ה?כו?ל|total|יתרה/i.test(noDates);
      out.push({ name, amount, on: !total });
    }
    return out;
  }
  function renderScanRows(rows) {
    const ul = $('scanList'); ul.textContent = '';
    for (const r of rows) {
      const li = el('li', r.on ? '' : 'off');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = r.on; cb.setAttribute('aria-label', 'להוסיף את ' + r.name);
      cb.onchange = () => { li.classList.toggle('off', !cb.checked); updateScanCount(); };
      const nm = document.createElement('input'); nm.type = 'text'; nm.className = 'nm'; nm.value = r.name; nm.maxLength = 80;
      const am = document.createElement('input'); am.type = 'text'; am.className = 'amt num'; am.inputMode = 'decimal'; am.value = groupNum(r.amount);
      am.addEventListener('input', () => { am.value = groupNum(am.value); });
      li.append(cb, nm, am); ul.append(li);
    }
    updateScanCount();
  }
  function updateScanCount() {
    const n = [...$('scanList').querySelectorAll('input[type=checkbox]')].filter(c => c.checked).length;
    $('saveBtn').textContent = n ? 'הוספת ' + (n === 1 ? 'הוצאה אחת' : n + ' הוצאות') : 'הוספה';
    $('saveBtn').disabled = !n;
  }
  $('scanBtn').onclick = () => { $('scanFile').value = ''; $('scanFile').click(); };
  $('scanFile').onchange = async () => {
    const file = $('scanFile').files && $('scanFile').files[0]; if (!file) return;
    const token = ++scanToken;
    openSheet('scan');
    $('scanList').textContent = ''; $('scanNote').hidden = true; $('scanRecRow').hidden = true; $('scanRec').checked = false;
    $('scanStatus').hidden = false; $('scanStatusText').textContent = 'טוען את כלי הסריקה…'; $('scanProg').style.width = '5%';
    $('saveBtn').disabled = true;
    let worker = null;
    try {
      const T = await loadTesseract();
      const canvas = await prepImage(file);
      if (token !== scanToken) return;
      worker = await T.createWorker('heb', 1, { logger: m => {
        if (token !== scanToken) return;
        if (m.status === 'recognizing text') { $('scanStatusText').textContent = 'קורא את התמונה…'; $('scanProg').style.width = (20 + m.progress * 80) + '%'; }
        else if (/load|initializ/.test(m.status || '')) { $('scanStatusText').textContent = 'מכין את הסריקה…'; $('scanProg').style.width = (5 + (m.progress || 0) * 15) + '%'; }
      } });
      const { data } = await worker.recognize(canvas);
      if (token !== scanToken) return;
      const rows = parseScan(data && data.text);
      $('scanStatus').hidden = true;
      if (!rows.length) { $('scanNote').hidden = false; $('scanNote').textContent = 'לא מצאתי בתמונה שורות עם שם וסכום. נסו צילום מסך חד יותר, או תמונה שבה כל הוצאה בשורה משלה.'; return; }
      $('scanNote').hidden = false; $('scanNote').textContent = 'מצאתי ' + rows.length + ' שורות. בדקו ותקנו שמות וסכומים, והורידו את הסימון ממה שלא צריך.';
      $('scanRecRow').hidden = false;
      renderScanRows(rows);
    } catch (err) {
      if (token !== scanToken) return;
      $('scanStatus').hidden = true; $('scanNote').hidden = false;
      $('scanNote').textContent = navigator.onLine === false ? 'צריך חיבור לאינטרנט בפעם הראשונה כדי לטעון את כלי הסריקה.' : 'הסריקה לא הצליחה. נסו שוב או תמונה אחרת.';
    } finally { if (worker) worker.terminate().catch(() => {}); }
  };
  function fillLink(it) {
    const sel = $('fLink'); sel.textContent = '';
    sel.append(new Option('לא, הוצאה רגילה', ''));
    const add = (label, list, type) => { if (!list.length) return; const g = document.createElement('optgroup'); g.label = label; list.forEach(x => g.append(new Option(x.name, type + ':' + x.id))); sel.append(g); };
    add('מטרות', state.goals.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), 'goal');
    add('חסכונות', state.savings.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), 'sav');
    sel.value = it && it.linkId ? it.linkType + ':' + it.linkId : '';
    if (sel.value === '' && it && it.linkId) sel.value = '';
    $('fLinkWrap').hidden = !state.goals.length && !state.savings.length;
    syncLinkVis();
  }
  function syncLinkVis() { $('fLinkWrap').classList.toggle('dim', $('fSplit').checked); $('fLink').disabled = $('fSplit').checked; }
  $('fSplit').addEventListener('change', syncLinkVis);
  function renderSpendSheet(it) {
    const amt = Number(it.amount) || 0, spent = it.spent || 0, rest = amt - spent;
    const sum = $('spSummary'); sum.textContent = '';
    sum.append(el('span', '', rest >= 0 ? 'נשארו' : 'חריגה של'), el('b', 'num', fmt(Math.abs(rest))), el('small', '', 'נוצלו ' + fmt(spent) + ' מתוך ' + fmt(amt)));
    sum.classList.toggle('over', rest < 0);
    const ul = $('spList'); ul.textContent = '';
    const list = (it.spends || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
    $('spListWrap').hidden = !list.length;
    for (const x of list) {
      const li = el('li');
      li.append(el('span', '', shortDate(x.at)), el('b', 'num', fmt(Number(x.amount) || 0)));
      const del = el('button', 'sp-del'); del.type = 'button'; del.textContent = '×'; del.setAttribute('aria-label', 'מחיקת הקנייה');
      del.onclick = () => {
        if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = 'למחוק?'; setTimeout(() => { del.classList.remove('armed'); del.textContent = '×'; }, 3000); return; }
        const r = raw.items.find(y => y.id === it.id); const orig = r && (r.spends || []).find(y => y.id === x.id);
        if (orig) write(() => itemRef(it.id).update({ spends: firebase.firestore.FieldValue.arrayRemove(orig) }));
        li.remove();
      };
      li.append(del); ul.append(li);
    }
  }
  $('spEdit').onclick = () => { const it = state.items.find(x => x.id === (state.sheet || {}).id); if (it) openSheet('edit', it); };
  // An expense can feed a goal or a saving: marking it paid records a deposit there.
  const linkTarget = (it) => it && !it.split && it.linkId ? (it.linkType === 'goal' ? state.goals.find(g => g.id === it.linkId) : it.linkType === 'sav' ? state.savings.find(v => v.id === it.linkId) : null) : null;
  const linkDepId = (it) => 'item_' + it.id;
  async function linkDeposit(it, on) {
    if (!it || it.split || !it.linkId) return;
    const FV = firebase.firestore.FieldValue;
    const ref = it.linkType === 'goal' ? goalRef(it.linkId) : it.linkType === 'sav' ? savRef(it.linkId) : null;
    if (!ref) return;
    const rawDoc = (it.linkType === 'goal' ? raw.goals : raw.savings).find(x => x.id === it.linkId);
    if (!rawDoc) return; // the goal or saving was deleted
    const encrypted = !!rawDoc.e && state.key;
    const old = (Array.isArray(rawDoc.deposits) ? rawDoc.deposits : []).find(x => x.id === linkDepId(it));
    if (on) {
      if (old) return;
      const amount = Number(it.amount) || 0; if (!amount) return;
      const entry = { id: linkDepId(it), amount, at: Date.now(), fromItem: true };
      const body = { deposits: FV.arrayUnion(encrypted ? Object.assign(await sealAmount(entry), { fromItem: true }) : entry) };
      if (it.linkType === 'goal' && !encrypted) body.saved = FV.increment(amount);
      return ref.update(body);
    }
    if (!old) return;
    const body = { deposits: FV.arrayRemove(old) };
    if (it.linkType === 'goal' && !encrypted && typeof old.amount === 'number') body.saved = FV.increment(-old.amount);
    return ref.update(body);
  }
  // A saving with a fixed monthly deposit gets a matching recurring expense in the current month,
  // linked to it, so paying it records the deposit.
  async function syncSavingExpense(savId, name, monthly) {
    const k = todayKey;
    const existing = state.items.find(i => i.month === k && i.linkType === 'sav' && i.linkId === savId && !i.split);
    if (monthly > 0) {
      if (existing) {
        if (Number(existing.amount) === monthly) return;
        if (existing.paid) await linkDeposit(existing, false);
        await itemRef(existing.id).update(await seal({ name: existing.name, amount: monthly, cat: catOf(existing) }, ITEM_SECRET, true));
        if (existing.paid) await linkDeposit(Object.assign({}, existing, { amount: monthly }), true);
        return;
      }
      const items = monthItems(k);
      const order = items.length ? Math.max(...items.map(i => i.order || 0)) + 1 : 1;
      const doc = { month: k, name: 'הפקדה ל' + name, amount: monthly, paid: false, recurring: true, seriesId: rid(), order, split: false, linkType: 'sav', linkId: savId, cat: 'save' };
      return itemRef(k + '_' + rid()).set(await seal(doc, ITEM_SECRET));
    }
    if (existing && !existing.paid) return itemRef(existing.id).delete();
  }
  function deleteItem(it) {
    write(async () => { if (it.paid) await linkDeposit(it, false); return itemRef(it.id).delete(); });
  }
  // Mark (or unmark) every regular line of the month at once. Budgets used in parts follow their purchases.
  let bulkArmed = null, bulkTimer = null;
  function bulkPaid(paid) {
    const btn = $(paid ? 'payAllBtn' : 'unpayAllBtn');
    if (bulkArmed !== btn) {
      disarmBulk(); bulkArmed = btn; btn.classList.add('armed'); btn.textContent = 'בטוח? לחצו שוב';
      bulkTimer = setTimeout(() => { disarmBulk(); render(); }, 3000); return;
    }
    disarmBulk();
    const list = monthItems(state.view).filter(i => !isSplit(i) && !!i.paid !== paid);
    if (!list.length) return;
    const ids = new Set(list.map(i => i.id));
    state.items = state.items.map(x => ids.has(x.id) ? Object.assign({}, x, { paid }) : x);
    render();
    write(async () => {
      const b = state.db.batch(); list.forEach(it => b.update(itemRef(it.id), { paid })); await b.commit();
      for (const it of list) await linkDeposit(Object.assign({}, it, { paid }), paid);
    });
  }
  function disarmBulk() { clearTimeout(bulkTimer); if (bulkArmed) bulkArmed.classList.remove('armed'); bulkArmed = null; }
  $('payAllBtn').onclick = () => bulkPaid(true);
  $('unpayAllBtn').onclick = () => bulkPaid(false);
  function togglePaid(it) {
    const paid = !it.paid;
    state.items = state.items.map(x => x.id === it.id ? Object.assign({}, x, { paid }) : x);
    render();
    write(async () => { await itemRef(it.id).update({ paid }); return linkDeposit(Object.assign({}, it, { paid }), paid); });
  }
  function carryOver() {
    const k = state.view; const src = sourceMonth(k); if (!src) return;
    const have = new Set(monthItems(k).map(i => i.seriesId).filter(Boolean));
    const rec = monthItems(src).filter(i => i.recurring && !have.has(i.seriesId));
    write(async () => {
      const batch = state.db.batch();
      // Same id on both phones, so tapping together still adds each item once.
      for (const it of rec) batch.set(itemRef(k + '_' + it.seriesId), await seal({ month: k, name: it.name, amount: Number(it.amount) || 0, paid: false, recurring: true, seriesId: it.seriesId, order: it.order || 0, split: !!it.split, linkType: it.linkType || null, linkId: it.linkId || null, cat: catOf(it) }, ITEM_SECRET));
      batch.set(monthRef(k), { carried: true }, { merge: true });
      return batch.commit();
    });
  }

  // ---------- month events ----------
  function go(k) { state.view = k; state.catFilter = null; render(); }
  $('prev').onclick = () => go(shiftKey(state.view, -1));
  $('next').onclick = () => go(shiftKey(state.view, 1));
  $('toToday').onclick = () => go(todayKey);
  $('togglePaid').onclick = () => { state.showPaid = !state.showPaid; try { localStorage.setItem('budget-showpaid', state.showPaid ? '1' : '0'); } catch (e) {} render(); };
  $('incomeBtn').onclick = () => openSheet('income');
  $('carryBtn').onclick = carryOver;
  $('fab').onclick = () => openSheet(state.tab === 'vGoals' ? 'goalNew' : state.tab === 'vSavings' ? 'savNew' : 'add');

  // ---------- auth ----------
  let authMode = 'login';
  function setAuthMode(m) {
    authMode = m;
    $('aErr').hidden = true; $('aOk').hidden = true;
    $('aPassWrap').hidden = m === 'reset';
    $('aPass').setAttribute('autocomplete', m === 'signup' ? 'new-password' : 'current-password');
    $('aBtn').textContent = m === 'signup' ? 'הרשמה' : m === 'reset' ? 'שליחת מייל לאיפוס' : 'כניסה';
    $('authSub').textContent = m === 'signup' ? 'יצירת חשבון חדש. הסיסמה צריכה לפחות 6 תווים.' : m === 'reset' ? 'נשלח לכם מייל עם קישור לבחירת סיסמה חדשה.' : 'ניהול הוצאות חודשי למשפחה';
    $('aSwitch').textContent = m === 'login' ? 'אין לכם חשבון? הרשמה' : 'כבר יש לכם חשבון? כניסה';
    $('aForgot').hidden = m !== 'login';
    $('aGoogle').hidden = m === 'reset'; $('aOr').hidden = m === 'reset';
  }
  $('aSwitch').onclick = () => setAuthMode(authMode === 'login' ? 'signup' : 'login');
  $('aForgot').onclick = () => setAuthMode('reset');
  function authError(err) {
    const c = (err && err.code) || '';
    if (c.includes('email-already-in-use')) return 'כבר יש חשבון עם המייל הזה. נסו להיכנס.';
    if (c.includes('weak-password')) return 'הסיסמה צריכה לפחות 6 תווים.';
    if (c.includes('invalid-email')) return 'כתובת המייל לא תקינה.';
    if (c.includes('invalid') || c.includes('wrong-password') || c.includes('user-not-found')) return 'המייל או הסיסמה לא נכונים.';
    if (c.includes('too-many')) return 'יותר מדי ניסיונות. חכו כמה דקות ונסו שוב.';
    if (c.includes('network')) return 'אין חיבור לאינטרנט.';
    if (c.includes('operation-not-allowed')) return 'ההרשמה עוד לא הופעלה באפליקציה.';
    return 'משהו לא הצליח. נסו שוב.';
  }
  $('aGoogle').onclick = async () => {
    $('aErr').hidden = true; $('aGoogle').disabled = true;
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try { await state.auth.signInWithPopup(provider); }
    catch (err) {
      const c = (err && err.code) || '';
      if (c.includes('popup-blocked') || c.includes('operation-not-supported')) {
        try { await state.auth.signInWithRedirect(provider); return; } catch (e2) { err = e2; }
      }
      if (!c.includes('popup-closed') && !c.includes('cancelled-popup')) {
        $('aErr').textContent = c.includes('unauthorized-domain') ? 'הכניסה עם Google עוד לא הופעלה לכתובת הזאת.' : c.includes('account-exists') ? 'כבר יש חשבון עם המייל הזה. היכנסו עם מייל וסיסמה.' : authError(err);
        $('aErr').hidden = false;
      }
    }
    $('aGoogle').disabled = false;
  };
  $('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('aEmail').value.trim(), pass = $('aPass').value;
    $('aErr').hidden = true; $('aOk').hidden = true; $('aBtn').disabled = true;
    try {
      if (authMode === 'reset') {
        await state.auth.sendPasswordResetEmail(email);
        $('aOk').textContent = 'שלחנו מייל ל-' + email + '. בדקו גם בספאם.'; $('aOk').hidden = false;
      } else if (authMode === 'signup') {
        await state.auth.createUserWithEmailAndPassword(email, pass);
      } else {
        await state.auth.signInWithEmailAndPassword(email, pass);
      }
    } catch (err) { $('aErr').textContent = authError(err); $('aErr').hidden = false; }
    $('aBtn').disabled = false;
  });

  // ---------- household setup ----------
  function setupError(msg) { $('sErr').textContent = msg || ''; $('sErr').hidden = !msg; }
  $('createForm').addEventListener('submit', async (e) => {
    e.preventDefault(); setupError('');
    const name = $('sName').value.trim() || 'התקציב שלנו';
    const u = state.user; $('sCreate').disabled = true;
    try {
      let code = newCode();
      for (let i = 0; i < 5; i++) { const snap = await state.db.collection('households').doc(code).get(); if (!snap.exists) break; code = newCode(); }
      await state.db.collection('households').doc(code).set({ name, members: [u.uid], emails: { [u.uid]: u.email || '' }, createdAt: Date.now() });
      await state.db.collection('users').doc(u.uid).set({ householdId: code }, { merge: true });
      openHousehold(code);
    } catch (err) { setupError(err && err.code === 'unavailable' ? 'אין חיבור לאינטרנט. נסו שוב.' : 'היצירה לא הצליחה. נסו שוב.'); }
    $('sCreate').disabled = false;
  });
  $('joinForm').addEventListener('submit', async (e) => {
    e.preventDefault(); setupError('');
    const code = cleanCode($('sCode').value);
    if (code.length !== 8) return setupError('הקוד צריך להיות 8 תווים, כמו ABCD-2345.');
    const u = state.user; $('sJoin').disabled = true;
    try {
      const ref = state.db.collection('households').doc(code);
      const snap = await ref.get();
      if (!snap.exists) { setupError('לא מצאנו תקציב עם הקוד הזה. בדקו שהוא הוקלד נכון.'); }
      else {
        const members = (snap.data().members) || [];
        if (!members.includes(u.uid)) await ref.update({ members: firebase.firestore.FieldValue.arrayUnion(u.uid), ['emails.' + u.uid]: u.email || '' });
        await state.db.collection('users').doc(u.uid).set({ householdId: code }, { merge: true });
        openHousehold(code);
      }
    } catch (err) { setupError('ההצטרפות לא הצליחה. נסו שוב.'); }
    $('sJoin').disabled = false;
  });

  function stopListening() { state.unsubs.forEach(f => { try { f(); } catch (e) {} }); state.unsubs = []; }
  function openHousehold(hid) {
    stopListening();
    state.hid = hid; state.loaded = false; state.key = null; decCache.clear(); raw.items = []; raw.months = {}; raw.goals = []; raw.savings = [];
    try { localStorage.setItem('budget-hid-' + state.user.uid, hid); } catch (e) {} state.items = []; state.months = {}; state.goals = []; state.savings = [];
    show('loading');
    const db = state.db; const base = db.collection('households').doc(hid);
    let got = { items: false, months: false };
    const timer = setTimeout(() => { if (!state.loaded) status(state.items.length ? 'אין חיבור כרגע. מוצגים הנתונים האחרונים, ושינויים יישמרו כשהחיבור יחזור.' : 'הנתונים עדיין לא נטענו. בדקו את החיבור לאינטרנט.'); }, 8000);
    const ready = () => { if (got.items && got.months && !state.loaded) { state.loaded = true; clearTimeout(timer); status(''); } };
    const onErr = (e) => {
      clearTimeout(timer);
      if (e && e.code === 'permission-denied') { stopListening(); state.hid = null; show('setup'); setupError('אין לכם גישה לתקציב הזה יותר. צרו תקציב חדש או הצטרפו עם קוד.'); return; }
      status('החיבור לנתונים נקטע. סגרו ופתחו את האפליקציה.');
    };
    state.unsubs.push(base.onSnapshot(async s => {
      state.household = s.exists ? s.data() : null;
      if (isEncrypted() && !state.key && !(await tryStoredKey())) { if (state.screen !== 'unlock') { setUnlockMode('pass'); $('uErr').hidden = true; show('unlock'); } return; }
      if (state.screen !== 'shell') { show('shell'); setTab('vMonth'); }
      decodeAll();
    }, onErr));
    state.unsubs.push(base.collection('items').onSnapshot({ includeMetadataChanges: true }, snap => {
      raw.items = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      if (!snap.metadata.fromCache) { got.items = true; ready(); }
      decodeAll();
    }, onErr));
    state.unsubs.push(base.collection('months').onSnapshot({ includeMetadataChanges: true }, snap => {
      const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); raw.months = m;
      if (!snap.metadata.fromCache) { got.months = true; ready(); }
      decodeAll();
    }, onErr));
    state.unsubs.push(base.collection('savings').onSnapshot(snap => {
      raw.savings = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      decodeAll();
    }, onErr));
    state.unsubs.push(base.collection('goals').onSnapshot(snap => {
      raw.goals = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      decodeAll();
    }, onErr));
  }

  // ---------- start ----------
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !window.firebase) {
    show('auth'); setAuthMode('login');
    $('authSub').textContent = window.firebase ? 'האפליקציה עדיין לא חוברה למסד הנתונים.' : 'אין חיבור לאינטרנט. נסו שוב כשיהיה חיבור.';
    $('aBtn').disabled = true;
    return;
  }
  firebase.initializeApp(cfg);
  state.auth = firebase.auth();
  state.auth.languageCode = 'he';
  state.db = firebase.firestore();
  if (cfg.emulator) { state.auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true }); state.db.useEmulator('127.0.0.1', 8085); } // local testing only
  else state.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  setAuthMode('login');

  state.auth.getRedirectResult().catch(() => {});
  state.auth.onAuthStateChanged(async (u) => {
    stopListening();
    state.user = u; state.hid = null; state.household = null; state.key = null;
    if (!u) { setAuthMode('login'); $('aPass').value = ''; show('auth'); return; }
    show('loading');
    let hid = null;
    try { const snap = await state.db.collection('users').doc(u.uid).get(); hid = snap.exists ? snap.data().householdId : null; }
    catch (e) { try { hid = localStorage.getItem('budget-hid-' + u.uid); } catch (e2) {} } // offline: use the last known budget
    if (hid) openHousehold(hid);
    else { $('sName').value = ''; $('sCode').value = ''; setupError(''); show('setup'); }
  });
})();
