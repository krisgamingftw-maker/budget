// Drag a plain expense onto a budget used in parts (like groceries): it becomes one of the
// budget's purchases, with its name, and leaves the list. "ביטול" puts it back.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8770,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const shot=process.env.SHOTS||null;
const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',deviceScaleFactor:shot?2:1});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await p.goto('http://127.0.0.1:8770/');return {c,p};};
const {c,p}=await mk();const w=(t=600)=>p.waitForTimeout(t);
await p.waitForSelector('#auth:not([hidden])');await p.tap('#aSwitch');await p.fill('#aEmail','m@test.com');await p.fill('#aPass','secret123');await p.tap('#aBtn');
await p.waitForSelector('#setup:not([hidden])',{timeout:10000});await p.fill('#sName','x');await p.tap('#sCreate');await p.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
const add=async(n,a,split)=>{await p.tap('#fab');await w(300);await p.fill('#fAmount',a);await p.fill('#fName',n);if(split)await p.check('#fSplit',{force:true});await p.tap('#saveBtn');await w(400);};
await add('סופר','2500',true);await add('דירה','4000');await add('בשר','250');await add('קפה','30');await add('חשמל','400');
const names=async()=>p.$$eval('#openList .row .row-name',x=>x.map(e=>e.textContent));
const rowText=async n=>(await p.textContent(`#openList .row:nth-child(${n})`)).replace(/\s+/g,' ');
ok((await names()).join()==='סופר,דירה,בשר,קפה,חשמל','5 rows: '+(await names()).join());
const cdp=await c.newCDPSession(p);const T=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
const ctr=async sel=>{const bb=await p.locator(sel).boundingBox();return {x:bb.x+bb.width/2,y:bb.y+bb.height/2};};
// hold row `from`, move its middle onto the middle of row `onto` (or by dy), optionally screenshot while held
const dragTo=async(from,onto,{dy=null,shotAt,beforeEnd}={})=>{
await p.$eval('#openList',e=>e.scrollIntoView({block:'center'}));await w(200);
const a=await ctr(`#openList .row:nth-child(${from})`);const t=dy==null?await ctr(`#openList .row:nth-child(${onto})`):{y:a.y+dy};
await T('touchStart',[{x:a.x,y:a.y}]);await p.waitForTimeout(550);
for(let i=1;i<=12;i++){await T('touchMove',[{x:a.x,y:a.y+(t.y-a.y)*i/12}]);await p.waitForTimeout(20);}
await p.waitForTimeout(150);if(beforeEnd)await beforeEnd();if(shotAt)await p.screenshot({path:shotAt});
await T('touchEnd',[]);await w(800);};
// 1. drop "בשר" onto "סופר"
let lit=false;
await dragTo(3,1,{shotAt:shot&&path.join(shot,'merge-drag.png'),beforeEnd:async()=>{lit=await p.locator('#openList .row.merge-target').count()===1;}});
ok(lit,'budget lights up while the expense is over it');
ok((await names()).join()==='סופר,דירה,קפה,חשמל','expense left the list: '+(await names()).join());
let r1=await rowText(1);ok(r1.includes('נשארו')&&r1.includes('2,250'),'budget left 2,250: '+r1);
ok(await p.isVisible('#undoBar'),'undo bar shown');ok((await p.textContent('#undoBar')).includes('בשר'),'undo bar names the expense: '+(await p.textContent('#undoBar')));
if(shot)await p.screenshot({path:path.join(shot,'merge-undo.png')});
ok(!(await p.isVisible('#fName'))&&!(await p.isVisible('#spAmount')),'no sheet opened');
// 2. undo puts it back
await p.tap('#undoBar .undo-btn');await w(1200);
ok((await names()).join()==='סופר,דירה,בשר,קפה,חשמל','undo puts it back: '+(await names()).join());
r1=await rowText(1);ok(r1.includes('2,500'),'budget back to 2,500: '+r1);
// 3. merge again and keep it; the purchase list shows its name
await dragTo(3,1);await w(500);
await p.tap('#openList .row:nth-child(1) .row-body');await w(500);
const sp=(await p.textContent('#spList')).replace(/\s+/g,' ');ok(sp.includes('בשר')&&sp.includes('250'),'purchase listed with its name: '+sp);
if(shot)await p.screenshot({path:path.join(shot,'merge-sheet.png')});
await p.tap('#cancelBtn');await w(400);
// 4. a split budget is not dropped into another, and passing over a budget still reorders
await dragTo(4,1,{dy:-((await ctr('#openList .row:nth-child(4)')).y-(await ctr('#openList .row:nth-child(1)')).y)-40});
ok((await names()).join()==='חשמל,סופר,דירה,קפה','dragging past a budget to the top reorders: '+(await names()).join());
ok((await rowText(2)).includes('2,250'),'budget unchanged after passing over it');
// 5. saved: reload sees the merge
await p.reload();await p.waitForSelector('#shell:not([hidden])',{timeout:10000});await w(1200);
ok((await names()).join()==='חשמל,סופר,דירה,קפה','after reload same list');ok((await rowText(2)).includes('2,250'),'after reload budget 2,250');
// 6. encrypted family: merged name and amount are sealed and still readable
await p.tap('.tab[data-v=vSettings]');await w();
await p.tap('#encOnBtn');await w(400);await p.fill('#epPass','abcd');await p.fill('#epPass2','abcd');await p.tap('#saveBtn');
await p.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});await p.check('#recSaved',{force:true});await p.tap('#saveBtn');await w();
await p.tap('.tab[data-v=vMonth]');await w(800);
await dragTo(4,2);await w(1000);
ok((await names()).join()==='חשמל,סופר,דירה','קפה merged in encrypted family: '+(await names()).join());
ok((await rowText(2)).includes('2,220'),'budget left 2,220: '+await rowText(2));
const q=async(u)=>{const r=await fetch('http://127.0.0.1:8085/v1/projects/demo-budget/databases/(default)/documents/'+u,{headers:{Authorization:'Bearer owner'}});return r.json()};
const hh=await q('households');const hp=hh.documents.find(d=>true).name.split('/documents/')[1];const its=JSON.stringify(await q(hp+'/items?pageSize=100'));
ok(!its.includes('קפה')&&!its.includes('בשר'),'merged purchase names encrypted at rest');
await p.reload();await p.waitForSelector('#shell:not([hidden])',{timeout:15000});await w(1500);
await p.tap('#openList .row:nth-child(2) .row-body');await w(500);
const sp2=(await p.textContent('#spList')).replace(/\s+/g,' ');ok(sp2.includes('קפה')&&sp2.includes('בשר'),'names readable after reload: '+sp2);
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
