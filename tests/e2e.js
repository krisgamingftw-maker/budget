const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8766,async()=>{
const b=await chromium.launch();
const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await p.goto('http://127.0.0.1:8766/');return p;};
const step=async(p,n)=>{await p.waitForTimeout(700);};
const A=await mk();
await A.waitForSelector('#auth:not([hidden])');await A.screenshot({path:'../e2e-login.png'});
await A.click('#aSwitch');await A.fill('#aEmail','kris@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});
await A.fill('#sName','משפחת בדיקה');await A.click('#sCreate');
await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await step(A);
for (const [n,a,r] of [['דירה','4000',true],['סופר','2300',true],['מתנה','250',false]]){await A.click('#fab');await A.waitForTimeout(350);await A.fill('#fAmount',a);await A.fill('#fName',n);if(r)await A.check('#fRec',{force:true});await A.click('#saveBtn');await A.waitForTimeout(400);}
await A.click('#openList .row .check');await step(A);
await A.click('#incomeBtn');await A.waitForTimeout(350);await A.fill('#fIncome','15000');await A.click('#saveBtn');await step(A);
await A.screenshot({path:'../e2e-month.png',fullPage:true});
// next month carry
await A.click('#next');await step(A);console.log('carry visible:',await A.isVisible('#carry'));await A.click('#carryBtn');await step(A);
console.log('next month rows:',await A.locator('#openList .row').count());
await A.click('#prev');await step(A);
// goals
await A.click('.tab[data-v=vGoals]');await step(A);await A.click('#fab');await A.waitForTimeout(350);
await A.fill('#gName','טיול ליוון');await A.fill('#gTarget','8000');await A.fill('#gDate','2027-06');await A.fill('#gStart','1500');await A.click('#saveBtn');await step(A);
await A.click('.goal .btn');await A.waitForTimeout(350);await A.fill('#dAmount','700');await A.click('#saveBtn');await step(A);
await A.click('#fab');await A.waitForTimeout(350);await A.fill('#gName','מחשב חדש');await A.fill('#gTarget','5000');await A.click('#saveBtn');await step(A);
await A.screenshot({path:'../e2e-goals.png',fullPage:true});
await A.click('.tab[data-v=vHistory]');await step(A);await A.fill('#hSearch','סופר');await step(A);
await A.screenshot({path:'../e2e-history.png',fullPage:true});
await A.click('.tab[data-v=vSettings]');await step(A);
const code=(await A.textContent('#codeText')).trim();console.log('code',code);
await A.screenshot({path:'../e2e-settings.png',fullPage:true});
// partner joins
const B=await mk();await B.waitForSelector('#auth:not([hidden])');
await B.click('#aSwitch');await B.fill('#aEmail','partner@test.com');await B.fill('#aPass','secret123');await B.click('#aBtn');
await B.waitForSelector('#setup:not([hidden])',{timeout:10000});await B.fill('#sCode',code.toLowerCase());await B.click('#sJoin');
await B.waitForSelector('#shell:not([hidden])',{timeout:10000});await step(B);await step(B);
console.log('partner sees rows:',await B.locator('#openList .row, #paidList .row').count());
await B.click('#openList .row .check');await step(B);await step(A);
await A.click('.tab[data-v=vMonth]');await step(A);console.log('alice sees paid after partner tick:',await A.locator('#paidList .row').count());
// stranger
const C=await mk();await C.waitForSelector('#auth:not([hidden])');await C.click('#aSwitch');await C.fill('#aEmail','other@test.com');await C.fill('#aPass','secret123');await C.click('#aBtn');
await C.waitForSelector('#setup:not([hidden])',{timeout:10000});await C.fill('#sCode','AAAA-BBBB');await C.click('#sJoin');await step(C);console.log('bad code msg:',await C.textContent('#sErr'));
await A.click('.tab[data-v=vSettings]');await A.click('#logoutBtn');await step(A);console.log('after logout auth visible:',await A.isVisible('#auth'));
await A.fill('#aEmail','kris@test.com');await A.fill('#aPass','wrong99');await A.click('#aBtn');await A.waitForTimeout(3000);console.log('mode:',await A.textContent('#aBtn'));console.log('wrong pass:',await A.textContent('#aErr'));
await b.close();srv.close();});
