// Scanning screenshots of card and bank apps (made-up data in the layouts of Cal, Max and a dark bank page),
// with the real on-device reader. Every expense must come in with its own name and the exact amount on its row.
// Needs tesseract.js@6.0.1 + @tesseract.js-data/heb,eng in tests/node_modules. Run with the emulators, like the other e2e tests.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');const NM=path.join(__dirname,'node_modules');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8780,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const shot=async(file,html)=>{const c=await b.newContext({viewport:{width:402,height:874},deviceScaleFactor:3});const p=await c.newPage();await p.setContent(html);await p.screenshot({path:file});await c.close();};
// 1. Cal: navy header with the card's last digits and next charge, then cards: date + shop on the right,
//    "Apple Pay" / "G Pay" badge in the middle, thin grey amount with small agorot and ₪ on the left
const cal=[['14/10/2026','סופר יודה','52','.40','ap'],['14/10/2026','העברה ב BIT','120','.00',''],['15/10/2026','פז אשדוד','265','.13','ap'],['16/10/2026','NETFLIX.COM','54','.90',''],
 ['17/10/2026','קפה גרג','38','.00','gp'],['18/10/2026','שופרסל דיל','1,204','.66','ap'],['19/10/2026','מכבי פארם','19','.90','ap'],['20/10/2026','רמי לוי','341','.25','ap']];
const badge=t=>t==='ap'?'<b style="font:700 19px Arial;color:#1c2a5a">Apple Pay</b>':t==='gp'?'<span style="border:1.5px solid #222;border-radius:20px;padding:4px 12px;font:16px Arial"><b style="color:#4285f4">G</b> Pay</span>':'';
await shot('../bank-cal.png',`<html dir=rtl><body style="margin:0;background:#1b2a5e;font-family:Arial">
<div style="color:#fff;text-align:center;padding:30px 0 10px;font-size:19px">כרטיסי אשראי<br>512-448190</div>
<div style="color:#f5c542;font-weight:bold;font-size:18px;padding:10px 14px">ויזה כ.א.ל זהב 4821</div>
<div style="color:#fff;font-weight:bold;padding:0 14px;font-size:14px">סה"כ חיוב הבא:</div>
<div style="color:#fff;display:flex;justify-content:space-between;padding:6px 14px 10px;font-size:14px"><span>₪2,095.<small>34</small></span><span>נכון לתאריך 2026-10-21</span></div>
<div style="margin:0 10px">${cal.map((r,i)=>`<div style="background:${i%2?'#fff':'#eef0f4'};height:63px;display:flex;align-items:center;justify-content:space-between;padding:0 16px">
<div style="color:#1c2a5a"><div style="font-size:13px">${r[0]}</div><div style="font-size:16px;color:#333;margin-top:6px">${r[1]}</div></div>${badge(r[4])}
<div style="color:#8a93a6;font-weight:300;direction:ltr"><span style="font-size:12px">₪</span><span style="font-size:28px">${r[2]}</span><span style="font-size:15px">${r[3]}</span></div></div>`).join('')}</div></body></html>`);
// 2. Max-like: shop and amount on one line, date under the shop, light theme
const max=[['שופרסל אונליין','08.10.26','₪ 412.90'],['סונול תחנת דלק','09.10.26','₪ 250.00'],['ארומה תל אביב','10.10.26','₪ 46.50'],['הוט מובייל','12.10.26','₪ 29.90'],['איקאה ראשון לציון','13.10.26','₪ 1,349.00'],['וולט','15.10.26','₪ 87.30']];
await shot('../bank-max.png',`<html dir=rtl><body style="margin:0;background:#f4f6f8;font-family:Arial;padding:16px">
<div style="font-size:22px;font-weight:bold;margin:20px 0 6px">העסקאות שלי</div><div style="color:#666;font-size:14px;margin-bottom:12px">אוקטובר 2026 · כרטיס 1234</div>
${max.map(r=>`<div style="background:#fff;border-radius:12px;margin-bottom:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:16px;font-weight:bold">${r[0]}</div><div style="font-size:13px;color:#777;margin-top:4px">${r[1]}</div></div><div style="font-size:17px;font-weight:bold;direction:ltr">${r[2]}</div></div>`).join('')}</body></html>`);
// 3. a bank account in dark mode: debits with a minus, thousands commas, a date column
const dark=[['גן ילדים','1,850.00'],['ביטוח רכב','389.17'],['ארנונה','612.00'],['חשמל','455.80']];
await shot('../bank-dark.png',`<html dir=rtl><body style="margin:0;background:#111;color:#eee;font-family:Arial;padding:16px"><div style="font-size:20px;margin:24px 0">תנועות בחשבון</div>
${dark.map((r,i)=>`<div style="border-bottom:1px solid #333;padding:14px 0;display:flex;justify-content:space-between"><span style="font-size:16px">${r[0]}</span><span style="color:#999;font-size:13px">0${i+1}/10</span><span style="font-size:16px;direction:ltr">-${r[1]} ₪</span></div>`).join('')}</body></html>`);
// 4. Leumi-like account page: account holder and number on top, day over month on the right, a red -amount
//    with the balance ("יתרה") under it, green +amounts for money coming in, names on one or two lines
const leumi=[['10','נוב\'','לטובת: נועה כהן','העברה מהבנק','-','2,150',''],['10','נוב\'','הפקדת פקדון-נט','','-','640',''],['09','נוב\'','דירקט- מצטבר','','-','95',''],
 ['09','נוב\'','המבצע: חברת אלפא','זיכוי מלאומי','+','1,240','.50'],['08','נוב\'','לטובת: דן לוי','העב\' לאחר-נייד','-','318','']];
let bal=9876.54;
await shot('../bank-leumi.png',`<html dir=rtl><body style="margin:0;background:#fff;font-family:Arial">
<div style="display:flex;justify-content:space-between;align-items:center;padding:40px 18px 18px;box-shadow:0 2px 6px #ddd"><b style="font-size:17px">ישראלי ישראל-123-45678</b><span style="font-size:20px">🔍 ✉️</span></div>
<div style="display:flex;justify-content:space-around;font-size:16px;padding:16px 0;border-bottom:1px solid #ddd;color:#444"><span>ראשי</span><b style="border-bottom:3px solid #c00">עובר ושב</b><span>כרטיסי אשראי</span><span>ריכוז יתרות</span></div>
<div style="padding:0 16px">${leumi.map(r=>{bal-=7;return `<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ddd;padding:22px 0">
<div style="display:flex;align-items:center;gap:14px"><div style="text-align:center;color:#333"><div style="font-size:26px">${r[0]}</div><div style="font-size:14px">${r[1]}</div></div>
<div><div style="font-size:17px;font-weight:bold">${r[2]}</div><div style="font-size:15px;color:#555;margin-top:4px">${r[3]}</div></div></div>
<div style="text-align:left;direction:ltr"><div style="font-size:30px;color:${r[4]==='+'?'#2a8a7a':'#c0103a'}"><span style="font-size:15px">₪</span>${r[4]}${r[5]}<span style="font-size:18px">${r[6]}</span></div><div style="font-size:14px;color:#555">₪${bal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/,',')} יתרה</div></div></div>`}).join('')}</div></body></html>`);
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
await c.route(/cdn\.jsdelivr\.net\/npm\/(.+)$/,r=>{let m=r.request().url().match(/cdn\.jsdelivr\.net\/npm\/(@[^/]+\/[^/@]+|[^/@]+)(?:@[^/]+)?\/?(.*)$/);let f=path.join(NM,m[1],m[2]||'');
 if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.js');
 if(!fs.existsSync(f)){console.log('MISSING',r.request().url());return r.fulfill({status:404,body:''});}
 r.fulfill({path:f,contentType:f.endsWith('.wasm')?'application/wasm':f.endsWith('.js')?'text/javascript':'application/octet-stream'})});
const A=await c.newPage();A.on('pageerror',e=>console.log('PAGEERR',e.message));A.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await A.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await A.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.goto('http://127.0.0.1:8780/');const w=(t=600)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','bank@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
const fmt=v=>{const [i,d]=v.replace(/,/g,'').split('.');const n=Number(i).toLocaleString('en-US');return d&&d!=='00'?n+'.'+d.replace(/0$/,''):n;};
const scan=async(img)=>{await A.click('#fab');await w(400);await A.setInputFiles('#scanFile',img);
 await A.waitForFunction(()=>document.getElementById('scanStatus').hidden,null,{timeout:180000});
 const rows=await A.$$eval('#scanList li',ls=>ls.map(l=>[l.querySelector('input').checked,l.querySelector('.nm').value,l.querySelector('.amt').value]));
 console.log(img,JSON.stringify(rows),'|',await A.textContent('#scanNote'));return rows;};
const same=(rows,want)=>rows.length===want.length&&want.every((x,i)=>rows[i][0]&&rows[i][1]===x[0]&&rows[i][2]===x[1]);
let rows=await scan('../bank-cal.png');
ok(!(await A.textContent('#scanNote')).includes('קבלה')&&await A.isHidden('#scanOne'),'cal: a card list, not taken for a receipt');
ok(!rows.some(r=>/4,821|2,095|נכון|חיוב|ויזה/.test(r.join(' '))),'cal: header (card digits, next charge, as-of date) skipped');
ok(!rows.some(r=>/Pay/i.test(r[1])),'cal: no "Apple Pay"/"G Pay" in names');
// "פז" is a short word the reader sometimes glues to the next one; the amounts must all be exact
ok(rows.length===cal.length&&cal.every((x,i)=>rows[i]&&rows[i][2]===fmt(x[2]+x[3])),'cal: all '+cal.length+' rows, each with the amount on its own card');
ok(cal.every((x,i)=>rows[i]&&(x[1]==='פז אשדוד'||rows[i][1]===x[1].replace('.',' '))),'cal: each row has its own shop name');
await A.click('#saveBtn');await w(1000);
ok(await A.locator('#openList .row').count()===cal.length,'cal: all rows added');
rows=await scan('../bank-max.png');
ok(same(rows,max.map(x=>[x[0],fmt(x[2].replace('₪ ',''))])),'max: every row exact');
await A.click('#cancelBtn');await w(400);
rows=await scan('../bank-dark.png');
ok(same(rows,dark.map(x=>[x[0],fmt(x[1])])),'dark bank page: every row exact (minus and ₪ ignored)');
await A.click('#cancelBtn');await w(400);
rows=await scan('../bank-leumi.png');
ok(!rows.some(r=>/ישראלי|45,678|יתרה|9,8|נוב/.test(r.join(' '))),'leumi: no account holder, account number, balance or month in the list');
const spent=leumi.filter(x=>x[4]==='-');
ok(rows.filter(r=>r[0]).length===spent.length&&spent.every(x=>rows.some(r=>r[0]&&r[1].startsWith(x[2].replace(':',''))&&r[2]===x[5])),'leumi: each expense ticked with its own name and amount');
ok(rows.some(r=>!r[0]&&r[2]==='1,240.5'),'leumi: money coming in (+) shown but not ticked');
await A.click('#cancelBtn');await w(400);
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
