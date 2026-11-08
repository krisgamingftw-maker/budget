const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8779,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block',colorScheme:'dark',deviceScaleFactor:2});const A=await c.newPage();A.on('pageerror',e=>console.log('PAGEERR',e.message));
await A.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await A.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.goto('http://127.0.0.1:8779/');const w=(t=600)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','c@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
const add=async(n,a,cat)=>{await A.click('#fab');await w(350);await A.fill('#fAmount',a);await A.fill('#fName',n);await w(100);const sel=await A.getAttribute('#fCats [aria-pressed=true]','data-c');if(cat){await A.click(`#fCats [data-c=${cat}]`);}await A.click('#saveBtn');await w(500);return sel;};
ok(await add('דירה','4000')==='home','guess home');ok(await add('סופר','2500')==='food','guess food');ok(await add('דלק','310')==='car','guess car');
ok(await add('חשמל','400')==='bills','guess bills');ok(await add('בתי קפה','300')==='fun','guess fun');ok(await add('משהו','100','fun')==='misc','unknown → misc, overridden to fun');
ok(!(await A.isHidden('#catSec')),'category section visible');
const t=await A.textContent('#catList');console.log(t.replace(/\s+/g,' '));ok(t.includes('בזבוזים ופנאי')&&t.includes('400'),'fun total 400');
await A.screenshot({path:'../cats-month.png'});
await A.click('#catList .cat-row:has-text("בזבוזים")');await w();ok(await A.locator('#openList .row').count()===2,'filter shows 2 fun rows');
await A.click('#fab');await w(350);ok(await A.getAttribute('#fCats [aria-pressed=true]','data-c')==='fun','new item defaults to filtered cat');await A.click('#cancelBtn');await w(400);
await A.click('#catClear');await w();ok(await A.locator('#openList .row').count()===6,'clear filter');
// edit category
await A.click('#openList .row:has-text("חשמל") .row-body');await w(400);await A.click('#fCats [data-c=home]');await A.click('#saveBtn');await w(600);
ok((await A.textContent('#openList .row:has-text("חשמל")')).includes('בית'),'edited category');
// encryption keeps cats
await A.click('.tab[data-v=vSettings]');await w();await A.click('#encOnBtn');await w(400);await A.fill('#epPass','abcd');await A.fill('#epPass2','abcd');await A.click('#saveBtn');
await A.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});await A.check('#recSaved',{force:true});await A.click('#saveBtn');await w();
await A.click('.tab[data-v=vMonth]');await w();ok((await A.textContent('#openList .row:has-text("משהו")')).includes('בזבוזים'),'override kept after encryption');
ok((await A.textContent('#openList .row:has-text("חשמל")')).includes('בית'),'edited cat kept after encryption');
await A.click('#openList .row:has-text("חשמל") .row-body');await w(400);await A.click('#fCats [data-c=bills]');await A.click('#saveBtn');await w(800);
ok((await A.textContent('#openList .row:has-text("חשמל")')).includes('חשבונות'),'encrypted edit cat');
await A.click('#fab');await w(350);await A.screenshot({path:'../cats-sheet.png'});
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
