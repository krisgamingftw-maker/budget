(function () {
  'use strict';
  const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const MONTHS_SHORT = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];
  const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const RING = 2 * Math.PI * 34;
  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const todayKey = keyOf(now.getFullYear(), now.getMonth() + 1);

  let drag = null; // the expense row being moved, see startDrag
  const state = {
    fb: null, auth: null, db: null, user: null,
    hid: null, household: null,
    items: [], months: {}, goals: [], savings: [], cats: [],
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
  function liveCommas(inp) {
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
  }
  ['fAmount', 'fIncome', 'gTarget', 'gStart', 'dAmount', 'svBalance', 'svMonthly', 'sbAmount', 'spAmount'].forEach(id => liveCommas($(id)));
  // ---------- categories ----------
  const BASE_CATS = [
    { id: 'home', n: 'בית', e: '🏠' }, { id: 'bills', n: 'חשבונות', e: '💡' }, { id: 'food', n: 'אוכל וסופר', e: '🛒' },
    { id: 'car', n: 'רכב ותחבורה', e: '🚗' }, { id: 'health', n: 'בריאות וטיפוח', e: '💊' }, { id: 'kids', n: 'ילדים וחיות', e: '🐾' },
    { id: 'fun', n: 'בזבוזים ופנאי', e: '🎉' }, { id: 'save', n: 'חיסכון', e: '🐷' }, { id: 'misc', n: 'שונות', e: '📦' }
  ];
  const BASE_COLOR = { home: '#f0ad9a', bills: '#f2c66d', food: '#93cdb0', car: '#94bde3', health: '#e9a3c0', kids: '#c3a7e6', fun: '#f19aae', save: '#7fc9bb', misc: '#c9bdb4' };
  const BASE_SHORT = { home: 'בית', bills: 'חשבונות', food: 'אוכל', car: 'רכב', health: 'בריאות', kids: 'ילדים', fun: 'פנאי', save: 'חיסכון', misc: 'שונות' };
  // Families can add their own categories. They are shared by everyone in the budget
  // (collection `cats`) and come after the built-in ones, before "שונות".
  let CATS = BASE_CATS.slice(), CAT_BY = {}, CAT_COLOR = {}, CAT_SHORT = {}, HIDDEN_BASE = [];
  const CUSTOM_COLORS = ['#f4b183', '#a8d5a2', '#9ecbe8', '#d8b4e2', '#f7d08a', '#f2a7b8', '#8fd3c8', '#c4c99a', '#b9b3f0', '#e8b69a'];
  const CAT_EMOJIS = ['🏷️', '🎁', '🎓', '✈️', '👶', '🐶', '💄', '👗', '🍔', '☕', '🏋️', '📚', '🎮', '💻', '📱', '🧾', '🏥', '🔧', '🌱', '💍', '🕍', '🎂', '🧸', '💸'];
  // A family can also change the emoji or color of a built-in category. That is saved as
  // a doc in `cats` with id `b-<builtin id>` and a plain `base` field.
  const baseDocId = (id) => 'b-' + id;
  function applyCats(custom) {
    const over = {};
    for (const c of (custom || [])) if (c && c.base && !c.locked && BASE_COLOR[c.base]) over[c.base] = c;
    // A built-in category can also be hidden ("deleted"). "שונות" always stays, it catches the rest.
    HIDDEN_BASE = BASE_CATS.filter(c => c.id !== 'misc' && over[c.id] && over[c.id].hidden).map(c => Object.assign({}, c, { e: over[c.id].emoji || c.e }));
    const base = BASE_CATS.filter(c => !(c.id !== 'misc' && over[c.id] && over[c.id].hidden)).map(c => { const o = over[c.id]; return o ? Object.assign({}, c, { e: o.emoji || c.e }) : c; });
    const list = (custom || []).filter(c => c && c.name && !c.locked && !c.base).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(b.id));
    const mine = list.map((c, i) => ({ id: c.id, n: String(c.name), e: c.emoji || '🏷️', custom: true, color: c.color || CUSTOM_COLORS[i % CUSTOM_COLORS.length] }));
    const misc = base[base.length - 1];
    CATS = base.slice(0, -1).concat(mine, [misc]);
    CAT_BY = Object.fromEntries(CATS.map(c => [c.id, c]));
    CAT_COLOR = Object.assign({}, BASE_COLOR); CAT_SHORT = Object.assign({}, BASE_SHORT);
    for (const id in over) if (over[id].color) CAT_COLOR[id] = over[id].color;
    base.forEach(c => { c.color = CAT_COLOR[c.id]; });
    mine.forEach(c => { CAT_COLOR[c.id] = c.color; CAT_SHORT[c.id] = c.n; });
  }
  applyCats([]);
  const customCats = () => CATS.filter(c => c.custom);
  const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const CAT_WORDS = [
    ['save', /חיסכון|חסכון|הפקדה|השתלמות|פיקדון|פקדון|גמל/],
    ['food', /סופר(?![ -]?פארם)|מכולת|שוק|אוכל|ירקות|מאפייה|קצב|רמי לוי|שופרסל|ויקטורי|יוחננוף|אושר עד|חצי חינם|יינות ביתן|טיב טעם|קרפור|am:?pm/i],
    ['car', /דלק|פז|סונול|דור אלון|רכב|חניה|חנייה|טסט|מוסך|ביטוח רכב|רב.?קו|תחבורה|מונית|אוטובוס|כביש/],
    ['bills', /חשמל|מים|גז|ארנונה|אינטרנט|טלפון|סלולר|פלאפון|נטפליקס|ספוטיפיי|מנוי|כבלים|yes|hot|בזק|רואה חשבון|ביטוח לאומי|מס/i],
    ['home', /דירה|שכירות|משכנתא|ועד|בית|ניקיון|רהיט|כלי בית/],
    ['health', /רופא|קופת|תרופ|בית מרקחת|סופר.?פארם|שיניים|טיפול|קוסמטיק|ציפורניים|מספרה|שיער|כושר|חדר כושר|פילאטיס|יוגה|ביטוח בריאות/],
    ['kids', /גן|מעון|צהרון|חוג|ילד|תינוק|חיתול|כלב|חתול|וטרינר|אוכל כלבים|אוכל חתולים/],
    ['fun', /בית קפה|בתי קפה|קפה|מסעד|אוכל בחוץ|וולט|wolt|תן ביס|בילוי|סרט|הופעה|חופשה|טיול|בגדים|קניות|זארה|שופינג|מתנה|אמזון|עלי|shein/i]
  ];
  function guessCat(name) {
    const t = String(name || ''), low = normName(t);
    // An expense whose name contains a family category's name goes there first.
    for (const c of customCats()) { const n = normName(c.n); if (n.length >= 2 && low.includes(n)) return c.id; }
    for (const [id, re] of CAT_WORDS) if (CAT_BY[id] && re.test(t)) return id; return 'misc'; }
  const catOf = (it) => (it && it.cat && CAT_BY[it.cat]) ? it.cat : (it && it.linkType === 'sav' && CAT_BY.save ? 'save' : guessCat(it && it.name));

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
  const catRef = (id) => hh().collection('cats').doc(id);
  const CAT_SECRET = ['name', 'emoji'];

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
  const sealAmount = async (x) => ({ id: x.id || rid(), at: x.at || Date.now(), e: await aesEnc(state.key, te.encode(JSON.stringify(x.name ? { amount: Number(x.amount) || 0, name: x.name } : { amount: Number(x.amount) || 0 }))) });
  async function openItem(d) {
    const out = await openDoc(d);
    if (!d || !Array.isArray(d.spends)) return out;
    out.spends = await Promise.all(d.spends.map(openDoc));
    out.spent = out.spends.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    if (out.split) out.paid = out.spent >= (Number(out.amount) || 0) && out.spent > 0;
    return out;
  }
  const raw = { items: [], months: {}, goals: [], savings: [], cats: [] };
  let decodeRun = 0;
  async function decodeAll() {
    const run = ++decodeRun;
    const items = await Promise.all(raw.items.map(openItem));
    const mk = Object.keys(raw.months); const mv = await Promise.all(mk.map(k => openDoc(raw.months[k])));
    const goals = await Promise.all(raw.goals.map(openGoal));
    const cats = await Promise.all(raw.cats.map(openDoc));
    const savings = await Promise.all(raw.savings.map(async v => {
      const out = await openDoc(v);
      out.deposits = await Promise.all((Array.isArray(v.deposits) ? v.deposits : []).map(openDoc));
      return out;
    }));
    if (run !== decodeRun) return;
    state.cats = cats; applyCats(cats); if (state.catFilter && !CAT_BY[state.catFilter]) state.catFilter = null; buildCatChips();
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
    for (const k of Object.keys(raw.months)) { const m = raw.months[k]; if (!m.e && m.income != null) writes.push([monthRef(k), await seal(incomeDoc(m), INCOME_SECRET, true)]); }
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
    for (const c of raw.cats) { if (!c.e) writes.push([catRef(c.id), await seal({ name: c.name || '', emoji: c.emoji || '' }, CAT_SECRET, true)]); }
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
    // Rebuilding the list would drop the row under the finger; draw once it is let go.
    if (drag) { drag.pending = true; return; }
    renderMonth();
    if (state.tab === 'vGoals') renderGoals();
    if (state.tab === 'vSavings') renderSavings();
    if (state.sheet && state.sheet.mode === 'over') renderOverSheet();
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
      $('incomeLbl').textContent = ((state.months[k] || {}).extras || []).length ? 'הכנסות' : 'הכנסה'; $('incomeAmt').textContent = fmt(income);
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

    renderOver(k);
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


  // ---------- press and hold, then drag, to change the order ----------
  // The order is the item's `order` field, shared with the whole family and
  // copied to the next month with the recurring expenses.
  const HOLD_MS = 380;
  function startDrag(li, y) {
    const ul = li.parentElement;
    const rows = [...ul.children].filter(x => x.classList.contains('row') && x.dataset.id);
    const from = rows.indexOf(li);
    if (from < 0 || rows.length < 2) return;
    const sy = window.scrollY;
    const rects = rows.map(r => r.getBoundingClientRect());
    drag = {
      li, ul, rows, from, to: from, y0: y, y, sy0: sy, h: rects[from].height,
      mids: rects.map(r => r.top + sy + r.height / 2),
      // a little past the first and last rows, so the ends are always reachable
      minDy: rects[0].top - rects[from].top - rects[0].height / 2, maxDy: rects[rows.length - 1].bottom - rects[from].bottom + rects[rows.length - 1].height / 2,
      hs: rects.map(r => r.height), shift: rows.map(() => 0), over: -1,
      // a plain expense can be dropped onto a budget used in parts (like groceries) to become one of its purchases
      canMerge: li.dataset.mergeable === '1',
      raf: 0, pending: false
    };
    ul.classList.add('sorting'); li.classList.add('dragging');
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
    tickDrag();
  }
  function placeDrag() {
    const d = drag;
    const dy = Math.max(d.minDy, Math.min(d.maxDy, d.y + window.scrollY - d.y0 - d.sy0));
    const mid = d.mids[d.from] + dy;
    // Held over the middle of a budget used in parts: that budget lights up and the order stays as it is.
    let over = -1;
    if (d.canMerge) d.rows.forEach((r, i) => { if (i !== d.from && r.dataset.split === '1' && Math.abs(mid - (d.mids[i] + d.shift[i])) < d.hs[i] * 0.3) over = i; });
    if (over !== d.over) {
      if (d.over >= 0) d.rows[d.over].classList.remove('merge-target');
      if (over >= 0) { d.rows[over].classList.add('merge-target'); try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
      d.li.classList.toggle('merging', over >= 0);
      d.over = over;
    }
    d.li.style.transform = 'translateY(' + dy + 'px)';
    if (over >= 0) return;
    let to = d.from;
    for (let i = d.from + 1; i < d.rows.length; i++) if (mid >= d.mids[i]) to = i;
    for (let i = d.from - 1; i >= 0; i--) if (mid <= d.mids[i]) to = i;
    d.to = to;
    d.rows.forEach((r, i) => {
      if (i === d.from) return;
      const sh = d.from < i && i <= to ? -d.h : to <= i && i < d.from ? d.h : 0;
      d.shift[i] = sh;
      r.style.transform = sh ? 'translateY(' + sh + 'px)' : '';
    });
  }
  // Near the top or bottom of the screen the page scrolls by itself.
  function tickDrag() {
    if (!drag) return;
    const edge = 90, bottom = window.innerHeight - 110;
    let v = 0;
    if (drag.y < edge) v = -Math.ceil((edge - drag.y) / 6);
    else if (drag.y > bottom) v = Math.ceil((drag.y - bottom) / 6);
    if (v) window.scrollBy(0, v);
    placeDrag();
    drag.raf = requestAnimationFrame(tickDrag);
  }
  function moveDrag(y) { if (drag) { drag.y = y; placeDrag(); } }
  function endDrag(commit) {
    const d = drag; if (!d) return;
    cancelAnimationFrame(d.raf);
    if (commit) placeDrag();
    if (d.over >= 0) {
      const tgt = d.rows[d.over];
      if (!commit) {
        tgt.classList.remove('merge-target');
      } else {
        // The expense sinks into the budget, then the list is drawn again without it.
        d.li.classList.add('dropping', 'merged');
        d.rows.forEach((r, i) => { if (i !== d.from) r.style.transform = d.shift[i] ? 'translateY(' + d.shift[i] + 'px)' : ''; });
        setTimeout(() => {
          d.rows.forEach(r => { r.style.transform = ''; }); tgt.classList.remove('merge-target');
          d.ul.classList.remove('sorting'); d.li.classList.remove('dragging', 'dropping', 'merging', 'merged');
          drag = null;
          mergeInto(d.li.dataset.id, tgt.dataset.id);
        }, 200);
        return;
      }
    }
    const moved = commit && d.to !== d.from;
    const finish = () => {
      d.rows.forEach(r => { r.style.transform = ''; });
      d.ul.classList.remove('sorting'); d.li.classList.remove('dragging', 'dropping', 'merging');
      drag = null;
      if (moved) moveItem(d.li.dataset.id, d.rows[d.to].dataset.id, d.to > d.from);
      else if (d.pending) render();
    };
    if (!moved) { d.li.classList.add('dropping'); d.rows.forEach(r => { r.style.transform = ''; }); setTimeout(finish, 180); return; }
    // Settle the row into its new place, then redraw the list in the new order.
    const target = d.to > d.from
      ? d.rows.slice(d.from + 1, d.to + 1).reduce((s, r) => s + r.getBoundingClientRect().height, 0)
      : -d.rows.slice(d.to, d.from).reduce((s, r) => s + r.getBoundingClientRect().height, 0);
    d.li.classList.add('dropping'); d.li.style.transform = 'translateY(' + target + 'px)';
    setTimeout(finish, 180);
  }
  // A plain expense dropped onto a budget used in parts becomes one of its purchases
  // (with its name), and leaves the list. "ביטול" puts it back as it was.
  const canMergeItem = (it) => !isSplit(it) && !it.linkId && !it.locked && (Number(it.amount) || 0) > 0;
  function mergeInto(srcId, splitId) {
    const src = state.items.find(x => x.id === srcId), sp = state.items.find(x => x.id === splitId);
    const rawSrc = raw.items.find(x => x.id === srcId), rawSp = raw.items.find(x => x.id === splitId);
    if (!src || !sp || !rawSrc || !rawSp || !canMergeItem(src) || !isSplit(sp)) { render(); return; }
    const amount = Number(src.amount) || 0;
    const entry = { id: rid(), amount, at: Date.now(), name: src.name };
    const before = state.items;
    state.items = state.items.filter(x => x.id !== srcId).map(x => x.id === splitId ? Object.assign({}, x, { spends: (x.spends || []).concat([entry]), spent: (x.spent || 0) + amount }) : x);
    render();
    const back = Object.assign({}, rawSrc); delete back.id;
    const FV = firebase.firestore.FieldValue;
    const saving = (async () => {
      const stored = rawSp.e && state.key ? await sealAmount(entry) : entry;
      const b = state.db.batch(); b.update(itemRef(splitId), { spends: FV.arrayUnion(stored) }); b.delete(itemRef(srcId)); await b.commit();
      return stored;
    })();
    write(() => saving);
    const left = (Number(sp.amount) || 0) - (sp.spent || 0) - amount;
    showUndo('״' + src.name + '״ (' + fmt(amount) + ') נוסף ל' + sp.name + ' · ' + (left >= 0 ? 'נשארו ' + fmt(left) : 'חריגה של ' + fmt(-left)), () => {
      state.items = before; // the family's live data takes over again right after
      render();
      write(async () => {
        const stored = await saving;
        const b = state.db.batch(); b.set(itemRef(srcId), back); b.update(itemRef(splitId), { spends: FV.arrayRemove(stored) }); await b.commit();
      });
    });
  }
  let undoTimer = null;
  function showUndo(text, onUndo) {
    let bar = $('undoBar');
    if (!bar) {
      bar = el('div', 'undo-bar'); bar.id = 'undoBar'; bar.setAttribute('role', 'status');
      bar.append(el('span', 'undo-text'), el('button', 'undo-btn', 'ביטול'));
      document.body.append(bar);
    }
    bar.querySelector('.undo-text').textContent = text;
    const btn = bar.querySelector('.undo-btn'); btn.type = 'button';
    btn.onclick = () => { hide(); onUndo(); };
    function hide() { clearTimeout(undoTimer); bar.hidden = true; }
    bar.hidden = false; clearTimeout(undoTimer); undoTimer = setTimeout(hide, 7000);
  }

  // Puts the item right before (or after) another one of the same month and numbers the month again.
  function moveItem(movedId, targetId, after) {
    const list = monthItems(state.view);
    const moved = list.find(i => i.id === movedId);
    const rest = list.filter(i => i.id !== movedId);
    let at = rest.findIndex(i => i.id === targetId);
    if (!moved || at < 0) { render(); return; }
    if (after) at++;
    rest.splice(at, 0, moved);
    const next = new Map();
    rest.forEach((it, n) => { if ((it.order || 0) !== n + 1) next.set(it.id, n + 1); });
    if (!next.size) { render(); return; }
    state.items = state.items.map(x => next.has(x.id) ? Object.assign({}, x, { order: next.get(x.id) }) : x);
    render();
    write(async () => {
      const ups = [...next];
      for (let i = 0; i < ups.length; i += 400) {
        const b = state.db.batch(); ups.slice(i, i + 400).forEach(([id, order]) => b.update(itemRef(id), { order })); await b.commit();
      }
    });
  }

  // ---------- swipe left to delete ----------
  const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';
  const SWIPE_W = 92;
  let openSwipe = null;
  function closeSwipe(except) {
    if (openSwipe && openSwipe !== except) { openSwipe.close(); }
  }
  document.addEventListener('pointerdown', e => { if (openSwipe && !openSwipe.outer.contains(e.target)) closeSwipe(); }, true);
  function swipeable(outer, name, onDelete, reorder) {
    const inner = el('div', 'swipe-in');
    while (outer.firstChild) inner.append(outer.firstChild);
    const del = el('button', 'swipe-del'); del.type = 'button';
    del.innerHTML = TRASH_SVG; const dl = el('span', '', 'מחיקה'); del.append(dl);
    del.setAttribute('aria-label', 'מחיקת ' + name); del.tabIndex = -1;
    outer.classList.add('swipeable'); outer.append(del, inner);
    let x0 = 0, y0 = 0, base = 0, pos = 0, mode = null, id = null, armed = false, armTimer = null, justSwiped = false, holdTimer = null;
    const set = (v, anim) => { pos = v; outer.classList.toggle('swiped', v !== 0); inner.style.transition = anim ? '' : 'none'; inner.style.transform = v ? 'translateX(' + v + 'px)' : ''; };
    const ctl = { outer, close() { set(0, true); disarm(); if (openSwipe === ctl) openSwipe = null; } };
    function disarm() { armed = false; clearTimeout(armTimer); outer.classList.remove('armed'); dl.textContent = 'מחיקה'; }
    inner.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      x0 = e.clientX; y0 = e.clientY; base = pos; mode = null; id = e.pointerId;
      clearTimeout(holdTimer);
      // Press and hold (without moving) picks the row up to change its place.
      if (reorder && pos === 0 && !drag && !e.target.closest('.check, .swipe-del')) {
        const pid = e.pointerId;
        holdTimer = setTimeout(() => {
          if (mode || id !== pid || pos !== 0) return;
          mode = 'drag'; closeSwipe();
          try { inner.setPointerCapture(pid); } catch (err) {}
          startDrag(outer, y0);
        }, HOLD_MS);
      }
    });
    // Once a row is picked up the page must not scroll under the finger.
    inner.addEventListener('touchmove', e => { if (mode === 'drag' && e.cancelable) e.preventDefault(); }, { passive: false });
    inner.addEventListener('contextmenu', e => { if (reorder) e.preventDefault(); });
    inner.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      if (mode === 'drag') { moveDrag(e.clientY); return; }
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!mode && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) clearTimeout(holdTimer);
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
      if (e.pointerId !== id) return; id = null; clearTimeout(holdTimer);
      if (mode === 'drag') { mode = null; endDrag(e.type === 'pointerup'); justSwiped = true; setTimeout(() => { justSwiped = false; }, 400); return; }
      if (mode !== 'swipe') return;
      if (pos < -SWIPE_W / 2) { set(-SWIPE_W, true); openSwipe = ctl; } else ctl.close();
      // swallow the click that follows a mouse drag
      justSwiped = true; setTimeout(() => { justSwiped = false; }, 60);
    };
    inner.addEventListener('pointerup', end);
    inner.addEventListener('pointercancel', e => { if (e.pointerId === id && (mode === 'swipe' || mode === 'drag')) end(e); else if (e.pointerId === id) { id = null; clearTimeout(holdTimer); } });
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

  // ---------- where an overrun comes from ----------
  // A month is over when expenses pass the income, or when a budget used in parts
  // (like groceries) went past its planned amount. The causes are those budgets,
  // and what grew or is new compared with the month before.
  const sameItem = (a, b) => (a.seriesId && a.seriesId === b.seriesId) || normName(a.name) === normName(b.name);
  function overInfo(k) {
    const { items, total, income } = monthStats(k);
    const overIncome = income > 0 && total > income ? total - income : 0;
    const src = [];
    for (const i of items) {
      if (!isSplit(i)) continue;
      const amt = Number(i.amount) || 0, spent = i.spent || 0;
      if (spent > amt) src.push({ it: i, amount: spent - amt, kind: 'split', text: 'תוכנן ' + fmt(amt) + ', יצא ' + fmt(spent) });
    }
    const pk = shiftKey(k, -1), prev = monthItems(pk);
    if (overIncome && prev.length) {
      const prevIncome = Number((state.months[pk] || {}).income) || 0;
      for (const i of items) {
        const p = prev.find(x => sameItem(x, i));
        if (!p) { const now = itemTotal(i); if (now > 0) src.push({ it: i, amount: now, kind: 'new', text: 'הוצאה חדשה, לא הייתה ב' + label(pk) }); continue; }
        // For a budget that went past its plan, the part over the plan is already counted above.
        const now = isSplit(i) ? Number(i.amount) || 0 : itemTotal(i), was = itemTotal(p);
        if (now > was) src.push({ it: i, amount: now - was, kind: 'up', text: 'עלתה מ-' + fmt(was) + ' ל-' + fmt(now) + ' לעומת ' + label(pk) });
      }
      if (prevIncome > income) src.push({ it: null, amount: prevIncome - income, kind: 'income', text: 'ההכנסה ירדה מ-' + fmt(prevIncome) + ' ל-' + fmt(income) });
    }
    src.sort((a, b) => b.amount - a.amount);
    const splitOver = src.filter(x => x.kind === 'split').reduce((s, x) => s + x.amount, 0);
    return { items, total, income, overIncome, splitOver, src, on: overIncome > 0 || splitOver > 0 };
  }
  function overRow(x) {
    const li = el('li', 'over-row' + (x.kind === 'income' ? ' inc' : ''));
    const c = x.it ? CAT_BY[catOf(x.it)] : null;
    if (c) li.style.setProperty('--cc', CAT_COLOR[c.id]);
    const b = el(x.it ? 'button' : 'div', 'over-body'); if (x.it) b.type = 'button';
    const t = el('span', 'over-text');
    t.append(el('b', '', x.it ? (c ? c.e + ' ' : '') + x.it.name : '💼 הכנסה'), el('small', '', x.text));
    b.append(t, el('span', 'over-amt num', '+' + fmt(x.amount)));
    if (x.it) b.onclick = () => openSheet(isSplit(x.it) ? 'spend' : 'edit', x.it);
    li.append(b); return li;
  }
  function overSubText(o) {
    if (o.overIncome) return 'ההוצאות (' + fmt(o.total) + ') גבוהות מההכנסה (' + fmt(o.income) + ') ב-' + fmt(o.overIncome) + '.';
    return 'יש תקציבים שעברו את הסכום שתוכנן להם, בסך ' + fmt(o.splitOver) + '.';
  }
  function topCats(items) {
    const by = {};
    for (const i of items) { const c = catOf(i); by[c] = (by[c] || 0) + itemTotal(i); }
    return Object.keys(by).filter(id => by[id] > 0).sort((a, b) => by[b] - by[a]).map(id => ({ id, total: by[id] }));
  }
  function renderOver(k) {
    const o = overInfo(k);
    $('overCard').hidden = !o.on;
    if (!o.on) return;
    $('overSub').textContent = overSubText(o);
    const ul = $('overList'); ul.textContent = '';
    if (o.src.length) o.src.slice(0, 3).forEach(x => ul.append(overRow(x)));
    else {
      // Nothing changed from last month: show the biggest categories instead.
      for (const c of topCats(o.items).slice(0, 3)) {
        const cc = CAT_BY[c.id]; const li = el('li', 'over-row'); li.style.setProperty('--cc', CAT_COLOR[c.id]);
        const b = el('div', 'over-body'); const t = el('span', 'over-text');
        t.append(el('b', '', cc.e + ' ' + cc.n), el('small', '', Math.round(c.total / (o.total || 1) * 100) + '% מההוצאות'));
        b.append(t, el('span', 'over-amt num', fmt(c.total))); li.append(b); ul.append(li);
      }
    }
    $('overMore').textContent = o.src.length > 3 ? 'לפירוט המלא (' + o.src.length + ')' : 'לפירוט המלא';
  }
  function renderOverSheet() {
    const o = overInfo(state.view);
    const sum = $('ovSum'); sum.textContent = '';
    sum.className = 'over-sum' + (o.on ? ' bad' : '');
    if (o.overIncome) sum.append(el('span', '', 'חריגה של'), el('b', 'num', fmt(o.overIncome)), el('small', '', 'הוצאות ' + fmt(o.total) + ' · הכנסה ' + fmt(o.income)));
    else if (o.splitOver) sum.append(el('span', '', 'חריגה מהתקציבים'), el('b', 'num', fmt(o.splitOver)), el('small', '', 'מעבר למה שתוכנן'));
    else sum.append(el('span', '', 'אין חריגה החודש 🎉'), el('b', 'num', fmt(o.total)), el('small', '', 'סה״כ הוצאות'));
    $('ovSrcWrap').hidden = !o.src.length;
    const ul = $('ovSrc'); ul.textContent = ''; o.src.forEach(x => ul.append(overRow(x)));
    const cl = $('ovCats'); cl.textContent = '';
    const base = o.income || o.total || 1;
    for (const c of topCats(o.items)) {
      const cc = CAT_BY[c.id]; const li = el('li', 'over-cat'); li.style.setProperty('--cc', CAT_COLOR[c.id]);
      const top = el('div', 'oc-top'); top.append(el('span', '', cc.e + ' ' + cc.n), el('b', 'num', fmt(c.total)));
      const bar = el('span', 'oc-bar'); const f = el('i'); f.style.width = Math.min(100, c.total / base * 100) + '%'; bar.append(f);
      li.append(top, bar, el('small', '', Math.round(c.total / base * 100) + '% מ' + (o.income ? 'ההכנסה' : 'ההוצאות')));
      cl.append(li);
    }
  }
  $('overMore').onclick = () => openSheet('over');
  $('afterChip').onclick = () => openSheet('over');

  function renderCats(items) {
    const box = $('catList'); box.textContent = '';
    const by = {};
    for (const i of items) { const c = catOf(i); (by[c] = by[c] || { total: 0, paid: 0, n: 0 }); by[c].total += itemTotal(i); by[c].paid += itemPaid(i); by[c].n++; }
    const ids = CATS.map(c => c.id).filter(id => by[id]).sort((a, b) => by[b].total - by[a].total);
    $('catSec').hidden = false; box.hidden = !ids.length;
    for (const id of ids) {
      const c = CAT_BY[id], d = by[id];
      const b = el('button', 'cat-row' + (state.catFilter === id ? ' on' : '')); b.type = 'button';
      b.style.setProperty('--cc', CAT_COLOR[id]);
      b.setAttribute('aria-pressed', state.catFilter === id ? 'true' : 'false');
      b.setAttribute('aria-label', c.n + ' ' + fmt(d.total));
      b.append(el('span', 'cat-ico', c.e), el('b', 'num', fmt(d.total)), el('span', 'cat-name', CAT_SHORT[id] || c.n));
      b.onclick = () => { if (Date.now() - heldAt < 900) return; state.catFilter = state.catFilter === id ? null : id; render(); if (state.catFilter) $('openList').closest('.section').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      longPress(b, () => { heldAt = Date.now(); openSheet('catEdit', { id }); });
      box.append(b);
    }
    const fl = $('catFilterNote');
    fl.hidden = !state.catFilter;
    if (state.catFilter) { const c = CAT_BY[state.catFilter]; $('catFilterText').textContent = 'מוצג רק: ' + c.e + ' ' + c.n; }
  }
  $('catClear').onclick = () => { state.catFilter = null; render(); };
  $('catEditBtn').onclick = () => openSheet('cats');
  let heldAt = 0;
  // Holding a category tile for half a second opens its editor (a tap still filters).
  function longPress(node, fn) {
    let t = null, x = 0, y = 0;
    const stop = () => { clearTimeout(t); t = null; };
    node.addEventListener('pointerdown', e => { x = e.clientX; y = e.clientY; stop(); t = setTimeout(() => { t = null; if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) {} fn(); }, 500); });
    node.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x, e.clientY - y) > 10) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => node.addEventListener(ev, stop));
    node.addEventListener('contextmenu', e => e.preventDefault());
  }

  function rowEl(it) {
    const row = el('li', 'row' + (it.paid ? ' paid' : ''));
    row.dataset.id = it.id;
    if (isSplit(it)) row.dataset.split = '1';
    else if (canMergeItem(it)) row.dataset.mergeable = '1';
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
      return swipeable(row, it.name, () => deleteItem(it), true);
    }
    const chk = el('button', 'check'); chk.innerHTML = CHECK_SVG;
    chk.setAttribute('aria-pressed', it.paid ? 'true' : 'false');
    chk.setAttribute('aria-label', (it.paid ? 'בטל סימון שולם: ' : 'סמן כשולם: ') + it.name);
    chk.onclick = () => togglePaid(it);
    row.append(body, chk);
    return swipeable(row, it.name, () => deleteItem(it), true);
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
  // ---------- family categories (settings + sheet) ----------
  let catSheetColor = CUSTOM_COLORS[0];
  function renderCatSettings() {
    fillCatChips($('setCats'), $('setCatsHidden'), $('setCatsHiddenWrap'), false);
    if (state.sheet && state.sheet.mode === 'cats') fillCatChips($('shCats'), $('shCatsHidden'), $('shCatsHiddenWrap'), true);
  }
  // Every category as a chip that opens its editor, plus deleted built-ins to bring back.
  // fromSheet: the editor returns to the categories sheet when it closes.
  function fillCatChips(box, hb, hw, fromSheet) {
    if (!box) return; box.textContent = '';
    for (const c of CATS) {
      const b = el('button', 'chip cat-chip'); b.type = 'button'; b.dataset.c = c.id; b.style.setProperty('--cc', CAT_COLOR[c.id]);
      const ed = el('span', 'ed'); ed.innerHTML = EDIT_SVG; b.append(el('i', 'dot'), c.e + ' ' + c.n, ed);
      b.setAttribute('aria-label', 'עריכת הקטגוריה ' + c.n);
      b.onclick = () => { openSheet('catEdit', { id: c.id }); if (fromSheet) state.sheet.back = true; };
      box.append(b);
    }
    hb.textContent = '';
    hw.hidden = !HIDDEN_BASE.length;
    for (const c of HIDDEN_BASE) {
      const b = el('button', 'chip cat-chip hidden-cat'); b.type = 'button'; b.dataset.c = c.id;
      b.append(c.e + ' ' + c.n, el('span', 'ed', '↩︎'));
      b.setAttribute('aria-label', 'החזרת הקטגוריה ' + c.n);
      b.onclick = () => setBaseHidden(c.id, false);
      hb.append(b);
    }
  }
  (function buildCatSheet() {
    const eb = $('cEmojis');
    const pick = [...new Set(BASE_CATS.map(c => c.e).concat(CAT_EMOJIS))];
    for (const e of pick) { const b = el('button', 'emoji-btn', e); b.type = 'button'; b.dataset.e = e; b.setAttribute('aria-label', e); b.onclick = () => { $('cEmoji').value = e; syncCatSheet(); }; eb.append(b); }
    const cb = $('cColors');
    for (const c of [...new Set(Object.values(BASE_COLOR).concat(CUSTOM_COLORS))]) { const b = el('button', 'swatch'); b.type = 'button'; b.dataset.col = c; b.style.background = c; b.setAttribute('aria-label', 'צבע'); b.onclick = () => { catSheetColor = c; syncCatSheet(); }; cb.append(b); }
    $('cEmoji').addEventListener('input', syncCatSheet);
    $('cName').addEventListener('input', syncCatSheet);
  })();
  function syncCatSheet() {
    const e = $('cEmoji').value.trim();
    document.querySelectorAll('#cEmojis .emoji-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.e === e ? 'true' : 'false'));
    document.querySelectorAll('#cColors .swatch').forEach(b => b.setAttribute('aria-pressed', b.dataset.col === catSheetColor ? 'true' : 'false'));
    const pv = $('cPreview'); pv.style.setProperty('--cc', catSheetColor);
    pv.querySelector('.cat-ico').textContent = e || '🏷️';
    pv.querySelector('.cat-name').textContent = $('cName').value.trim() || 'שם הקטגוריה';
    const ou = $('cOrig'); if (ou) { const sh = state.sheet; const b = sh && sh.mode === 'catEdit' && BASE_COLOR[sh.id] ? BASE_CATS.find(x => x.id === sh.id) : null;
      ou.hidden = !b || (e === b.e && catSheetColor === BASE_COLOR[b.id]); }
  }
  $('setCatAdd').onclick = () => openSheet('catNew');
  $('shCatAdd').onclick = () => { openSheet('catNew'); state.sheet.back = true; };
  // Hide or bring back a built-in category. Its saved emoji/color stay with it.
  function setBaseHidden(id, hidden) {
    const did = baseDocId(id), prev = (state.cats || []).find(c => c.id === did) || {};
    const orig = BASE_CATS.find(x => x.id === id);
    const emoji = prev.emoji || orig.e, color = prev.color || BASE_COLOR[id];
    const plain = !hidden && emoji === orig.e && color === BASE_COLOR[id];
    state.cats = (state.cats || []).filter(c => c.id !== did).concat(plain ? [] : [{ id: did, base: id, emoji, color, hidden }]);
    if (hidden && state.catFilter === id) state.catFilter = null;
    applyCats(state.cats); buildCatChips(); render();
    write(async () => plain ? catRef(did).delete() : catRef(did).set(Object.assign(await seal({ emoji }, CAT_SECRET), { base: id, color, hidden, createdAt: Date.now() })));
  }
  $('cOrig').onclick = () => { const sh = state.sheet; const b = sh && BASE_CATS.find(x => x.id === sh.id); if (!b) return; $('cEmoji').value = b.e; catSheetColor = BASE_COLOR[b.id]; syncCatSheet(); };

  function renderSettings() {
    const h = state.household || {};
    $('hhName').textContent = h.name || 'התקציב שלנו';
    const emails = h.emails ? Object.values(h.emails) : [];
    $('hhMembers').textContent = emails.length ? 'משתמשים בתקציב: ' + emails.join(', ') : '';
    $('codeText').textContent = prettyCode(state.hid);
    renderEncCard(); renderCatSettings();
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
  // Income: a main amount plus optional extra lines; `income` keeps the total so every other screen just reads it.
  const INCOME_SECRET = ['income', 'incomeMain', 'extras'];
  function incomeDoc(m) {
    const extras = (Array.isArray(m.extras) ? m.extras : []).map(x => ({ name: String(x.name || ''), amount: Number(x.amount) || 0 }));
    const main = m.incomeMain != null ? Number(m.incomeMain) || 0 : Number(m.income) || 0;
    return { income: main + extras.reduce((t, x) => t + x.amount, 0), incomeMain: main, extras };
  }
  function incRow(x) {
    const li = el('li', 'inc-row');
    const n = el('input', 'inc-name'); n.placeholder = 'שם, למשל: משכורת 2'; n.maxLength = 40; n.value = (x && x.name) || '';
    const a = el('input', 'inc-amt num'); a.inputMode = 'decimal'; a.placeholder = '0'; a.value = x && x.amount ? groupNum(x.amount) : '';
    liveCommas(a); a.addEventListener('input', updIncTotal);
    const del = el('button', 'sp-del', '×'); del.type = 'button'; del.setAttribute('aria-label', 'הסרת ההכנסה');
    del.onclick = () => { li.remove(); if (!$('incList').children.length) $('incList').append(incRow()); updIncTotal(); };
    li.append(n, a, del); return li;
  }
  function updIncTotal() {
    let t = parseAmount($('fIncome').value) || 0;
    if ($('fMoreInc').checked) for (const i of $('incList').querySelectorAll('.inc-amt')) t += parseAmount(i.value) || 0;
    $('incTotal').textContent = fmt(t);
  }
  function syncMoreInc() {
    const on = $('fMoreInc').checked;
    $('incExtraWrap').hidden = !on;
    $('fIncomeLbl').textContent = on ? 'הכנסה ראשית ₪' : 'הכנסה בחודש הזה ₪';
    if (on && !$('incList').children.length) $('incList').append(incRow());
    updIncTotal();
  }
  function fillIncomeSheet(m) {
    const d = incomeDoc(m);
    $('fIncome').value = d.incomeMain ? groupNum(d.incomeMain) : '';
    $('incList').textContent = '';
    d.extras.forEach(x => $('incList').append(incRow(x)));
    $('fMoreInc').checked = d.extras.length > 0;
    syncMoreInc();
  }
  $('fMoreInc').onchange = () => { syncMoreInc(); if ($('fMoreInc').checked) { const f = $('incList').querySelector('.inc-name'); if (f && !f.value) f.focus(); } };
  $('incAdd').onclick = () => { const li = incRow(); $('incList').append(li); li.querySelector('.inc-name').focus(); };
  $('fIncome').addEventListener('input', updIncTotal);

  const GROUP = { add: 'item', edit: 'item', income: 'income', goalNew: 'goal', goalEdit: 'goal', deposit: 'deposit', rename: 'rename', encpass: 'encpass', recovery: 'recovery', savNew: 'saving', savEdit: 'saving', savBal: 'savbal', spend: 'spend', joinOther: 'joinother', scan: 'scan', catNew: 'cat', catEdit: 'cat', over: 'over', cats: 'cats' };
  function openSheet(mode, obj) {
    state.sheet = { mode, id: obj ? obj.id : null };
    document.querySelectorAll('.sgroup').forEach(g => { g.hidden = g.dataset.for !== GROUP[mode]; });
    sheetError('');
    $('confirmBox').hidden = true; $('sheetActions').hidden = false;
    $('deleteBtn').hidden = !(mode === 'edit' || mode === 'goalEdit' || mode === 'savEdit' || (mode === 'catEdit' && !(obj && obj.id === 'misc')));
    $('deleteBtn').textContent = mode === 'catEdit' ? 'מחיקת הקטגוריה' : 'מחיקה';
    $('sheetX').hidden = mode === 'recovery';
    closeNewCat();
    $('saveBtn').textContent = mode === 'deposit' ? 'שמירה' : 'שמירה';
    let focus = null;
    if (mode === 'add') { $('sheetTitle').textContent = 'הוצאה חדשה ב' + label(state.view); $('fName').value = ''; $('fAmount').value = ''; $('fRec').checked = false; $('fSplit').checked = false; fillLink(null); setCat(state.catFilter || null, !state.catFilter); focus = 'fAmount'; }
    if (mode === 'edit') { $('sheetTitle').textContent = 'עריכת הוצאה'; $('fName').value = obj.name; $('fAmount').value = groupNum(obj.amount ?? ''); $('fRec').checked = !!obj.recurring; $('fSplit').checked = !!obj.split; fillLink(obj); setCat(catOf(obj), !obj.cat); }
    if (mode === 'income') { $('sheetTitle').textContent = 'הכנסה ב' + label(state.view); fillIncomeSheet(state.months[state.view] || {}); focus = 'fIncome'; }
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
    if (mode === 'cats') { $('sheetTitle').textContent = 'הקטגוריות שלנו'; fillCatChips($('shCats'), $('shCatsHidden'), $('shCatsHiddenWrap'), true); }
    if (mode === 'over') { $('sheetTitle').textContent = (overInfo(state.view).on ? 'ממה נוצרה החריגה ב' : 'ההוצאות ב') + label(state.view); renderOverSheet(); }
    if (mode === 'catNew' || mode === 'catEdit') {
      const c = mode === 'catEdit' ? CAT_BY[obj.id] : null;
      $('sheetTitle').textContent = c ? (c.custom ? 'עריכת קטגוריה' : 'עריכת הקטגוריה ' + c.n) : 'קטגוריה חדשה';
      const builtin = !!(c && !c.custom);
      $('cName').value = c ? c.n : ''; $('cEmoji').value = c ? c.e : '';
      $('cName').disabled = builtin; $('cNameField').hidden = builtin;
      $('cBuiltinNote').hidden = !builtin;
      const used = new Set(customCats().map(x => x.color));
      catSheetColor = c ? CAT_COLOR[c.id] : (CUSTOM_COLORS.find(x => !used.has(x)) || CUSTOM_COLORS[0]);
      syncCatSheet(); focus = builtin ? null : 'cName';
    }
    if (mode === 'rename') { $('sheetTitle').textContent = 'שם התקציב'; $('rName').value = (state.household && state.household.name) || ''; focus = 'rName'; }
    $('saveBtn').hidden = mode === 'over' || mode === 'cats'; $('cancelBtn').textContent = mode === 'over' || mode === 'cats' ? 'סגירה' : 'ביטול';
    $('saveBtn').textContent = mode === 'scan' ? 'הוספה' : mode === 'joinOther' ? 'הצטרפות' : mode === 'recovery' ? 'סיום' : mode === 'encpass' && obj && obj.enable ? 'המשך' : 'שמירה';
    $('saveBtn').disabled = mode === 'recovery';
    $('cancelBtn').hidden = mode === 'recovery';
    $('scrim').hidden = false; $('sheet').hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { $('scrim').classList.add('open'); $('sheet').classList.add('open'); }));
    if (focus) setTimeout(() => $(focus).focus(), 260);
  }
  function closeSheet() {
    if (state.sheet && state.sheet.back) { state.sheet = null; return openSheet('cats'); }
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
    if (s.mode === 'catNew') {
      const id = addCustomCat($('cName').value, $('cEmoji').value, catSheetColor, (m) => { sheetError(m); $('cName').focus(); });
      if (id) { closeSheet(); render(); }
      return;
    }
    if (s.mode === 'catEdit' && BASE_COLOR[s.id]) {
      // built-in category: only the emoji and color change, for the whole family
      const orig = BASE_CATS.find(x => x.id === s.id);
      const emoji = $('cEmoji').value.trim() || orig.e, color = catSheetColor, did = baseDocId(s.id);
      const same = emoji === orig.e && color === BASE_COLOR[s.id];
      state.cats = (state.cats || []).filter(c => c.id !== did).concat(same ? [] : [{ id: did, base: s.id, emoji, color }]);
      applyCats(state.cats); buildCatChips(); render();
      write(async () => same ? catRef(did).delete() : catRef(did).set(Object.assign(await seal({ emoji }, CAT_SECRET), { base: s.id, color, createdAt: Date.now() })));
      closeSheet(); return;
    }
    if (s.mode === 'catEdit') {
      const name = $('cName').value.trim().replace(/\s+/g, ' '), emoji = $('cEmoji').value.trim() || '🏷️';
      if (!name) { sheetError('צריך לכתוב שם לקטגוריה.'); return $('cName').focus(); }
      if (CATS.some(c => c.id !== s.id && (normName(c.n) === normName(name) || normName(CAT_SHORT[c.id]) === normName(name)))) { sheetError('כבר יש קטגוריה בשם הזה.'); return $('cName').focus(); }
      const color = catSheetColor;
      state.cats = (state.cats || []).map(c => c.id === s.id ? Object.assign({}, c, { name, emoji, color }) : c);
      applyCats(state.cats); buildCatChips(); render();
      write(async () => catRef(s.id).update(Object.assign(await seal({ name, emoji }, CAT_SECRET, true), { color })));
      closeSheet(); return;
    }
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
      const picked = [...$('scanList').querySelectorAll('li')].filter(li => li.querySelector('input[type=checkbox]').checked);
      const noAmt = picked.find(li => !(parseAmount(li.querySelector('.amt').value) > 0));
      if (noAmt) { sheetError('חסר סכום. הקלידו את הסכום לתשלום.'); return noAmt.querySelector('.amt').focus(); }
      const rows = picked
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
      const extras = [];
      if ($('fMoreInc').checked) {
        for (const li of $('incList').children) {
          const n = li.querySelector('.inc-name').value.trim(), r = li.querySelector('.inc-amt').value.trim();
          if (!n && !r) continue;
          const a = parseAmount(r);
          if (!Number.isFinite(a) || a < 0) { sheetError('הסכום של "' + (n || 'הכנסה נוספת') + '" צריך להיות מספר.'); return li.querySelector('.inc-amt').focus(); }
          extras.push({ name: n || 'הכנסה נוספת', amount: a });
        }
      }
      const doc = incomeDoc({ incomeMain: val, extras });
      const mk = state.view; write(async () => monthRef(mk).set(await seal(doc, INCOME_SECRET, true), { merge: true }));
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
  $('sheetX').onclick = closeSheet;
  $('scrim').onclick = closeSheet;
  $('deleteBtn').onclick = () => {
    const s = state.sheet || {};
    const name = s.mode === 'goalEdit' ? (state.goals.find(g => g.id === s.id) || {}).name : s.mode === 'savEdit' ? (state.savings.find(g => g.id === s.id) || {}).name : s.mode === 'catEdit' ? (CAT_BY[s.id] || {}).n : (state.items.find(i => i.id === s.id) || {}).name;
    $('confirmText').textContent = s.mode === 'catEdit'
      ? 'למחוק את הקטגוריה "' + (name || '') + '"? ההוצאות שבה לא יימחקו, הן יעברו לקטגוריה שמתאימה להן אוטומטית (או ל"שונות").' + (BASE_COLOR[s.id] ? ' אפשר להחזיר אותה בהגדרות.' : '')
      : 'למחוק את "' + (name || '') + '"?';
    $('confirmBox').hidden = false; $('sheetActions').hidden = true;
  };
  $('confirmNo').onclick = () => { $('confirmBox').hidden = true; $('sheetActions').hidden = false; };
  $('confirmYes').onclick = () => {
    const s = state.sheet || {}; if (!s.id) return;
    if (s.mode === 'goalEdit') write(() => goalRef(s.id).delete());
    else if (s.mode === 'savEdit') write(() => savRef(s.id).delete());
    else if (s.mode === 'catEdit' && BASE_COLOR[s.id]) setBaseHidden(s.id, true);
    else if (s.mode === 'catEdit') {
      state.cats = (state.cats || []).filter(c => c.id !== s.id); applyCats(state.cats);
      if (state.catFilter === s.id) state.catFilter = null;
      buildCatChips(); render();
      write(() => catRef(s.id).delete());
    }
    else { const it = state.items.find(x => x.id === s.id); if (it) deleteItem(it); }
    closeSheet();
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.sheet) closeSheet(); });

  let pickedCat = null, catAuto = true;
  function setCat(id, auto) {
    catAuto = !!auto; pickedCat = id || guessCat($('fName').value);
    document.querySelectorAll('#fCats button').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === pickedCat ? 'true' : 'false'));
  }
  function buildCatChips() {
    const box = $('fCats'); box.textContent = '';
    for (const c of CATS) {
      const b = el('button', 'chip', c.e + ' ' + c.n); b.type = 'button'; b.dataset.c = c.id;
      b.setAttribute('aria-pressed', c.id === pickedCat ? 'true' : 'false');
      if (c.custom) b.style.setProperty('--cc', c.color);
      b.onclick = () => setCat(c.id, false); box.append(b);
    }
    const add = el('button', 'chip chip-add', '＋ קטגוריה חדשה'); add.type = 'button'; add.id = 'fCatAdd';
    add.onclick = () => { $('fNewCat').hidden = false; $('fNewCatName').value = ''; setNewCatEmoji(''); showNewCatEmojis(false); add.hidden = true; $('fNewCatName').focus(); };
    box.append(add);
    if (state.cats) renderCatSettings();
  }
  buildCatChips();
  // emoji picker of the quick "new category" row in the expense sheet
  function setNewCatEmoji(e) {
    e = String(e || '').trim();
    $('fNewCatEmoji').value = e; $('fNewCatEmojiBtn').textContent = e || '🏷️';
    document.querySelectorAll('#fNewCatGrid .emoji-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.e === e ? 'true' : 'false'));
  }
  function showNewCatEmojis(on) { $('fNewCatEmojis').hidden = !on; $('fNewCatEmojiBtn').setAttribute('aria-expanded', on ? 'true' : 'false'); if (!on) $('fNewCatEmojiOwn').value = ''; }
  (function () {
    const g = $('fNewCatGrid');
    for (const e of CAT_EMOJIS) { const b = el('button', 'emoji-btn', e); b.type = 'button'; b.dataset.e = e; b.setAttribute('aria-label', e); b.onclick = () => { setNewCatEmoji(e); showNewCatEmojis(false); }; g.append(b); }
    $('fNewCatEmojiBtn').onclick = () => showNewCatEmojis($('fNewCatEmojis').hidden);
    $('fNewCatEmojiOwn').addEventListener('input', () => { const v = $('fNewCatEmojiOwn').value.trim(); if (v) { $('fNewCatEmoji').value = v; $('fNewCatEmojiBtn').textContent = v; } });
  })();
  function closeNewCat() { showNewCatEmojis(false); $('fNewCat').hidden = true; const a = $('fCatAdd'); if (a) a.hidden = false; }
  // Adds a family category. Returns its id, or null with an error shown.
  function addCustomCat(name, emoji, color, onError) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    emoji = String(emoji || '').trim();
    if (!name) { onError('צריך לכתוב שם לקטגוריה.'); return null; }
    if (CATS.some(c => normName(c.n) === normName(name) || normName(CAT_SHORT[c.id]) === normName(name))) { onError('כבר יש קטגוריה בשם הזה.'); return null; }
    const used = new Set(customCats().map(c => c.color));
    const doc = { name, emoji: emoji || '🏷️', color: color || CUSTOM_COLORS.find(x => !used.has(x)) || CUSTOM_COLORS[customCats().length % CUSTOM_COLORS.length], createdAt: Date.now() };
    const id = 'c' + rid();
    // Show it right away; the saved copy replaces it when it syncs.
    state.cats = (state.cats || []).filter(c => c.id !== id).concat([Object.assign({ id }, doc)]);
    applyCats(state.cats); buildCatChips();
    write(async () => catRef(id).set(await seal(doc, CAT_SECRET)));
    return id;
  }
  $('fNewCatOk').onclick = () => {
    const id = addCustomCat($('fNewCatName').value, $('fNewCatEmoji').value, null, (m) => { sheetError(m); $('fNewCatName').focus(); });
    if (!id) return;
    sheetError(''); closeNewCat(); setCat(id, false); render();
  };
  $('fNewCatCancel').onclick = () => { sheetError(''); closeNewCat(); };
  $('fNewCatName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('fNewCatOk').click(); } });
  $('fName').addEventListener('input', () => { if (catAuto) setCat(null, true); });
  $('fLink').addEventListener('change', () => { if (catAuto && $('fLink').value.startsWith('sav:') && CAT_BY.save) setCat('save', true); });
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
      const scale = img.naturalWidth > 2400 ? 2400 / img.naturalWidth : Math.min(3, Math.max(1, 1600 / img.naturalWidth)); // big phone photos are shrunk so the phone does not run out of memory
      const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, cv.width, cv.height);
      const d = cx.getImageData(0, 0, cv.width, cv.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) { const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = g; }
      cx.putImageData(d, 0, 0);
      const paper = cropPaper(cv, d); if (paper) return paper; // a photo of white paper: never inverted, even in a dim shop
      lightBackground(p, cv.width, cv.height); cx.putImageData(d, 0, 0); // dark mode, or a dark header above a light list
      return cv;
    } finally { URL.revokeObjectURL(url); }
  }
  // Every part of a screenshot becomes dark text on a light background: a dark-mode page, a navy header,
  // a light list - each area is judged by its own background (the median of the blocks around it), not the page average.
  function blockMedians(p, W, H, B) {
    const bw = Math.ceil(W / B), bh = Math.ceil(H / B), med = new Uint8Array(bw * bh), hist = new Uint32Array(256);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      hist.fill(0); let n = 0;
      for (let y = by * B; y < Math.min(H, by * B + B); y++) for (let x = bx * B; x < Math.min(W, bx * B + B); x++) { hist[p[(y * W + x) * 4]]++; n++; }
      let acc = 0, v = 0; for (; v < 256; v++) { acc += hist[v]; if (acc * 2 >= n) break; }
      med[by * bw + bx] = v;
    }
    return { med, bw, bh };
  }
  function lightBackground(p, W, H) {
    const B = 32, { med, bw, bh } = blockMedians(p, W, H, B);
    const dark = new Uint8Array(bw * bh), nb = [];
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      nb.length = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const y = by + dy, x = bx + dx; if (y >= 0 && x >= 0 && y < bh && x < bw) nb.push(med[y * bw + x]); }
      nb.sort((a, b) => a - b); dark[by * bw + bx] = nb[nb.length >> 1] < 128 ? 1 : 0;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!dark[((y / B) | 0) * bw + ((x / B) | 0)]) continue;
      const i = (y * W + x) * 4; p[i] = p[i + 1] = p[i + 2] = 255 - p[i];
    }
  }
  // A photo of a receipt held in the hand: cut out the white paper and enlarge it, so the
  // small print is big enough to read. Screenshots are white edge to edge and stay as they are.
  function cropPaper(cv, d) {
    const W = cv.width, H = cv.height, p = d.data;
    const hist = new Uint32Array(256); for (let i = 0; i < p.length; i += 4) hist[p[i]]++;
    let acc = 0, p92 = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= 0.92 * W * H) { p92 = v; break; } }
    const thr = p92 - 25, col = new Float32Array(W), row = new Float32Array(H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p[(y * W + x) * 4] > thr) { col[x]++; row[y]++; }
    let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1;
    while (x0 < W && col[x0] / H < 0.15) x0++; while (x1 > x0 && col[x1] / H < 0.15) x1--;
    while (y0 < H && row[y0] / W < 0.10) y0++; while (y1 > y0 && row[y1] / W < 0.10) y1--;
    const cw = x1 - x0, ch = y1 - y0;
    if (cw < W * 0.2 || ch < H * 0.2 || cw > W * 0.85) return null; // no paper found, or it already fills the picture
    const padX = Math.round(cw * 0.06), padY = Math.round(ch * 0.02);
    x0 = Math.max(0, x0 - padX); x1 = Math.min(W - 1, x1 + padX); y0 = Math.max(0, y0 - padY); y1 = Math.min(H - 1, y1 + padY);
    const sw = x1 - x0, sh = y1 - y0, k = Math.min(2.5, 1800 / sw, Math.sqrt(9e6 / (sw * sh)));
    const out = document.createElement('canvas'); out.width = Math.round(sw * k); out.height = Math.round(sh * k);
    const ox = out.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(cv, x0, y0, sw, sh, 0, 0, out.width, out.height);
    out.isPaper = true;
    return out;
  }
  // Shared clean-up for one line of recognised text: drops direction marks, currency, dates, times, years and card digits.
  const MONTHS_RE = '(?:ינו(?:אר)?|פבר(?:ואר)?|מרץ|מרס|אפר(?:יל)?|מאי|יוני?|יולי?|אוג(?:וסט)?|ספט(?:מבר)?|אוק(?:טובר)?|נוב(?:מבר)?|דצמ(?:בר)?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z׳\']*';
  function cleanLine(line) {
    return String(line || '').replace(/[‎‏‪-‮]/g, '').replace(/₪|ש"ח|ש״ח|\bשח\b|nis/gi, ' ').trim();
  }
  function stripDates(line) {
    return line
      .replace(/\d{1,4}\s*[./\-]\s*\d{1,2}\s*[./\-]\s*\d{1,4}/g, ' ')            // 08/11/2026, 2026-11-08, 8 . 11 . 26
      .replace(/(^|[^\d,.])(\d{1,2})\s*([./])\s*(\d{1,2})(?![\d,])/g, (m, p, d, sep, mo) => // 08/11, 8.11 (but not a price like 12.50 alone)
        (Number(d) >= 1 && Number(d) <= 31 && Number(mo) >= 1 && Number(mo) <= 12 && (sep === '/' || (line.match(/\d+/g) || []).length > 2)) ? p + ' ' : m)
      .replace(new RegExp('\\d{1,2}\\s*(?:ב|ל)?' + MONTHS_RE + '(?:\\s*\\d{2,4})?', 'gi'), ' ') // 8 בנובמבר 2026
      .replace(new RegExp(MONTHS_RE + '\\s*\\d{2,4}', 'gi'), ' ')                // נובמבר 2026
      .replace(/\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?/g, ' ')                     // 14:29
      .replace(/(^|\D)(?:19|20)\d{2}(?=\D|$)/g, (m, p) => p + ' ')               // a lone year
      .replace(/\*+\s*\d{4}|\d{4}\s*\*+/g, ' ');                                  // card digits ****1234
  }
  const NUM_RE = /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g;
  // Turn recognised text into {name, amount} lines.
  function parseScan(text) {
    const out = [];
    for (let line of String(text || '').split(/\n+/)) {
      line = cleanLine(line);
      if (!line) continue;
      if (/^(ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s*\d{4}$|^\d{4}\s*(ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)$/.test(line)) continue; // a month title
      const noDates = stripDates(line);
      const nums = noDates.match(NUM_RE);
      if (!nums) continue;
      const cand = nums.map(n => ({ n, v: Number(n.replace(/,/g, '')) })).filter(x => x.v > 0 && x.v < 1000000);
      if (!cand.length) continue;
      const score = (x) => (/[.,]/.test(x.n) ? 2 : 0) + (x.v >= 1 ? 1 : 0);
      const best = cand.reduce((a, b) => (score(b) > score(a) || (score(b) === score(a) && b.v > a.v) ? b : a));
      const amount = best.v;
      // Keep other numbers in the name (like "3 months"), drop the amount and stray symbols such as ✅.
      const i = noDates.lastIndexOf(best.n);
      const name = (noDates.slice(0, i) + ' ' + noDates.slice(i + best.n.length)).replace(WALLET_RE, ' ')
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
  // ---------- bank and card app screenshots: read the page by where things are ----------
  // Apps like Cal, Max or the bank show every expense as a card: the date and the shop on one side, the amount
  // on the other (big digits, small agorot and a ₪), sometimes an "Apple Pay" badge in between. Read as plain lines
  // these get mixed up, so: find every piece of text and where it sits, read each piece again on its own,
  // read amounts glyph by glyph, and put together what sits on the same card.
  const WALLET_RE = /(?:^|[^A-Za-z])(?:apple|google|samsung|g)\s*pay(?![A-Za-z])|(?:^|[^A-Za-z])gpay(?![A-Za-z])/gi;
  const HEADER_RE = /נכון\s*ל|עודכ|חיוב\s*הבא|ס[הח]\s*["״'׳`]{0,2}\s*כ(?![א-ת])|סך\s*ה?כו?ל|יתרה|מסגרת|\btotal\b|\bbalance\b/i;
  const DATE_RE = new RegExp('\\d{1,4}\\s*[./\\-]\\s*\\d{1,2}\\s*[./\\-]\\s*\\d{2,4}|(?:^|\\D)\\d{1,2}\\s*/\\s*\\d{1,2}(?!\\d)|\\d{1,2}\\s*(?:ב|ל)?' + MONTHS_RE, 'i');
  const lettersIn = (s) => (s.match(/[֐-׿A-Za-z]/g) || []).length;
  function nameOk(name) {
    const words = name.split(' ').filter(Boolean);
    return words.some(w => lettersIn(w) >= 3) || (words.length === 1 && lettersIn(words[0]) >= 2);
  }
  function tidyName(str) {
    return stripDates(cleanLine(str)).replace(WALLET_RE, ' ')
      .replace(/[^֐-׿A-Za-z0-9\s'"״׳&-]/g, ' ').replace(/(^|\s)[-'"&]+(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ').trim().replace(/^\d\s+|\s+\d$/g, '').trim();
  }
  // What a piece of text is: a date, an amount on its own, a name, or a whole "name + amount" line.
  function classifyPiece(t) {
    const raw = String(t || ''), c = cleanLine(raw), hasDate = DATE_RE.test(c);
    const s = stripDates(c).replace(WALLET_RE, ' ').replace(/[wW](?=\s*[+\-−–]?\s*\d)/g, ' ').replace(/(\d)\s*[wW](?![A-Za-z])/g, '$1 ') // ₪ is often read as "w"
      .replace(/\d+\s*-\s*\d{4,}/g, ' '); // an account number like 349-267693
    const L = lettersIn(s), digits = /\d/.test(s), shekel = /₪|ש"ח|ש״ח/.test(raw);
    let kind = L === 0 ? (digits || shekel ? 'amount' : hasDate ? 'date' : 'junk') : (digits ? 'row' : 'text');
    if (kind === 'amount' && !digits && !shekel) kind = 'junk';
    if (/יתרה|יתרת|\bbalance\b/i.test(c)) kind = 'junk'; // the balance after each line is not an expense
    if (new RegExp('^\\s*' + MONTHS_RE + '\\s*$', 'i').test(s)) kind = 'date'; // "נוב'" under the day
    const sure = !shekel && s.split(/\s+/).some(w => lettersIn(w) >= 3); // clearly words, not a misread amount
    return { kind, hasDate: hasDate || kind === 'date', text: c, sure, plus: /\+\s*\d/.test(c) };
  }
  // Black-on-white pixels of one box (Otsu threshold; light text on a dark card is flipped).
  function inkOf(cv, bb, pad) {
    const x0 = Math.max(0, Math.floor(bb.x0 - pad)), y0 = Math.max(0, Math.floor(bb.y0 - pad));
    const x1 = Math.min(cv.width, Math.ceil(bb.x1 + pad)), y1 = Math.min(cv.height, Math.ceil(bb.y1 + pad));
    const W = x1 - x0, H = y1 - y0; if (W < 4 || H < 4) return null;
    const d = cv.getContext('2d').getImageData(x0, y0, W, H).data, n = W * H, hist = new Float64Array(256);
    for (let i = 0; i < n; i++) hist[d[i * 4]]++;
    let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v];
    let sB = 0, wB = 0, best = -1, th = 127;
    for (let v = 0; v < 256; v++) { wB += hist[v]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += v * hist[v]; const m = sB / wB - (sum - sB) / wF, b = wB * wF * m * m; if (b > best) { best = b; th = v; } }
    let dark = 0; for (let i = 0; i < n; i++) if (d[i * 4] <= th) dark++;
    const inkIsDark = dark <= n / 2, ink = new Uint8Array(n);
    for (let i = 0; i < n; i++) ink[i] = (d[i * 4] <= th) === inkIsDark ? 1 : 0;
    return { x0, y0, W, H, ink };
  }
  function inkCanvas(g) {
    const c = document.createElement('canvas'); c.width = g.W; c.height = g.H;
    const cx = c.getContext('2d'), id = cx.createImageData(g.W, g.H);
    for (let i = 0; i < g.ink.length; i++) { const v = g.ink[i] ? 0 : 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    cx.putImageData(id, 0, 0); return c;
  }
  // One line of text, cleaned to black on white and sized the way the reader likes it (about 40px high).
  function lineCanvas(cv, bb, h) {
    const g = inkOf(cv, bb, 6); if (!g) return null;
    const k = h / Math.max(1, bb.y1 - bb.y0), out = document.createElement('canvas');
    out.width = Math.round(g.W * k) + 40; out.height = Math.round(g.H * k) + 40;
    const cx = out.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, out.width, out.height);
    cx.imageSmoothingQuality = 'high'; cx.drawImage(inkCanvas(g), 20, 20, out.width - 40, out.height - 40);
    return out;
  }
  // An amount on its own, like "₪308.45" with small agorot: split it into glyphs, drop the ₪, give every
  // digit the same size and read only digits. Returns {v, conf} or null.
  async function readAmountBox(worker, cv, bb) {
    const g = inkOf(cv, bb, 6); if (!g) return null;
    const { W, H, ink } = g, lab = new Int32Array(W * H), comps = [];
    for (let i = 0; i < W * H; i++) {
      if (!ink[i] || lab[i]) continue;
      const c = { x0: W, y0: H, x1: -1, y1: -1, n: 0 }, st = [i]; comps.push(c); lab[i] = comps.length;
      while (st.length) {
        const j = st.pop(), x = j % W, y = (j - x) / W; c.n++;
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const k = yy * W + xx; if (ink[k] && !lab[k]) { lab[k] = comps.length; st.push(k); }
        }
      }
    }
    const big = Math.max(0, ...comps.map(c => c.y1 - c.y0 + 1));
    const gl = [];
    for (const c of comps.filter(c => c.n > 3 && !(c.x0 === 0 || c.y0 === 0 || c.x1 === W - 1 || c.y1 === H - 1) || (c.n > 3 && c.y1 - c.y0 + 1 >= big * 0.5)).sort((a, b) => a.x0 - b.x0)) {
      const last = gl[gl.length - 1], ov = last ? Math.min(last.x1, c.x1) - Math.max(last.x0, c.x0) : -1;
      if (last && ov > 0.5 * Math.min(last.x1 - last.x0, c.x1 - c.x0)) { last.x0 = Math.min(last.x0, c.x0); last.x1 = Math.max(last.x1, c.x1); last.y0 = Math.min(last.y0, c.y0); last.y1 = Math.max(last.y1, c.y1); }
      else gl.push(Object.assign({}, c));
    }
    if (!gl.length || gl.length > 16) return null;
    const maxH = Math.max(...gl.map(q => q.y1 - q.y0 + 1)), tall = gl.filter(q => q.y1 - q.y0 + 1 >= 0.7 * maxH);
    const top = Math.min(...tall.map(q => q.y0)), base = Math.max(...tall.map(q => q.y1));
    for (const q of gl) {
      const h = q.y1 - q.y0 + 1, w = q.x1 - q.x0 + 1;
      if (w < 0.25 * maxH && h < 0.5 * maxH && q.y0 > top + 0.55 * (base - top)) q.dot = true; // a point or a comma on the baseline
      else if (h < 0.3 * maxH && w > 1.3 * h && q.y1 < base - 0.15 * maxH) q.drop = true; // a minus sign (the amount is kept as it is)
      else if (h < 0.2 * maxH && w < 0.2 * maxH) q.drop = true; // a speck
    }
    let keep = gl.filter(q => !q.drop);
    const src = inkCanvas(g);
    const single = async (q) => {
      const h = q.y1 - q.y0 + 1, w = q.x1 - q.x0 + 1, k = 60 / h, c = document.createElement('canvas');
      c.width = Math.round(w * k) + 60; c.height = 120; const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(src, q.x0, q.y0, w, h, 30, 30, Math.round(w * k), 60);
      return (await worker.recognize(c)).data.text.trim();
    };
    // the ₪ sits at one end; the reader cannot tell it from a digit when it has to pick a digit, so ask first
    await worker.setParameters({ tessedit_pageseg_mode: '10', tessedit_char_whitelist: '0123456789₪+-' });
    let plus = false;
    for (const end of ['first', 'last', 'first']) { // "₪+781.20": the ₪, then the + behind it
      const solid = keep.filter(q => !q.dot); const q = end === 'first' ? solid[0] : solid[solid.length - 1];
      if (!q || solid.length < 2) continue;
      const t = await single(q), small = q.y1 - q.y0 + 1 < 0.75 * maxH;
      if (/₪/.test(t) || /[+\-]/.test(t) || (t === '' && small)) { keep = keep.filter(z => z !== q); if (/\+/.test(t)) plus = true; }
    }
    while (keep.length && keep[0].dot) keep.shift(); while (keep.length && keep[keep.length - 1].dot) keep.pop();
    const digitsOnly = keep.filter(q => !q.dot);
    if (!digitsOnly.length) return null;
    // small agorot printed without a point: "45⁰⁰"
    if (!keep.some(q => q.dot) && digitsOnly.length >= 3) {
      const hs = digitsOnly.map(q => q.y1 - q.y0 + 1), top = Math.max(...hs), n = hs.length;
      if (hs[n - 1] < 0.8 * top && hs[n - 2] < 0.8 * top && hs[n - 3] >= 0.9 * top) keep.splice(keep.indexOf(digitsOnly[n - 2]), 0, { dot: true });
    }
    // a separator with three digits after it is a thousands comma: leave it out, the reader copes better
    keep = keep.filter((q, i) => { if (!q.dot) return true; let n = 0, j = i + 1; while (j < keep.length && !keep[j].dot) { n++; j++; } return n !== 3; });
    const render = (S, GAP) => {
      const widths = keep.map(q => q.dot ? Math.round(S / 6) : Math.max(6, Math.round((q.x1 - q.x0 + 1) * S / (q.y1 - q.y0 + 1))));
      const out = document.createElement('canvas'); out.width = widths.reduce((a, w) => a + w + GAP, 40); out.height = S + 40;
      const ox = out.getContext('2d'); ox.fillStyle = '#fff'; ox.fillRect(0, 0, out.width, out.height); ox.imageSmoothingQuality = 'high';
      let X = 20;
      keep.forEach((q, i) => {
        if (q.dot) { ox.fillStyle = '#000'; ox.fillRect(X, 20 + S - widths[i], widths[i], widths[i]); }
        else ox.drawImage(src, q.x0, q.y0, q.x1 - q.x0 + 1, q.y1 - q.y0 + 1, X, 20, widths[i], S);
        X += widths[i] + GAP;
      });
      return out;
    };
    // every glyph must come back as one digit; if the reader drops or adds one, read it again at another size
    await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789.' });
    const want = keep.filter(q => !q.dot).length;
    let first = null;
    for (const [S, GAP] of [[50, 14], [40, 10], [64, 18], [32, 8]]) {
      const rd = (await worker.recognize(render(S, GAP))).data, t = String(rd.text || '').replace(/[^\d.]/g, '');
      const got = { t, conf: rd.confidence || 0 };
      if (!first) first = got;
      if (t.replace(/\D/g, '').length === want) { first = got; break; }
    }
    await worker.setParameters({ tessedit_char_whitelist: '' });
    const v = amountFromDigits(first.t);
    return v ? { v, conf: first.conf, plus } : null;
  }
  // "1.250.00" → 1250, "45.00" → 45, "1.250" → 1250 (three digits after a point are thousands)
  function amountFromDigits(t) {
    const parts = String(t || '').split('.').filter((p, i, a) => p !== '' || i === a.length - 1);
    if (!parts.length || !parts.join('')) return null;
    let s;
    if (parts.length === 1) s = parts[0];
    else { const last = parts[parts.length - 1]; s = last.length && last.length <= 2 ? parts.slice(0, -1).join('') + '.' + last : parts.join(''); }
    const v = Number(s);
    return v > 0 && v < 1000000 ? Math.round(v * 100) / 100 : null;
  }
  // Puts the pieces of a page back together. items: {x0, y0, x1, y1, kind, text, hasDate, amount, name}.
  // An amount on its own takes the names (and dates) that sit beside it on the same card.
  function groupLayout(items) {
    const cy = b => (b.y0 + b.y1) / 2, hh = b => Math.max(1, b.y1 - b.y0);
    const xov = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) / Math.max(1, Math.min(a.x1 - a.x0, b.x1 - b.x0));
    // a date column ("09" over "נוב'", as in Leumi): once two month words line up, everything in that column is a date
    const months = items.filter(b => b.kind === 'date' && new RegExp('^\\s*' + MONTHS_RE + '\\s*$', 'i').test(b.text));
    const col = months.length >= 2 ? months.filter(m => months.filter(o => xov(m, o) > 0.6).length >= 2) : [];
    if (col.length >= 2) {
      const c = { x0: Math.min(...col.map(m => m.x0)), x1: Math.max(...col.map(m => m.x1)) }, w = c.x1 - c.x0;
      const wide = { x0: c.x0 - 0.3 * w, x1: c.x1 + 0.3 * w };
      items = items.map(b => b.kind !== 'date' && b.x0 >= wide.x0 && b.x1 <= wide.x1 ? Object.assign({}, b, { kind: 'date', hasDate: true }) : b);
    }
    const anchors = items.filter(b => b.kind === 'amount').map(a => Object.assign({ parts: [] }, a));
    const near = (a, b) => Math.abs(cy(a) - cy(b)) <= 1.25 * Math.max(hh(a), hh(b));
    // a "name 12" line on a card that already has its own amount column: the 12 is a misread, the line is the name
    items = items.map(b => b.kind === 'row' && anchors.some(a => near(a, b) && (a.x1 < b.x0 || b.x1 < a.x0)) ? Object.assign({}, b, { kind: 'text', text: b.name }) : b);
    for (const b of items) {
      if (b.kind !== 'text' && b.kind !== 'date') continue;
      let best = null, bd = Infinity;
      for (const a of anchors) { const d = Math.abs(cy(a) - cy(b)); if (d < bd && d <= 1.25 * Math.max(hh(a), hh(b))) { bd = d; best = a; } }
      if (best) best.parts.push(b);
    }
    const rows = [];
    for (const a of anchors) {
      const parts = a.parts.slice().sort((p, q) => Math.abs(cy(p) - cy(q)) < 0.5 * Math.min(hh(p), hh(q)) ? q.x1 - p.x1 : cy(p) - cy(q));
      const texts = parts.filter(p => p.kind === 'text');
      rows.push({ y: cy(a), name: tidyName(texts.map(p => p.text).join(' ')), amount: a.amount, credit: a.credit,
        dated: parts.some(p => p.hasDate), head: parts.some(p => HEADER_RE.test(p.text)) });
    }
    const dates = items.filter(b => b.kind === 'date');
    // a second line under an amount, in the same column (a balance the reader garbled): not an expense of its own
    const underAmount = (b) => anchors.some(a => xov(a, b) > 0.5 && cy(b) > cy(a) && b.y0 - a.y1 < 0.8 * hh(a));
    for (const b of items) if (b.kind === 'row' && b.name && !underAmount(b)) rows.push({ y: cy(b), name: b.name, amount: b.amount, head: HEADER_RE.test(b.text),
      dated: b.hasDate || dates.some(d => near(d, b) || (cy(d) > cy(b) && cy(d) - b.y1 < 1.5 * hh(b))) }); // a date beside it, or just under it
    rows.sort((p, q) => p.y - q.y);
    const dated = rows.filter(r => r.dated && r.name && nameOk(r.name)), list = dated.length >= 2;
    const first = list ? dated[0].y : 0, last = list ? dated[dated.length - 1].y : 0;
    const out = [];
    for (const r of rows) {
      if (!r.name || !nameOk(r.name) || r.amount == null) continue; // an amount with no shop beside it
      if (list && (r.head || (!r.dated && (r.y < first || r.y > last)))) continue; // a bank page: skip the header (card number, next charge, "as of")
      if (r.credit) continue; // money coming in (+ on a bank page) is not an expense
      out.push({ name: r.name, amount: r.amount, on: !r.head });
    }
    out.list = list;
    return out;
  }
  // Text the first look missed (thin grey digits are easy to miss): clusters of pixels clearly darker than
  // the background around them, joined into words, that no piece found so far covers.
  function missedPieces(cv, found) {
    const W0 = cv.width, H0 = cv.height, p = cv.getContext('2d').getImageData(0, 0, W0, H0).data;
    const { med, bw } = blockMedians(p, W0, H0, 32);
    const S = 2, W = Math.floor(W0 / S), H = Math.floor(H0 / S), ink = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const X = x * S, Y = y * S;
      if (p[(Y * W0 + X) * 4] < med[((Y / 32) | 0) * bw + ((X / 32) | 0)] - 40) ink[y * W + x] = 1;
    }
    const lab = new Int32Array(W * H), comps = [];
    for (let i = 0; i < W * H; i++) {
      if (!ink[i] || lab[i]) continue;
      const c = { x0: W, y0: H, x1: -1, y1: -1, n: 0 }, st = [i]; comps.push(c); lab[i] = comps.length;
      while (st.length) {
        const j = st.pop(), x = j % W, y = (j - x) / W; c.n++;
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        if (x > 0 && ink[j - 1] && !lab[j - 1]) { lab[j - 1] = comps.length; st.push(j - 1); }
        if (x < W - 1 && ink[j + 1] && !lab[j + 1]) { lab[j + 1] = comps.length; st.push(j + 1); }
        if (y > 0 && ink[j - W] && !lab[j - W]) { lab[j - W] = comps.length; st.push(j - W); }
        if (y < H - 1 && ink[j + W] && !lab[j + W]) { lab[j + W] = comps.length; st.push(j + W); }
      }
    }
    const cs = comps.filter(c => c.n >= 4 && c.y1 - c.y0 < 110 && c.x1 - c.x0 < W * 0.5).sort((a, b) => a.y0 - b.y0);
    const parent = cs.map((c, i) => i), root = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length && cs[j].y0 <= cs[i].y1; j++) {
      const a = cs[i], b = cs[j], ha = a.y1 - a.y0 + 1, hb = b.y1 - b.y0 + 1;
      const ov = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1, gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      if (ov >= 0.5 * Math.min(ha, hb) && gap <= 0.8 * Math.max(ha, hb)) parent[root(i)] = root(j);
    }
    const boxes = new Map();
    cs.forEach((c, i) => { const r = root(i), b = boxes.get(r); if (!b) boxes.set(r, { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, n: 1 }); else { b.x0 = Math.min(b.x0, c.x0); b.y0 = Math.min(b.y0, c.y0); b.x1 = Math.max(b.x1, c.x1); b.y1 = Math.max(b.y1, c.y1); b.n++; } });
    const covered = (b) => found.some(f => { const ix = Math.min(b.x1, f.x1) - Math.max(b.x0, f.x0), iy = Math.min(b.y1, f.y1) - Math.max(b.y0, f.y0); return ix > 0 && iy > 0 && ix * iy > 0.3 * Math.min((b.x1 - b.x0) * (b.y1 - b.y0), (f.x1 - f.x0) * (f.y1 - f.y0)); });
    const out = [];
    for (const b0 of boxes.values()) {
      const b = { x0: b0.x0 * S, y0: b0.y0 * S, x1: (b0.x1 + 1) * S, y1: (b0.y1 + 1) * S }, h = b.y1 - b.y0, w = b.x1 - b.x0;
      if (h < 16 || h > 200 || w < 0.5 * h || w > 25 * h || b0.n < 2) continue;
      if (!covered(b)) out.push(b);
    }
    return out;
  }
  // Reads a screenshot by its layout. Returns {text, rows}, or null when the reader gave no positions.
  async function readLayout(worker, cv, onStep) {
    if (!worker.setParameters) return null;
    await worker.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '' }); // find every piece of text, wherever it is
    const { data } = await worker.recognize(cv, {}, { blocks: true, text: true });
    if (!data || !Array.isArray(data.blocks)) return null;
    const lines = [];
    for (const bl of data.blocks) for (const pa of bl.paragraphs || []) for (const ln of pa.lines || []) if (ln.bbox && ln.bbox.y1 - ln.bbox.y0 >= 8 && (ln.text || '').trim()) lines.push(ln);
    // plain text in reading order (pieces on the same height joined right to left), for receipts and as a fallback
    const byY = lines.slice().sort((a, b) => a.bbox.y0 - b.bbox.y0), vis = [];
    for (const ln of byY) {
      const c = (ln.bbox.y0 + ln.bbox.y1) / 2, h = ln.bbox.y1 - ln.bbox.y0;
      const row = vis.find(r => Math.abs(r.c - c) < 0.5 * Math.min(r.h, h));
      if (row) row.parts.push(ln); else vis.push({ c, h, parts: [ln] });
    }
    const text = vis.map(r => r.parts.sort((a, b) => b.bbox.x1 - a.bbox.x1).map(l => l.text.trim()).join(' ')).join('\n');
    const items = [];
    let extra = [];
    try { extra = missedPieces(cv, lines.map(l => l.bbox)).map(bbox => ({ bbox, text: '', confidence: 0, missed: true })); } catch (e) { extra = []; }
    const all = lines.concat(extra);
    let i = 0;
    for (const ln of all) {
      if (onStep) onStep(i++, all.length);
      const bb = ln.bbox, first = ln.missed ? { kind: 'unknown', text: '' } : classifyPiece(ln.text);
      if (first.kind === 'junk') continue;
      let best = first, conf = ln.confidence || 0;
      if (first.kind !== 'date' && !(conf >= 90 && first.sure)) {
        await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '' });
        const lc = lineCanvas(cv, bb, 40);
        const r = lc ? (await worker.recognize(lc)).data : null;
        const again = r ? classifyPiece(r.text) : null;
        if (again && again.kind === 'amount') best = again;
        else if (ln.missed) { if (again && again.sure && (r.confidence || 0) >= 70) best = again; else if (again && again.kind === 'date') best = again; }
        else if (again && first.kind === 'text' && again.kind === 'row') { /* a stray digit read into a name: keep it a name */ }
        else if (again && first.kind !== 'amount' && again.kind !== 'junk' && (r.confidence || 0) >= conf) { best = again; conf = r.confidence; }
      }
      if (best.kind === 'unknown') { // a missed piece that does not read as words: maybe a big thin amount
        const a = await readAmountBox(worker, cv, bb).catch(() => null);
        if (a && a.conf >= 75) items.push({ x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, kind: 'amount', text: '', amount: a.v });
        continue;
      }
      const item = { x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, kind: best.kind, text: best.text, hasDate: !!(first.hasDate || best.hasDate) };
      if (best.kind === 'amount') {
        const a = await readAmountBox(worker, cv, bb).catch(() => null);
        item.amount = a ? a.v : pickAmount(amountsIn(best.text)); item.credit = !!((a && a.plus) || best.plus);
        if (item.amount == null) continue;
      } else if (best.kind === 'row') {
        const p = parseScan(best.text)[0]; if (!p) continue;
        item.name = p.name.replace(WALLET_RE, ' ').replace(/\s+/g, ' ').trim(); item.amount = p.amount;
        // check the amount once more, glyph by glyph, on the word it was read from (a 6 read as 0 changes the sum)
        const want = String(p.amount).replace(/\D/g, '');
        const w = (ln.words || []).filter(x => x.bbox && /\d/.test(x.text)).map(x => ({ x, d: x.text.replace(/\D/g, '') }))
          .sort((a, b) => (b.d === want) - (a.d === want) || Math.abs(a.d.length - want.length) - Math.abs(b.d.length - want.length))[0];
        if (w && Math.abs(w.d.length - want.length) <= 1 && !DATE_RE.test(w.x.text)) {
          const a = await readAmountBox(worker, cv, w.x.bbox).catch(() => null);
          if (a && a.conf >= 80 && String(a.v).replace(/\D/g, '').length === want.length) item.amount = a.v; // only a misread digit is fixed, never a lost one
        }
      }
      items.push(item);
    }
    await worker.setParameters({ tessedit_pageseg_mode: '3', tessedit_char_whitelist: '' });
    return { text, rows: groupLayout(items) };
  }
  // ---------- receipts: one expense = the shop and the final amount paid ----------
  const TOTAL_WORD = /ס[הח]\s*["״'׳`]{0,2}\s*כ(?![א-ת])|סך\s*ה?כו?ל|total/i;          // סה"כ, סה''כ, סהכ, סך הכל, total
  const DUE_WORD = /לתשלו[םס]|לחיוב|amount\s*due|grand\s*total|balance\s*due|total\s*to\s*pay/i;
  const NOT_TOTAL = /מע["״'׳]?מ|מעמ|vat|tax|לפני|ביניים|sub\s*-?\s*total|פריטים|פריט|כמות|יחידות|הנח|חסכ|חיסכ|חסכון|חיסכון|discount|saving|עודף|change|נקוד|points|משקל|qty|items/i;
  const WITH_VAT = /כולל\s*מע["״'׳]?מ|כולל\s*מעמ|incl/i;
  // whole words only (no lookbehind, so older iPhones can still parse this file)
  const WORD = (src) => new RegExp('(?:^|[^\\u0590-\\u05FFA-Za-z])(?:' + src + ')(?![\\u0590-\\u05FFA-Za-z])', 'i');
  const PAY_WORD = /אשראי|כרטיס|ויזה|מאסטר|ישראכרט|אמריקן|דיינרס|פייבוקס|שולם|\b(?:visa|master\w*|isracard|amex|diners|max|cal|bit|paybox|apple\s*pay|google\s*pay|paid|card)\b|(?:^|\s)(?:מקס|כאל|ביט)(?=\s|$)/i;
  const RECEIPT_SIGNS = [
    /לתשלו[םס]|לחיוב|amount\s*due/i,
    /קבלה|חשבונית|receipt|invoice/i,
    /עוסק\s*מורשה|עוסק\s*פטור|ע\s*["״.']?\s*מ\s*[.:]?\s*\d{6,}|ח\s*["״.']?\s*פ\s*[.:]?\s*\d{6,}|ח\.פ|ח"פ|ח״פ|בע["״]?מ/i,
    /מע["״'׳]?מ|מעמ|\bvat\b/i,
    /עודף|מזומן|cash|change/i,
    /קופה|קופאי|קופאית|cashier|\bpos\b/i,
    /אשראי|ויזה|visa|ישראכרט|mastercard|מאסטרקארד|אמריקן\s*אקספרס|דיינרס|credit/i,
    /תודה\s*(ש|ו|על|רבה)|להתראות|thank/i,
    /ברקוד|אסמכתא|מס['׳"]?\s*עסקה|שובר|עסקה|הנפק|מקור|העתק/i,
    /כמות|מחיר\s*ליח|יח['׳]|qty|price/i,
    // bills: electricity, water, phone, internet, arnona, insurance
    /חשבון\s*(?:חשמל|מים|גז|תקופתי|טלפון|סלולר)|תקופת\s*(?:ה?חשבון|ה?חיוב)|חיוב\s*(?:לתקופה|תקופתי)|מספר\s*(?:לקוח|מנוי|חוזה|צרכן|משלם|חשבון)|הוראת\s*קבע|מועד\s*(?:ה?חיוב|ה?תשלום)|ארנונה|קוט["״']?ש|הודעת\s*תשלום|דמי\s*מנוי|פוליסה|פרמיה/i,
  ];
  // Bill senders, shown by the expense they stand for.
  const BILLERS = [
    [/חברת\s*ה?חשמל|\biec\b|חשבון\s*חשמל|אלקטרה\s*פאוור|סלקום\s*אנרגיה|פזאנרגיה|אמישראגז\s*חשמל/i, 'חשמל'],
    [/ארנונה/i, 'ארנונה'],
    [/(?:^|\s)מי\s+[א-ת]|תאגיד\s*(?:ה)?מים|חשבון\s*מים|מקורות|מים\s*וביוב|מי\s*אביבים|הגיחון|מי\s*רעננה|מי\s*שבע|מי\s*כרמל|מי\s*נתניה|מי\s*הרצליה|מי\s*ציונה|מי\s*מודיעין|מי\s*רמת\s*גן|מי\s*לוד|עין\s*אפק|יובלים|פלג\s*הגליל|מי\s*גבעתיים|מי\s*ראשון|מניב\s*ראשון|מי\s*עדן|מי\s*נעם|מיתר|הרי\s*נצרת|מי\s*הוד\s*השרון|מי\s*כפר\s*סבא|מי\s*אשקלון|מי\s*אשדוד|מי\s*יבנה|מי\s*בת\s*ים|מי\s*חולון|מי\s*פתח\s*תקווה|מי\s*בני\s*ברק|מי\s*רחובות/i, 'מים'],
    [/סופרגז|אמישראגז|פזגז|דור\s*גז|חשבון\s*גז/i, 'גז'],
    [/בזק\s*בינלאומי/i, 'בזק בינלאומי'], [/בזק/i, 'בזק'], [/הוט\s*מובייל|hot\s*mobile/i, 'הוט מובייל'], [/(?:^|[^א-ת])הוט(?![א-ת])|\bhot\b/i, 'הוט'],
    [/פרטנר|partner/i, 'פרטנר'], [/סלקום|cellcom/i, 'סלקום'], [/פלאפון|pelephone/i, 'פלאפון'], [/גולן\s*טלקום|golan/i, 'גולן טלקום'],
    [/\byes\b|(?:^|[^א-ת])יס(?![א-ת])/i, 'yes'], [/we4g|רמי\s*לוי\s*תקשורת/i, 'רמי לוי תקשורת'], [/012\s*מובייל|xphone/i, '012 מובייל'], [/019/i, '019'],
    [/נטפליקס|netflix/i, 'נטפליקס'], [/ספוטיפיי|spotify/i, 'ספוטיפיי'],
    [/ביטוח\s*לאומי/i, 'ביטוח לאומי'], [/מכבי/i, 'מכבי'], [/כללית/i, 'כללית'], [/מאוחדת/i, 'מאוחדת'], [/לאומית/i, 'לאומית'],
    [/ועד\s*ה?בית/i, 'ועד בית'],
  ];
  const STORES = WORD('שופרסל|רמי\\s*לוי|ויקטורי|יוחננוף|אושר\\s*עד|חצי\\s*חינם|יינות\\s*ביתן|טיב\\s*טעם|מגה\\s*בעיר|קרפור|carrefour|סופר\\s*יודה|מחסני\\s*השוק|פרש\\s*מרקט|am:?pm|סופר[\\s-]*פארם|super[\\s-]*pharm|גוד\\s*פארם|be\\s*פארם|ניו\\s*פארם|איקאה|ikea|ace|הום\\s*סנטר|ksp|באג|מחסני\\s*חשמל|זארה|zara|h&m|קסטרו|castro|פוקס|fox|גולף|רנואר|ארומה|aroma|קפה\\s*קפה|לנדוור|מקדונלד|mcdonald|בורגר\\s*קינג|burger\\s*king|דומינו|פיצה\\s*האט|פז|paz|סונול|sonol|דור\\s*אלון|delek|דלק|ten|yellow|יילו|אלונית|נייס|wolt|וולט|ביתילי|עליאקספרס|aliexpress|amazon|אמזון|shein');
  // The final amount: prefers "סה"כ לתשלום" / "לתשלום", then a plain "סה"כ", then the card payment line.
  function amountsIn(str) {
    const fixed = str.replace(/(^|[^\d.,])(\d{2})\s+\.(\d{3,})(?!\d)/g, '$1$3.$2') // read right to left: "45 .186" is 186.45
      .replace(/(\d)\s*,\s*(\d{2})(?!\d)/g, '$1.$2').replace(/(\d)\s+\.\s*(\d{2})(?!\d)|(\d)\.\s+(\d{2})(?!\d)/g, (m, a, b, c, d) => (a || c) + '.' + (b || d)); // 123,40 / 123 .40 → 123.40
    return (stripDates(fixed).match(NUM_RE) || []).map(n => ({ n, v: Number(n.replace(/,/g, '')) }))
      .filter(x => x.v > 0 && x.v < 100000 && !(x.v >= 1000 && !/[.,]/.test(x.n) && x.n.length > 5));
  }
  function pickAmount(list) {
    if (!list.length) return null;
    const dec = list.filter(x => /\.\d{2}$/.test(x.n));
    const pool = dec.length ? dec : list;
    return pool.reduce((a, b) => (b.v > a.v ? b : a)).v;
  }
  function receiptStore(lines) {
    const head = lines.slice(0, 12).join('\n');
    for (const [re, name] of BILLERS) if (re.test(head)) return name;
    const known = (part) => { const m = part.join('\n').match(STORES); return m ? m[0].replace(/^[^\u0590-\u05FFA-Za-z]+/, '').replace(/\s+/g, ' ').trim() : ''; };
    const top = known(lines.slice(0, 10)); if (top) return top; // a chain name printed in the header
    for (const raw of lines.slice(0, 8)) {
      const l = cleanLine(raw);
      if (/\d+\.\d{2}/.test(l) || TOTAL_WORD.test(l) || DUE_WORD.test(l)) break; // the item list started
      const l0 = l.replace(/בע\s*["״']?\s*מ/g, ' ');
      if (/^\s*(?:לכבוד|לקוח|שם\s*ה?לקוח|כמות|תקופ|נכס|שטח)/.test(l0)) continue;
      if (/קבלה|חשבונית|מקור|העתק|עוסק|(?:^|\s)ח\s*["״.']?\s*פ(?![א-ת])|ע\s*["״.']\s*מ|(?:^|\s)טל(?:פון)?(?![א-ת])|פקס|fax|tel|רח['׳]|רחוב|כתובת|www|http|@|\.co|קופה|תאריך|שעה|מס['׳"]|סניף\s*\d|מספר/i.test(l0)) continue;
      if (l0 !== l && !/[֐-׿A-Za-z]{3,}/.test(l0)) continue;
      const name = l0.replace(/[^֐-׿A-Za-z\s&'-]/g, ' ').replace(/\s+/g, ' ').trim();
      const longest = Math.max(0, ...name.split(' ').map(w => (w.match(/[֐-׿A-Za-z]/g) || []).length));
      const heb = Math.max(0, ...name.split(' ').map(w => (w.match(/[֐-׿]/g) || []).length));
      if (longest >= 3 && name.length <= 40 && heb >= 3) return name.split(' ').filter(w => !/^[A-Za-z]{1,3}$/.test(w)).join(' ');
    }
    return known(lines.slice(-6)); // some chains print their name only in the footer
  }
  // Returns {name, amount} when the picture looks like a receipt or invoice, otherwise null.
  // force: the person said this picture is one bill, so skip the "does it look like one" check.
  function parseReceipt(text, force) {
    const lines = String(text || '').split(/\n+/).map(l => cleanLine(l).replace(/[|¦│]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (lines.length < (force ? 1 : 3)) return null;
    const all = lines.join('\n');
    let signs = RECEIPT_SIGNS.filter(re => re.test(all)).length;
    if (lines.filter(l => /\d\.\d{2}(?!\d)/.test(l)).length >= 3) signs++; // prices with agorot are typical of receipts
    if (lines.filter(l => /(?:^|\D)\d{12,13}(?!\d)/.test(l)).length >= 2) signs++; // product barcodes
    if (lines.filter(l => /(?:^|[\s=])[-–]\s?\d+[.,]\d{2}(?!\d)/.test(l)).length >= 2) signs++; // discounts
    if (!force && signs < 2) return null;
    const cands = [];
    lines.forEach((l, i) => {
      let rank = 0;
      if (DUE_WORD.test(l) && !/לפני|ביניים|עודף/.test(l)) rank = 4;
      else if (TOTAL_WORD.test(l) && WITH_VAT.test(l)) rank = 3;
      else if (TOTAL_WORD.test(l) && !NOT_TOTAL.test(l)) rank = 2;
      else if (PAY_WORD.test(l) && !NOT_TOTAL.test(l) && !/\d{1,2}\s*מתוך|תשלומים/.test(l)) rank = 1;
      if (!rank) return;
      let amount = pickAmount(amountsIn(l));
      // the amount is sometimes read as its own line, right after (or before) the label
      for (const j of [i + 1, i - 1, i + 2]) {
        if (amount != null) break;
        const nb = lines[j];
        if (nb && !/[֐-׿A-Za-z]{2,}/.test(nb)) amount = pickAmount(amountsIn(nb));
      }
      if (amount != null) cands.push({ rank, amount, i });
    });
    let amount = null;
    if (cands.length) {
      const top = Math.max(...cands.map(c => c.rank));
      amount = cands.filter(c => c.rank === top).pop().amount; // the last one is the final total
    } else {
      // no label was read: the biggest price on the receipt is almost always the total
      // no label was read: trust the biggest price only when it stands on its own line or shows up twice
      // (the total is printed by itself and again next to the payment); otherwise leave it for the person to type.
      const ok = lines.filter(l => !NOT_TOTAL.test(l) && !/מזומן|cash/i.test(l));
      const prices = ok.flatMap(l => amountsIn(l).filter(x => /\.\d{2}$/.test(x.n)).map(x => Object.assign(x, { alone: !/[֐-׿A-Za-z]{2,}/.test(l) })));
      const top = prices.length ? Math.max(...prices.map(x => x.v)) : null;
      const sure = top != null && (prices.filter(x => x.v === top).length >= 2 || prices.some(x => x.v === top && x.alone));
      amount = sure ? top : null;
      if (amount == null && !force) return { name: receiptStore(lines) || 'קבלה', amount: null };
    }
    if (amount == null && force) { const any = lines.flatMap(amountsIn); amount = any.length ? pickAmount(any) : null; }
    if (amount == null) return null;
    return { name: receiptStore(lines) || 'חשבונית', amount };
  }
  function renderScanRows(rows) {
    const ul = $('scanList'); ul.textContent = '';
    for (const r of rows) {
      const li = el('li', r.on ? '' : 'off');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = r.on; cb.setAttribute('aria-label', 'להוסיף את ' + r.name);
      cb.onchange = () => { li.classList.toggle('off', !cb.checked); updateScanCount(); };
      const nm = document.createElement('input'); nm.type = 'text'; nm.className = 'nm'; nm.value = r.name; nm.maxLength = 80;
      const am = document.createElement('input'); am.type = 'text'; am.className = 'amt num'; am.inputMode = 'decimal'; am.value = r.amount == null ? '' : groupNum(r.amount); am.placeholder = 'סכום';
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
    $('scanList').textContent = ''; $('scanNote').hidden = true; $('scanAll').hidden = true; $('scanOne').hidden = true; $('scanRecRow').hidden = true; $('scanRec').checked = false;
    $('scanStatus').hidden = false; $('scanStatusText').textContent = 'טוען את כלי הסריקה…'; $('scanProg').style.width = '5%';
    $('saveBtn').disabled = true;
    let worker = null, stage = 80;
    try {
      const T = await loadTesseract();
      const canvas = await prepImage(file);
      if (!canvas.isPaper) stage = 40; // the first look takes 20–60%, reading piece by piece the rest
      if (token !== scanToken) return;
      worker = await T.createWorker('heb+eng', 1, { logger: m => {
        if (token !== scanToken) return;
        if (m.status === 'recognizing text') { if (!stage) return; $('scanStatusText').textContent = 'קורא את התמונה…'; $('scanProg').style.width = (20 + m.progress * stage) + '%'; }
        else if (/load|initializ/.test(m.status || '')) { $('scanStatusText').textContent = 'מכין את הסריקה…'; $('scanProg').style.width = (5 + (m.progress || 0) * 15) + '%'; }
      } });
      let text = '', rows = [];
      const layout = canvas.isPaper ? null : await readLayout(worker, canvas, (i, n) => {
        if (token !== scanToken) return;
        stage = null; $('scanStatusText').textContent = 'קורא שורה אחרי שורה…'; $('scanProg').style.width = (60 + 40 * i / Math.max(1, n)) + '%';
      });
      if (token !== scanToken) return;
      if (layout) { text = layout.text; rows = layout.rows.length ? layout.rows : parseScan(text); }
      else {
        if (canvas.isPaper && worker.setParameters) await worker.setParameters({ tessedit_pageseg_mode: '6' }); // one block of text reads a receipt photo best
        const { data } = await worker.recognize(canvas);
        if (token !== scanToken) return;
        text = data && data.text; rows = parseScan(text);
      }
      const receipt = layout && layout.rows.list ? null : parseReceipt(text); // a bank or card list is never one receipt
      $('scanStatus').hidden = true;
      if (receipt) {
        $('scanNote').hidden = false;
        $('scanNote').textContent = receipt.amount == null
          ? 'זיהיתי קבלה, אבל לא הצלחתי לקרוא בה את הסכום לתשלום. הקלידו אותו כאן. בפעם הבאה כדאי לצלם את הקבלה ישר ומקרוב, כך שתמלא את רוב התמונה.'
          : 'זיהיתי חשבונית או קבלה, אז לקחתי רק את השם ואת הסכום הסופי לתשלום. בדקו אותם לפני ההוספה.';
        renderScanRows([{ name: receipt.name, amount: receipt.amount, on: true }]);
        if (receipt.amount == null) setTimeout(() => { const a = $('scanList').querySelector('.amt'); if (a) a.focus(); }, 50);
        if (rows.length > 1) {
          $('scanAll').hidden = false;
          $('scanAll').onclick = () => {
            $('scanAll').hidden = true; $('scanRecRow').hidden = false;
            $('scanNote').textContent = 'אלה כל השורות שנקראו מהקבלה. סמנו רק את מה שצריך להוסיף.';
            renderScanRows(rows.map(r => Object.assign({}, r, { on: false })));
          };
        }
        return;
      }
      const one = layout && layout.rows.list ? null : parseReceipt(text, true);
      if (one && rows.length > 1) {
        $('scanOne').hidden = false;
        $('scanOne').onclick = () => {
          $('scanOne').hidden = true; $('scanRecRow').hidden = true;
          $('scanNote').textContent = 'לקחתי רק את השם ואת הסכום לתשלום. בדקו אותם לפני ההוספה.';
          renderScanRows([{ name: one.name, amount: one.amount, on: true }]);
          $('scanAll').hidden = false;
          $('scanAll').onclick = () => {
            $('scanAll').hidden = true; $('scanRecRow').hidden = false;
            $('scanNote').textContent = 'אלה כל השורות שנקראו מהתמונה. סמנו רק את מה שצריך להוסיף.';
            renderScanRows(rows.map(r => Object.assign({}, r, { on: false })));
          };
        };
      }
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
      li.append(el('span', '', shortDate(x.at) + (x.name ? ' · ' + x.name : '')), el('b', 'num', fmt(Number(x.amount) || 0)));
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
    state.hid = hid; state.loaded = false; state.key = null; decCache.clear(); raw.items = []; raw.months = {}; raw.goals = []; raw.savings = []; raw.cats = [];
    try { localStorage.setItem('budget-hid-' + state.user.uid, hid); } catch (e) {} state.items = []; state.months = {}; state.goals = []; state.savings = []; state.cats = []; state.catFilter = null; applyCats([]);
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
    state.unsubs.push(base.collection('cats').onSnapshot(snap => {
      raw.cats = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
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
