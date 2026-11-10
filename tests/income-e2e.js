const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8781,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block',colorScheme:'dark',deviceScaleFactor:2});const A=await c.newPage();A.on('pageerror',e=>console.log('PAGEERR',e.message));
await A.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await A.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.goto('http://127.0.0.1:8781/');const w=(t=600)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','inc@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
const val=async()=>(await A.textContent('#incomeBtn')).replace(/\s+/g,' ');
await A.click('#incomeBtn');await w(400);ok(await A.isHidden('#incExtraWrap'),'extras hidden by default');
await A.fill('#fIncome','15000');await A.check('#fMoreInc',{force:true});await w(200);
ok(await A.isVisible('#incExtraWrap'),'extras shown after switch');
await A.fill('#incList li:nth-child(1) .inc-name','משכורת 2');await A.fill('#incList li:nth-child(1) .inc-amt','8000');
await A.click('#incAdd');await A.fill('#incList li:nth-child(2) .inc-name','קצבה');await A.fill('#incList li:nth-child(2) .inc-amt','1200');
ok((await A.textContent('#incTotal')).includes('24,200'),'live total 24,200: '+await A.textContent('#incTotal'));
ok(await A.inputValue('#incList li:nth-child(1) .inc-amt')==='8,000','commas in extra amount');
await A.screenshot({path:'../income-sheet.png'});
await A.click('#saveBtn');await w(800);
let t=await val();ok(t.includes('24,200')&&t.includes('הכנסות'),'chip shows total: '+t);
await A.click('#incomeBtn');await w(400);ok(await A.isChecked('#fMoreInc'),'switch remembered');ok(await A.locator('#incList li').count()===2,'two extras kept');
ok(await A.inputValue('#fIncome')==='15,000','main kept');
await A.click('#incList li:nth-child(2) .sp-del');await A.click('#saveBtn');await w(800);
t=await val();ok(t.includes('23,000'),'removed one extra: '+t);
// encryption keeps it
await A.click('.tab[data-v=vSettings]');await w();await A.click('#encOnBtn');await w(400);await A.fill('#epPass','abcd');await A.fill('#epPass2','abcd');await A.click('#saveBtn');
await A.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});await A.check('#recSaved',{force:true});await A.click('#saveBtn');await w(1200);
await A.click('.tab[data-v=vMonth]');await w();t=await val();ok(t.includes('23,000'),'after encryption: '+t);
await A.click('#incomeBtn');await w(400);ok(await A.locator('#incList li').count()===1&&(await A.inputValue('#incList li .inc-name'))==='משכורת 2','extra kept after encryption');
await A.uncheck('#fMoreInc',{force:true});await A.click('#saveBtn');await w(900);t=await val();ok(t.includes('15,000')&&!t.includes('הכנסות'),'switch off -> main only: '+t);
await A.click('.tab[data-v=vHistory]');await w();ok((await A.textContent('#histList')).includes('15,000'),'history uses total');
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
