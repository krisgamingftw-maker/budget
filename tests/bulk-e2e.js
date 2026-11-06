const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8775,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const A=await c.newPage();
A.on('pageerror',e=>console.log('PAGEERR',e.message));
await A.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await A.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.goto('http://127.0.0.1:8775/');const w=(t=700)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','l@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
await A.click('#fab');await w(350);ok(await A.isHidden('#fLinkWrap'),'link field hidden with no goals/savings');await A.click('#cancelBtn');await w(400);
// goal + saving
await A.click('.tab[data-v=vGoals]');await w();await A.click('#fab');await w(350);await A.fill('#gName','יפן');await A.fill('#gTarget','20000');await A.fill('#gStart','1000');await A.click('#saveBtn');await w();
await A.click('.tab[data-v=vSavings]');await w();await A.click('#fab');await w(350);await A.fill('#svName','קרן השתלמות');await A.fill('#svBalance','50000');await A.fill('#svMonthly','1500');await A.click('#saveBtn');await w();
await A.click('.tab[data-v=vMonth]');await w();
const add=async(n,a,link,rec)=>{await A.click('#fab');await w(350);await A.fill('#fAmount',a);await A.fill('#fName',n);if(rec)await A.check('#fRec',{force:true});if(link)await A.selectOption('#fLink',{label:link});await A.click('#saveBtn');await w();};
const goalSaved=async()=>{await A.click('.tab[data-v=vGoals]');await w();const t=await A.textContent('.goal-saved');await A.click('.tab[data-v=vMonth]');await w();return t.trim()};
await add('חיסכון ליפן','800','יפן',true);await add('דירה','4000',null,true);await add('חשמל','300',null,false);
await A.click('#fab');await w(350);await A.fill('#fAmount','2500');await A.fill('#fName','סופר');await A.check('#fSplit',{force:true});await A.click('#saveBtn');await w();
ok(await A.isVisible('#payAllBtn'),'pay-all visible');
await A.click('#payAllBtn');await w(300);ok((await A.textContent('#payAllBtn')).includes('בטוח'),'asks to confirm');
await A.screenshot({path:'../bulk-armed.png'});
await A.click('#payAllBtn');await w(1200);
const open=await A.locator('#openList .row').count();ok(open===1,'only split item left open: '+open);
ok((await goalSaved()).includes('1,800'),'linked goal got deposit');
if(!(await A.isVisible('#paidList')))await A.click('#togglePaid');await w(300);
ok(await A.isVisible('#unpayAllBtn'),'unpay-all visible');await A.screenshot({path:'../bulk-paid.png',fullPage:true});
await A.click('#unpayAllBtn');await A.click('#unpayAllBtn');await w(1200);
ok(await A.locator('#openList .row').count()===4,'all back to open');ok((await goalSaved()).includes('1,000'),'goal deposit removed');
// arm then wait 3.5s: resets
await A.click('#payAllBtn');await w(3500);ok(!(await A.textContent('#payAllBtn')).includes('בטוח'),'arming expires');
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
