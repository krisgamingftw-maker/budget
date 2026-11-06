const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8770,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await p.goto('http://127.0.0.1:8770/');return p};
const A=await mk();const w=(t=600)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','v@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
await A.click('.tab[data-v=vSavings]');await w();ok((await A.textContent('#savWrap')).includes('עוד אין חסכונות'),'empty state');
ok((await A.textContent('#fabText'))==='חיסכון חדש','fab label');
await A.screenshot({path:'../sav-empty.png'});
await A.click('#fab');await w(400);await A.click('#saveBtn');await w(200);ok(await A.isVisible('#sheetError'),'name required');
await A.fill('#svName','קרן השתלמות');await A.fill('#svBalance','85000');await A.fill('#svMonthly','1500');await A.fill('#svEnd','2029-06');await A.click('#saveBtn');await w();
await A.click('#fab');await w(400);await A.fill('#svName','פיקדון בנק');await A.selectOption('#svKind','פיקדון');await A.fill('#svBalance','40000');await A.fill('#svEnd','2027-03');await A.click('#saveBtn');await w();
const t=await A.textContent('#savWrap');console.log(t.replace(/\s+/g,' '));
ok(t.includes('125,000'),'total 125,000');ok(t.includes('1,500'),'monthly shown');ok(t.includes('משתחרר ביוני 2029'),'release date');
await A.screenshot({path:'../sav-list.png',fullPage:true});
// backdate updatedAt by 3 months to test estimate (direct emulator write via REST)
const q=async(u,opt={})=>{const r=await fetch('http://127.0.0.1:8085/v1/projects/demo-budget/databases/(default)/documents/'+u,Object.assign({headers:{Authorization:'Bearer owner','content-type':'application/json'}},opt));return r.json()};
const hh=await q('households');const hp=hh.documents[0].name.split('/documents/')[1];
const sv=await q(hp+'/savings');const keren=sv.documents.find(d=>JSON.stringify(d).includes('השתלמות'));
const old=new Date();old.setMonth(old.getMonth()-3);
await q(keren.name.split('/documents/')[1]+'?updateMask.fieldPaths=updatedAt',{method:'PATCH',body:JSON.stringify({fields:{updatedAt:{integerValue:String(old.getTime())}}})});await w(1200);
const t2=await A.textContent('#savWrap');ok(t2.includes('89,500')&&t2.includes('3 הפקדות'),'estimate 85,000 + 3×1,500');
await A.screenshot({path:'../sav-est.png',fullPage:true});
// update balance
await A.click('.goal:nth-of-type(1) .btn.small, #savWrap article:first-of-type .btn.small');await w(400);
ok((await A.getAttribute('#sbAmount','placeholder'))==='89,500','placeholder shows estimate');
await A.fill('#sbAmount','90200');await A.click('#saveBtn');await w();
const t3=await A.textContent('#savWrap');ok(t3.includes('90,200')&&!t3.includes('הפקדות מאז'),'balance updated, estimate reset');
// edit
await A.click('#savWrap article:first-of-type .goal-edit');await w(400);ok(await A.inputValue('#svBalance')==='90,200','edit prefill');
await A.fill('#svName','קרן השתלמות כריסטינה');await A.click('#saveBtn');await w();ok((await A.textContent('#savWrap')).includes('כריסטינה'),'renamed');
// encryption
await A.click('.tab[data-v=vSettings]');await w();await A.click('#encOnBtn');await w(400);await A.fill('#epPass','abcd');await A.fill('#epPass2','abcd');await A.click('#saveBtn');
await A.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});await A.check('#recSaved',{force:true});await A.click('#saveBtn');await w();
const raw=JSON.stringify(await q(hp+'/savings'));ok(!raw.includes('השתלמות')&&!raw.includes('90200')&&!raw.includes('פיקדון'),'savings encrypted at rest');
await A.click('.tab[data-v=vSavings]');await w();ok((await A.textContent('#savWrap')).includes('130,200'),'still readable, total 130,200');
await A.click('#fab');await w(400);await A.fill('#svName','חיסכון לילד');await A.fill('#svBalance','3000');await A.fill('#svMonthly','50');await A.click('#saveBtn');await w(1000);
const raw2=JSON.stringify(await q(hp+'/savings'));ok(!raw2.includes('חיסכון לילד'),'new saving encrypted');
ok((await A.textContent('#savWrap')).includes('133,200'),'total after add');
// swipe delete with mouse
await A.locator('#savWrap article:last-of-type').evaluate(e=>e.scrollIntoView({block:'center'}));await w(300);const bb=await A.locator('#savWrap article:last-of-type .swipe-in').boundingBox();await A.mouse.move(bb.x+300,bb.y+40);await A.mouse.down();for(let i=1;i<=10;i++)await A.mouse.move(bb.x+300-15*i,bb.y+40);await A.mouse.up();await w(300);console.log('style after swipe:',await A.locator('#savWrap article:last-of-type .swipe-in').getAttribute('style'), bb);
await A.click('#savWrap article:last-of-type .swipe-del');await A.click('#savWrap article:last-of-type .swipe-del');await w(800);
ok(await A.locator('#savWrap article').count()===2,'swipe deleted saving');
// partner sees savings after unlock
const code=await A.evaluate(()=>document.getElementById('codeText')?document.getElementById('codeText').textContent:'');
await A.click('.tab[data-v=vSettings]');await w();const jc=(await A.textContent('#codeText')).trim();
const B=await mk();await B.waitForSelector('#auth:not([hidden])');await B.click('#aSwitch');await B.fill('#aEmail','vb@test.com');await B.fill('#aPass','secret123');await B.click('#aBtn');
await B.waitForSelector('#setup:not([hidden])',{timeout:10000});await B.fill('#sCode',jc);await B.click('#sJoin');await B.waitForSelector('#unlock:not([hidden])',{timeout:10000});
await B.fill('#uPass','abcd');await B.click('#uBtn');await B.waitForSelector('#shell:not([hidden])',{timeout:15000});await B.click('.tab[data-v=vSavings]');await B.waitForTimeout(800);
ok((await B.textContent('#savWrap')).includes('קרן השתלמות כריסטינה'),'partner decrypts savings');
await A.click('.tab[data-v=vSavings]');await w();await A.screenshot({path:'../sav-final.png',fullPage:true});
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
