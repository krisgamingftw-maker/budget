const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8776,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await c.newPage();p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await p.goto('http://127.0.0.1:8776/');return p};
const setup=async(p,email,name,item)=>{await p.waitForSelector('#auth:not([hidden])');await p.click('#aSwitch');await p.fill('#aEmail',email);await p.fill('#aPass','secret123');await p.click('#aBtn');
await p.waitForSelector('#setup:not([hidden])',{timeout:10000});await p.fill('#sName',name);await p.click('#sCreate');await p.waitForSelector('#shell:not([hidden])',{timeout:10000});await p.waitForTimeout(600);
await p.click('#fab');await p.waitForTimeout(350);await p.fill('#fAmount','100');await p.fill('#fName',item);await p.click('#saveBtn');await p.waitForTimeout(600);};
const A=await mk();await setup(A,'ja@test.com','משפחת כהן','דירה של כריסטינה');
await A.click('.tab[data-v=vSettings]');await A.waitForTimeout(500);const code=(await A.textContent('#codeText')).trim();
const B=await mk();await setup(B,'jb@test.com','התקציב של בעלי','משהו של בעלי');
await B.click('.tab[data-v=vSettings]');await B.waitForTimeout(500);const bcode=(await B.textContent('#codeText')).trim();
await B.click('#joinOtherBtn');await B.waitForTimeout(400);ok((await B.textContent('#joNote')).includes(bcode),'note shows own code to return');
await B.screenshot({path:'../join-sheet.png'});
await B.fill('#joCode',bcode);await B.click('#saveBtn');await B.waitForTimeout(400);ok((await B.textContent('#sheetError')).includes('כבר'),'own code rejected');
await B.fill('#joCode','ZZZZ-ZZZZ');await B.click('#saveBtn');await B.waitForTimeout(800);ok((await B.textContent('#sheetError')).includes('לא מצאנו'),'unknown code rejected');
await B.fill('#joCode',code.toLowerCase());await B.click('#saveBtn');await B.waitForSelector('#shell:not([hidden])',{timeout:10000});await B.waitForTimeout(1200);
await B.click('.tab[data-v=vMonth]');await B.waitForTimeout(500);
ok((await B.textContent('#openList')).includes('דירה של כריסטינה'),'B now sees shared budget');
await B.reload();await B.waitForSelector('#shell:not([hidden])',{timeout:10000});await B.waitForTimeout(800);ok((await B.textContent('#openList')).includes('דירה של כריסטינה'),'stays after reload');
await B.click('#openList .check');await B.waitForTimeout(800);await A.click('.tab[data-v=vMonth]');await A.waitForTimeout(600);ok(await A.locator('#paidList .row').count()===1,'A sees B tick');
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
