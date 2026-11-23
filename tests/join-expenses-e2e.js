// Drag a regular expense onto another regular expense and hold a moment: the amounts are added
// together into the one it lands on, and the dragged one leaves the list. "ביטול" puts both back.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8771,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const shot=process.env.SHOTS||null;
const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',deviceScaleFactor:shot?2:1});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await p.goto('http://127.0.0.1:8771/');return {c,p};};
const {c,p}=await mk();const w=(t=600)=>p.waitForTimeout(t);
await p.waitForSelector('#auth:not([hidden])');await p.tap('#aSwitch');await p.fill('#aEmail','j@test.com');await p.fill('#aPass','secret123');await p.tap('#aBtn');
await p.waitForSelector('#setup:not([hidden])',{timeout:10000});await p.fill('#sName','x');await p.tap('#sCreate');await p.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
const add=async(n,a)=>{await p.tap('#fab');await w(300);await p.fill('#fAmount',a);await p.fill('#fName',n);await p.tap('#saveBtn');await w(400);};
await add('דירה','4000');await add('בשר','250');await add('חשמל','400');await add('קפה','30');
const names=async()=>p.$$eval('#openList .row .row-name',x=>x.map(e=>e.textContent));
const rowText=async n=>(await p.textContent(`#openList .row:nth-child(${n})`)).replace(/\s+/g,' ');
ok((await names()).join()==='דירה,בשר,חשמל,קפה','4 rows');
const cdp=await c.newCDPSession(p);const T=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
const ctr=async sel=>{const bb=await p.locator(sel).boundingBox();return {x:bb.x+bb.width/2,y:bb.y+bb.height/2};};
const dragTo=async(from,onto,{wait=800,shotAt,beforeEnd}={})=>{
await p.$eval('#openList',e=>e.scrollIntoView({block:'center'}));await w(200);
const a=await ctr(`#openList .row:nth-child(${from})`);const t=await ctr(`#openList .row:nth-child(${onto})`);
await T('touchStart',[{x:a.x,y:a.y}]);await p.waitForTimeout(550);
for(let i=1;i<=12;i++){await T('touchMove',[{x:a.x,y:a.y+(t.y-a.y)*i/12}]);await p.waitForTimeout(20);}
await p.waitForTimeout(wait);if(beforeEnd)await beforeEnd();if(shotAt)await p.screenshot({path:shotAt});
await T('touchEnd',[]);await w(800);};
// 1. a short stop over a row does not join (passing over "חשמל" on the way still moves past it)
let lit=true;await dragTo(4,2,{wait:120,beforeEnd:async()=>{lit=await p.locator('#openList .row.merge-target').count()>0;}});
ok(!lit,'no highlight on a short stop');ok((await names()).join()==='דירה,בשר,קפה,חשמל','short stop does not join, only reorders: '+(await names()).join());ok((await rowText(2)).includes('250'),'בשר still 250');
// 2. hold "קפה" over "בשר": they join
let hint='';await dragTo(3,2,{shotAt:shot&&path.join(shot,'join-drag.png'),beforeEnd:async()=>{lit=await p.locator('#openList .row.merge-target').count()===1;hint=await p.$eval('#openList .row.dragging .swipe-in',e=>getComputedStyle(e,'::after').content).catch(()=>'');}});
ok(lit,'expense lights up after holding over it');ok(hint.includes('לחבר')&&hint.includes('בשר'),'hint names the expense it joins: '+hint);
ok((await names()).join()==='דירה,בשר,חשמל','dragged expense left the list: '+(await names()).join());
ok((await rowText(2)).includes('280'),'בשר is now 280: '+await rowText(2));
ok((await p.textContent('#undoBar')).includes('חובר'),'undo bar: '+(await p.textContent('#undoBar')));
if(shot)await p.screenshot({path:path.join(shot,'join-undo.png')});
ok(!(await p.isVisible('#fName')),'no sheet opened');
// 3. undo
await p.tap('#undoBar .undo-btn');await w(1200);
ok((await names()).join()==='דירה,בשר,קפה,חשמל','undo puts it back: '+(await names()).join());ok((await rowText(2)).includes('250'),'בשר back to 250');
// 4. join again and keep it; total and saved after reload
await dragTo(3,2);await w(500);
await p.reload();await p.waitForSelector('#shell:not([hidden])',{timeout:10000});await w(1200);
ok((await names()).join()==='דירה,בשר,חשמל','after reload 3 rows');ok((await rowText(2)).includes('280'),'after reload בשר 280');
// 5. normal reorder still works: drag the first row to the end
await p.$eval('#openList',e=>e.scrollIntoView({block:'center'}));await w(200);
{const a=await ctr('#openList .row:nth-child(1)');const z=await ctr('#openList .row:nth-child(3)');await T('touchStart',[{x:a.x,y:a.y}]);await p.waitForTimeout(550);
for(let i=1;i<=12;i++){await T('touchMove',[{x:a.x,y:a.y+(z.y-a.y+40)*i/12}]);await p.waitForTimeout(20);}await p.waitForTimeout(100);await T('touchEnd',[]);await w(900);}
ok((await names()).join()==='בשר,חשמל,דירה','reorder still works: '+(await names()).join());
// 6. encrypted family
await p.tap('.tab[data-v=vSettings]');await w();
await p.tap('#encOnBtn');await w(400);await p.fill('#epPass','abcd');await p.fill('#epPass2','abcd');await p.tap('#saveBtn');
await p.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});await p.check('#recSaved',{force:true});await p.tap('#saveBtn');await w();
await p.tap('.tab[data-v=vMonth]');await w(800);
await dragTo(2,3);await w(1000);
ok((await names()).join()==='בשר,דירה','חשמל joined into דירה: '+(await names()).join());ok((await rowText(2)).includes('4,400'),'דירה 4,400: '+await rowText(2));
const q=async(u)=>{const r=await fetch('http://127.0.0.1:8085/v1/projects/demo-budget/databases/(default)/documents/'+u,{headers:{Authorization:'Bearer owner'}});return r.json()};
const hh=await q('households');const hp=hh.documents[0].name.split('/documents/')[1];const its=JSON.stringify(await q(hp+'/items?pageSize=100'));
ok(!its.includes('דירה')&&!its.includes('"4400"'),'joined amount encrypted at rest');
await p.reload();await p.waitForSelector('#shell:not([hidden])',{timeout:15000});await w(1500);
ok((await rowText(2)).includes('4,400'),'readable after reload');
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
