const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8778,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const A=await c.newPage();
A.on('pageerror',e=>console.log('PAGEERR',e.message));
await A.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await A.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.goto('http://127.0.0.1:8778/');const w=(t=700)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','l@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
await A.click('#fab');await w(350);ok(await A.isHidden('#fLinkWrap'),'link field hidden with no goals/savings');await A.click('#cancelBtn');await w(400);
// goal + saving
await A.click('.tab[data-v=vGoals]');await w();await A.click('#fab');await w(350);await A.fill('#gName','יפן');await A.fill('#gTarget','20000');await A.fill('#gStart','1000');await A.click('#saveBtn');await w();
await A.click('.tab[data-v=vSavings]');await w();await A.click('#fab');await w(350);await A.fill('#svName','קרן השתלמות');await A.fill('#svBalance','50000');await A.fill('#svMonthly','1500');await A.click('#saveBtn');await w();
await A.click('.tab[data-v=vMonth]');await w();
const add=async(n,a,link,rec)=>{await A.click('#fab');await w(350);await A.fill('#fAmount',a);await A.fill('#fName',n);if(rec)await A.check('#fRec',{force:true});if(link)await A.selectOption('#fLink',{label:link});await A.click('#saveBtn');await w();};
const rows=async()=>(await A.textContent('#vMonth'));
ok((await rows()).includes('הפקדה לקרן השתלמות')&&(await rows()).includes('1,500'),'saving with monthly created linked expense');
await A.click('#openList .row:has-text("הפקדה לקרן השתלמות") .check');await w(1000);
const savBal=async()=>{await A.click('.tab[data-v=vSavings]');await w();const t=await A.textContent('#savWrap .goal-saved');await A.click('.tab[data-v=vMonth]');await w();return t.trim()};
ok((await savBal()).includes('51,500'),'paying it deposits');
// edit monthly to 2000 → expense updates, deposit updates
await A.click('.tab[data-v=vSavings]');await w();await A.click('#savWrap .goal-edit');await w(400);await A.fill('#svMonthly','2000');await A.click('#saveBtn');await w(1200);
await A.click('.tab[data-v=vMonth]');await w();ok((await rows()).includes('2,000'),'expense amount updated');ok(await A.locator('.row:has-text("הפקדה לקרן")').count()===1,'no duplicate');
ok((await savBal()).includes('52,000'),'deposit follows new amount');
// new saving without monthly → no expense
await A.click('.tab[data-v=vSavings]');await w();await A.click('#fab');await w(350);await A.fill('#svName','פיקדון');await A.fill('#svBalance','10000');await A.click('#saveBtn');await w(1000);
await A.click('.tab[data-v=vMonth]');await w();ok(!(await rows()).includes('הפקדה לפיקדון'),'no expense without monthly');
// add monthly then remove it
await A.click('.tab[data-v=vSavings]');await w();await A.click('#savWrap article:last-of-type .goal-edit');await w(400);await A.fill('#svMonthly','300');await A.click('#saveBtn');await w(1000);
await A.click('.tab[data-v=vMonth]');await w();ok((await rows()).includes('הפקדה לפיקדון'),'adding monthly later creates expense');
await A.click('.tab[data-v=vSavings]');await w();await A.click('#savWrap article:last-of-type .goal-edit');await w(400);await A.fill('#svMonthly','');await A.click('#saveBtn');await w(1000);
await A.click('.tab[data-v=vMonth]');await w();ok(!(await rows()).includes('הפקדה לפיקדון'),'clearing monthly removes unpaid expense');
// encrypted path
await A.click('.tab[data-v=vSettings]');await w();await A.click('#encOnBtn');await w(400);await A.fill('#epPass','abcd');await A.fill('#epPass2','abcd');await A.click('#saveBtn');
await A.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});await A.check('#recSaved',{force:true});await A.click('#saveBtn');await w();
await A.click('.tab[data-v=vSavings]');await w();await A.click('#savWrap .goal-edit');await w(400);await A.fill('#svMonthly','2500');await A.click('#saveBtn');await w(1500);
await A.click('.tab[data-v=vMonth]');await w();const t=await rows();ok(t.includes('הפקדה לקרן השתלמות')&&t.includes('2,500'),'encrypted edit keeps name and new amount');
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
