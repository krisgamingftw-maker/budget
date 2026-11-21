const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8782,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block',deviceScaleFactor:2});const A=await c.newPage();A.on('pageerror',e=>console.log('PAGEERR',e.message));
await A.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await A.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.goto('http://127.0.0.1:8782/');const w=(t=600)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','ov@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
const add=async(n,a,split)=>{await A.click('#fab');await w(350);await A.fill('#fAmount',a);await A.fill('#fName',n);if(split)await A.check('#fSplit',{force:true});await A.click('#saveBtn');await w(500);};
const income=async(v)=>{await A.click('#incomeBtn');await w(400);await A.fill('#fIncome',v);await A.click('#saveBtn');await w(500);};
// last month: within budget
await A.click('#prev');await w();
await add('דירה','4000');await add('סופר','2000');await income('10000');
ok(await A.isHidden('#overCard'),'no overrun card when within income');
await A.click('#next');await w();
// this month: less income, groceries over budget, a new expense
await add('דירה','4000');await add('סופר','2000',true);await add('טיפול שיניים','2500');await income('8000');
await A.click('#openList .row:has-text("סופר") .check');await w(400);await A.fill('#spAmount','2600');await A.click('#saveBtn');await w(600);
await A.click('#cancelBtn').catch(()=>{});await w(400);
ok(!(await A.isHidden('#overCard')),'overrun card shows');
const sub=await A.textContent('#overSub');console.log(sub);ok(sub.includes('1,100'),'overrun amount 1,100');
const top=(await A.textContent('#overList')).replace(/\s+/g,' ');console.log(top);
ok(top.includes('טיפול שיניים')&&top.includes('2,500'),'new expense listed');
ok(top.includes('ההכנסה ירדה')&&top.includes('2,000'),'income drop listed');
ok(top.includes('סופר')&&top.includes('600')&&top.includes('תוכנן'),'grocery overspend listed');
ok(!top.includes('דירה'),'unchanged rent not listed');
ok(await A.locator('#overList .over-row').count()===3,'exactly 3 causes, no double count');
await A.screenshot({path:'../over-card.png'});
await A.click('#overMore');await w(400);
ok((await A.textContent('#ovSum')).includes('1,100'),'sheet sum');
ok(await A.locator('#ovCats .over-cat').count()>=3,'category breakdown');ok(await A.isHidden('#saveBtn'),'no save button');
await A.screenshot({path:'../over-sheet.png'});
await A.click('#ovSrc .over-row:has-text("טיפול שיניים") .over-body');await w(400);ok((await A.inputValue('#fName'))==='טיפול שיניים','tap a cause opens the expense');
await A.fill('#fAmount','1000');await A.click('#saveBtn');await w(600);
const sub2=await A.textContent('#overSub');ok(!sub2.includes('מההכנסה')&&sub2.includes('600'),'after fixing, only the grocery overspend remains');
// split overrun with no income
await A.click('#next');await w();await add('סופר','1500',true);
await A.click('#openList .row:has-text("סופר") .check');await w(400);await A.fill('#spAmount','1800');await A.click('#saveBtn');await w(600);await A.click('#cancelBtn').catch(()=>{});await w(400);
ok(!(await A.isHidden('#overCard'))&&(await A.textContent('#overSub')).includes('300'),'split overrun without income shows card');
await A.setViewportSize({width:390,height:844});await A.emulateMedia({colorScheme:'dark'});await w(300);await A.screenshot({path:'../over-card-dark.png'});
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
