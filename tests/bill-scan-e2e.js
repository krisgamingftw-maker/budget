const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8783,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block',deviceScaleFactor:2});const A=await c.newPage();A.on('pageerror',e=>console.log('PAGEERR',e.message));
await A.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await A.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.addInitScript(()=>{window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:window.__ocr||''}}),terminate:async()=>{}})};});
await A.goto('http://127.0.0.1:8783/');const w=(t=600)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','bill@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
const icon=path.join(root,'icon-192.png');
const scan=async(text)=>{await A.evaluate(t=>{window.__ocr=t},text);await A.click('#fab');await w(350);await A.evaluate(()=>{document.getElementById('scanFile').value=''});await A.setInputFiles('#scanFile',icon);await A.waitForSelector('#scanStatus[hidden]',{state:'attached',timeout:10000});await w(300);};
const rows=async()=>A.$$eval('#scanList li',ls=>ls.map(l=>({n:l.querySelector('.nm').value,a:l.querySelector('.amt').value,on:l.querySelector('input[type=checkbox]').checked})));
// 1. a bill is recognised on its own
await scan(`חברת החשמל לישראל בע"מ\nחשבון חשמל תקופתי\nמספר חוזה 346123456\nחיוב בגין צריכה 427.01\nסה"כ חיובים 445.33\nמע"מ 17% 75.71\nסה"כ לתשלום 521.04`);
let r=await rows();console.log(JSON.stringify(r));ok(r.length===1&&r[0].n==='חשמל'&&r[0].a==='521.04','electricity bill → one expense חשמל 521.04');
await A.screenshot({path:'../bill-scan.png'});
await A.click('#saveBtn');await w(700);ok((await A.textContent('#openList')).includes('521.04'),'bill added');
// 2. a bill that does not look like one: the list shows, with a one-bill button
await scan(`שרותי ניקיון אור\nניקוי ספות 350\nניקוי שטיח 200\nסה"כ 550`);
r=await rows();ok(r.length===3,'unsure picture shows the lines: '+r.length);ok(!(await A.isHidden('#scanOne')),'one-bill button shown');
await A.screenshot({path:'../bill-scan-list.png'});
await A.click('#scanOne');await w(300);r=await rows();console.log(JSON.stringify(r));
ok(r.length===1&&r[0].a==='550'&&r[0].n.includes('ניקיון'),'one-bill button gives name + total');
ok(!(await A.isHidden('#scanAll')),'can go back to all lines');
await A.click('#scanAll');await w(200);ok((await rows()).length===3,'back to all lines');
await A.click('#cancelBtn');await w(400);
// 3. a real list of expenses: no one-bill confusion with a single row
await scan(`דירה 4,000\nסופר 2500\nחשמל 400`);r=await rows();ok(r.length===3&&r.every(x=>x.on),'expense list still a list');
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
