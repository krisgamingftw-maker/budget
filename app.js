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
    items: [], months: {}, goals: [],
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
  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function initial(name) { const m = String(name || '').trim().match(/[\p{L}\p{N}]/u); return m ? m[0] : '•'; }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function newCode() { let s = ''; const a = new Uint32Array(8); crypto.getRandomValues(a); for (const v of a) s += CODE_ABC[v % CODE_ABC.length]; return s; }
  function prettyCode(c) { return c ? c.slice(0, 4) + '-' + c.slice(4) : '—'; }
  function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function show(id) { state.screen = id; ['auth', 'setup', 'unlock', 'loading', 'shell'].forEach(x => { $(x).hidden = x !== id; }); }
  function status(msg) { const e = $('status'); e.textContent = msg || ''; e.hidden = !msg; }

  // ---------- palette ----------
  function setPalette(p, save) {
    if (p === 'green') document.documentElement.removeAttribute('data-palette'); else document.documentElement.setAttribute('data-palette', p);
    document.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', s.dataset.p === p ? 'true' : 'false'));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = { green: '#1f7a52', blue: '#2563a8', purple: '#6b47b8', pink: '#c2416f', teal: '#0f7c86' }[p] || '#1f7a52';
    if (save) { try { localStorage.setItem('budget-palette', p); } catch (e) {} }
  }
  let savedPalette = 'green';
  try { savedPalette = localStorage.getItem('budget-palette') || 'green'; } catch (e) {}
  setPalette(savedPalette, false);
  document.querySelectorAll('.swatch').forEach(s => { s.onclick = () => setPalette(s.dataset.p, true); });

  // ---------- data paths ----------
  const hh = () => state.db.collection('households').doc(state.hid);
  const itemRef = (id) => hh().collection('items').doc(id);
  const monthRef = (k) => hh().collection('months').doc(k);
  const goalRef = (id) => hh().collection('goals').doc(id);

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
  const raw = { items: [], months: {}, goals: [] };
  let decodeRun = 0;
  async function decodeAll() {
    const run = ++decodeRun;
    const items = await Promise.all(raw.items.map(openDoc));
    const mk = Object.keys(raw.months); const mv = await Promise.all(mk.map(k => openDoc(raw.months[k])));
    const goals = await Promise.all(raw.goals.map(openGoal));
    if (run !== decodeRun) return;
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
    for (const d of raw.items) if (!d.e) writes.push([itemRef(d.id), await seal({ name: d.name || '', amount: Number(d.amount) || 0 }, ['name', 'amount'], true)]);
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
    fab.hidden = !(t === 'vMonth' || t === 'vGoals');
    $('fabText').textContent = t === 'vGoals' ? 'מטרה חדשה' : 'הוצאה חדשה';
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
    if (state.tab === 'vHistory') renderHistory();
    if (state.tab === 'vSettings') renderSettings();
  }

  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const REPEAT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>';
  const EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';

  function monthStats(k) {
    const items = monthItems(k);
    const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const paid = items.filter(i => i.paid).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const income = Number((state.months[k] || {}).income) || 0;
    return { items, total, paid, income };
  }

  function renderMonth() {
    const k = state.view;
    $('monthTitle').textContent = label(k);
    $('monthSub').textContent = k === todayKey ? 'החודש הנוכחי' : ((state.household && state.household.name) || '');
    $('todayWrap').hidden = k === todayKey;

    const { items, total, paid, income } = monthStats(k);
    const left = total - paid;
    const pct = total > 0 ? Math.round(paid / total * 100) : 0;
    const allDone = items.length > 0 && left === 0;
    $('remain').textContent = fmt(left);
    $('remainLabel').textContent = allDone ? 'הכל שולם החודש' : 'נשאר לשלם';
    $('sTotal').textContent = fmt(total);
    $('sPaid').textContent = fmt(paid);
    $('ringPct').textContent = pct + '%';
    $('ringProg').style.strokeDashoffset = String(RING * (1 - pct / 100));
    if (income) {
      const b = income - total;
      $('incomeText').textContent = 'הכנסה ' + fmt(income) + (b >= 0 ? ' · יישאר' : ' · חריגה');
      $('balance').textContent = fmt(Math.abs(b));
    } else { $('incomeText').textContent = 'הוספת הכנסה חודשית (לא חובה)'; $('balance').textContent = ''; }

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

    const open = items.filter(i => !i.paid), done = items.filter(i => i.paid);
    const ol = $('openList'); ol.textContent = '';
    if (!state.loaded && !state.items.length) ol.append(el('li', 'empty', 'טוען…'));
    else if (!items.length) ol.append(el('li', 'empty', 'אין עדיין הוצאות ב' + label(k) + '. לחצו על "הוצאה חדשה" למטה.'));
    else if (!open.length) ol.append(el('li', 'all-paid', 'כל ההוצאות של החודש שולמו'));
    else open.forEach(it => ol.append(rowEl(it)));
    $('openMeta').textContent = open.length ? (open.length === 1 ? 'פריט אחד' : open.length + ' פריטים') : '';
    $('paidSec').hidden = done.length === 0;
    $('togglePaid').textContent = (state.showPaid ? 'הסתרה' : 'הצגה') + ' (' + done.length + ')';
    const pl = $('paidList'); pl.textContent = ''; pl.hidden = !state.showPaid;
    if (state.showPaid) done.forEach(it => pl.append(rowEl(it)));
  }

  function rowEl(it) {
    const row = el('li', 'row' + (it.paid ? ' paid' : ''));
    const body = el('button', 'row-body'); body.setAttribute('aria-label', 'עריכת ' + it.name);
    const av = el('span', 'avatar', initial(it.name)); av.setAttribute('aria-hidden', 'true');
    const tx = el('span', 'row-text');
    tx.append(el('span', 'row-name', it.name));
    if (it.recurring) { const sub = el('span', 'row-sub'); sub.innerHTML = REPEAT_SVG; sub.append('קבוע כל חודש'); tx.append(sub); }
    body.append(av, tx, el('span', 'row-amt num', fmt(Number(it.amount) || 0)));
    body.onclick = () => openSheet('edit', it);
    const chk = el('button', 'check'); chk.innerHTML = CHECK_SVG;
    chk.setAttribute('aria-pressed', it.paid ? 'true' : 'false');
    chk.setAttribute('aria-label', (it.paid ? 'בטל סימון שולם: ' : 'סמן כשולם: ') + it.name);
    chk.onclick = () => togglePaid(it);
    row.append(body, chk);
    return row;
  }

  // ---------- goals ----------
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
    const tot = el('div', 'goals-total');
    const l = el('div'); l.append(el('div', 'k', 'נחסך בכל המטרות'), el('div', 'v num', fmt(totalSaved)));
    tot.append(l, el('div', 'k num', 'מתוך ' + fmt(totalTarget)));
    wrap.append(tot);
    const nowIdx = monthIndex(todayKey);
    for (const g of goals) {
      const saved = Number(g.saved) || 0, target = Number(g.target) || 0;
      const pct = target > 0 ? Math.min(100, Math.round(saved / target * 100)) : 0;
      const done = target > 0 && saved >= target;
      const card = el('article', 'goal' + (done ? ' done' : ''));
      const head = el('div', 'goal-head');
      const av = el('span', 'avatar', initial(g.name)); av.setAttribute('aria-hidden', 'true');
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
      wrap.append(card);
    }
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
  $('renameBtn').onclick = () => openSheet('rename');
  $('logoutBtn').onclick = () => { forgetKeys(); state.key = null; decCache.clear(); state.auth && state.auth.signOut(); };
  $('sLogout').onclick = () => { forgetKeys(); state.key = null; decCache.clear(); state.auth && state.auth.signOut(); };

  // ---------- sheet ----------
  const GROUP = { add: 'item', edit: 'item', income: 'income', goalNew: 'goal', goalEdit: 'goal', deposit: 'deposit', rename: 'rename', encpass: 'encpass', recovery: 'recovery' };
  function openSheet(mode, obj) {
    state.sheet = { mode, id: obj ? obj.id : null };
    document.querySelectorAll('.sgroup').forEach(g => { g.hidden = g.dataset.for !== GROUP[mode]; });
    sheetError('');
    $('confirmBox').hidden = true; $('sheetActions').hidden = false;
    $('deleteBtn').hidden = !(mode === 'edit' || mode === 'goalEdit');
    $('saveBtn').textContent = mode === 'deposit' ? 'שמירה' : 'שמירה';
    let focus = null;
    if (mode === 'add') { $('sheetTitle').textContent = 'הוצאה חדשה ב' + label(state.view); $('fName').value = ''; $('fAmount').value = ''; $('fRec').checked = false; focus = 'fAmount'; }
    if (mode === 'edit') { $('sheetTitle').textContent = 'עריכת הוצאה'; $('fName').value = obj.name; $('fAmount').value = String(obj.amount ?? ''); $('fRec').checked = !!obj.recurring; }
    if (mode === 'income') { $('sheetTitle').textContent = 'הכנסה ב' + label(state.view); const inc = Number((state.months[state.view] || {}).income) || 0; $('fIncome').value = inc ? String(inc) : ''; focus = 'fIncome'; }
    if (mode === 'goalNew') { $('sheetTitle').textContent = 'מטרה חדשה'; $('gName').value = ''; $('gTarget').value = ''; $('gDate').value = ''; $('gStart').value = ''; $('gStartWrap').hidden = false; focus = 'gName'; }
    if (mode === 'goalEdit') { $('sheetTitle').textContent = 'עריכת מטרה'; $('gName').value = obj.name; $('gTarget').value = String(obj.target ?? ''); $('gDate').value = obj.deadline || ''; $('gStartWrap').hidden = true; }
    if (mode === 'deposit') { $('sheetTitle').textContent = obj.name; $('dAmount').value = ''; setDepositSign(1); focus = 'dAmount'; }
    if (mode === 'encpass') {
      state.sheet.enable = !!obj.enable; state.sheet.reset = !!obj.reset;
      $('sheetTitle').textContent = obj.enable ? 'הפעלת הצפנה' : 'סיסמה משפחתית חדשה';
      $('epNote').textContent = obj.enable ? 'בחרו סיסמה שכל המשפחה תזכור. תקלידו אותה פעם אחת בכל טלפון. בשלב הבא תקבלו קוד שחזור.' : obj.reset ? 'נכנסתם עם קוד השחזור. בחרו עכשיו סיסמה משפחתית חדשה.' : 'הסיסמה החדשה תחליף את הקודמת. טלפונים שכבר פתוחים ימשיכו לעבוד.';
      $('epPass').value = ''; $('epPass2').value = ''; focus = 'epPass';
    }
    if (mode === 'recovery') { $('sheetTitle').textContent = 'קוד שחזור'; $('recCode').textContent = prettyRecovery(obj.code); $('recSaved').checked = false; }
    if (mode === 'rename') { $('sheetTitle').textContent = 'שם התקציב'; $('rName').value = (state.household && state.household.name) || ''; focus = 'rName'; }
    $('saveBtn').textContent = mode === 'recovery' ? 'סיום' : mode === 'encpass' && obj && obj.enable ? 'המשך' : 'שמירה';
    $('saveBtn').disabled = mode === 'recovery';
    $('cancelBtn').hidden = mode === 'recovery';
    $('scrim').hidden = false; $('sheet').hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { $('scrim').classList.add('open'); $('sheet').classList.add('open'); }));
    if (focus) setTimeout(() => $(focus).focus(), 260);
  }
  function closeSheet() {
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
      const recurring = $('fRec').checked;
      if (s.mode === 'add') {
        const items = monthItems(state.view);
        const order = items.length ? Math.max(...items.map(i => i.order || 0)) + 1 : 1;
        const doc = { month: state.view, name, amount, paid: false, recurring, order };
        if (recurring) doc.seriesId = rid();
        write(async () => itemRef(state.view + '_' + rid()).set(await seal(doc, ['name', 'amount'])));
      } else {
        const it = state.items.find(x => x.id === s.id); if (!it) return closeSheet();
        const patch = { name, amount, recurring };
        if (recurring && !it.seriesId) patch.seriesId = rid();
        write(async () => itemRef(it.id).update(await seal(patch, ['name', 'amount'], true)));
      }
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
    const name = s.mode === 'goalEdit' ? (state.goals.find(g => g.id === s.id) || {}).name : (state.items.find(i => i.id === s.id) || {}).name;
    $('confirmText').textContent = 'למחוק את "' + (name || '') + '"?';
    $('confirmBox').hidden = false; $('sheetActions').hidden = true;
  };
  $('confirmNo').onclick = () => { $('confirmBox').hidden = true; $('sheetActions').hidden = false; };
  $('confirmYes').onclick = () => {
    const s = state.sheet || {}; if (!s.id) return;
    if (s.mode === 'goalEdit') write(() => goalRef(s.id).delete());
    else write(() => itemRef(s.id).delete());
    closeSheet();
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.sheet) closeSheet(); });

  function togglePaid(it) {
    const paid = !it.paid;
    state.items = state.items.map(x => x.id === it.id ? Object.assign({}, x, { paid }) : x);
    render();
    write(() => itemRef(it.id).update({ paid }));
  }
  function carryOver() {
    const k = state.view; const src = sourceMonth(k); if (!src) return;
    const have = new Set(monthItems(k).map(i => i.seriesId).filter(Boolean));
    const rec = monthItems(src).filter(i => i.recurring && !have.has(i.seriesId));
    write(async () => {
      const batch = state.db.batch();
      // Same id on both phones, so tapping together still adds each item once.
      for (const it of rec) batch.set(itemRef(k + '_' + it.seriesId), await seal({ month: k, name: it.name, amount: Number(it.amount) || 0, paid: false, recurring: true, seriesId: it.seriesId, order: it.order || 0 }, ['name', 'amount']));
      batch.set(monthRef(k), { carried: true }, { merge: true });
      return batch.commit();
    });
  }

  // ---------- month events ----------
  function go(k) { state.view = k; render(); }
  $('prev').onclick = () => go(shiftKey(state.view, -1));
  $('next').onclick = () => go(shiftKey(state.view, 1));
  $('toToday').onclick = () => go(todayKey);
  $('togglePaid').onclick = () => { state.showPaid = !state.showPaid; try { localStorage.setItem('budget-showpaid', state.showPaid ? '1' : '0'); } catch (e) {} render(); };
  $('incomeBtn').onclick = () => openSheet('income');
  $('carryBtn').onclick = carryOver;
  $('fab').onclick = () => openSheet(state.tab === 'vGoals' ? 'goalNew' : 'add');

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
    state.hid = hid; state.loaded = false; state.key = null; decCache.clear(); raw.items = []; raw.months = {}; raw.goals = [];
    try { localStorage.setItem('budget-hid-' + state.user.uid, hid); } catch (e) {} state.items = []; state.months = {}; state.goals = [];
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
