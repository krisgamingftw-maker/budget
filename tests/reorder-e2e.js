// Press and hold an expense, then drag it up or down to change the order.
// The order is saved for the whole family; a quick swipe still deletes and a tap still edits.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8769,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const shot=process.env.SHOTS||null;
const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',deviceScaleFactor:shot?2:1});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await p.goto('http://127.0.0.1:8769/');return {c,p};};
const {c,p}=await mk();const w=(t=600)=>p.waitForTimeout(t);
await p.waitForSelector('#auth:not([hidden])');await p.tap('#aSwitch');await p.fill('#aEmail','r@test.com');await p.fill('#aPass','secret123');await p.tap('#aBtn');
await p.waitForSelector('#setup:not([hidden])',{timeout:10000});await p.fill('#sName','x');await p.tap('#sCreate');await p.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
const names=['דירה','סופר','גז','חשמל','מים','ארנונה','ועד בית','ביטוח רכב','חדר כושר','קפה','מסעדות','דלק'];
for (const [i,n] of names.entries()){await p.tap('#fab');await w(300);await p.fill('#fAmount',String(100+i));await p.fill('#fName',n);await p.tap('#saveBtn');await w(300);}
const order=async(sel='#openList')=>p.$$eval(sel+' .row .row-name',x=>x.map(e=>e.textContent));
ok(JSON.stringify(await order())===JSON.stringify(names),'12 rows in the order added');
const cdp=await c.newCDPSession(p);
const T=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
const center=async sel=>{const bb=await p.locator(sel).boundingBox();return {x:bb.x+bb.width/2,y:bb.y+bb.height/2,h:bb.height};};
// press, hold, then move by dy in small steps; optional pause before letting go
const holdDrag=async(sel,dy,{hold=550,steps=12,pause=0,shotAt,keep}={})=>{if(!keep){await p.$eval(sel,e=>e.scrollIntoView({block:'center'}));await w(200);}const {x,y}=await center(sel);
await T('touchStart',[{x,y}]);await p.waitForTimeout(hold);
for(let i=1;i<=steps;i++){await T('touchMove',[{x,y:y+dy*i/steps}]);await p.waitForTimeout(20);if(shotAt&&i===Math.round(steps/2))await p.screenshot({path:shotAt});}
if(pause)await p.waitForTimeout(pause);
await T('touchEnd',[]);await w(700);};
const rowSel=n=>`#openList .row:nth-child(${n}) .row-body`;
const {h}=await center('#openList .row:nth-child(1)'); // one row's height, with its border
// 1. hold the 1st row and drag it down 2 rows
await p.$eval(rowSel(1),e=>e.scrollIntoView({block:'center'}));await w(200);const scrollBefore=await p.evaluate(()=>scrollY);
await holdDrag(rowSel(1),h*2.5,{keep:true,shotAt:shot&&path.join(shot,'reorder-drag.png')});
let o=await order();ok(o.slice(0,3).join()==='סופר,גז,דירה','dragged down two places: '+o.slice(0,4).join());
ok(!(await p.isVisible('#fName')),'drag did not open the editor');
ok(Math.abs((await p.evaluate(()=>scrollY))-scrollBefore)<5,'page did not scroll while dragging');
// 2. drag a lower row up to the top
await holdDrag(rowSel(4),-h*3.4);
o=await order();ok(o[0]==='חשמל'&&o.slice(1,4).join()==='סופר,גז,דירה','dragged up to the top: '+o.slice(0,5).join());
// 3. a quick move without holding scrolls / swipes, does not reorder
const before=(await order()).join();
const {x,y}=await center(rowSel(2));await T('touchStart',[{x,y}]);for(let i=1;i<=8;i++){await T('touchMove',[{x,y:y+i*12}]);await p.waitForTimeout(16);}await T('touchEnd',[]);await w(500);
ok((await order()).join()===before,'quick vertical move does not reorder');
// 4. swipe left still opens delete
const sx=await center(`#openList .row:nth-child(2) .swipe-in`);await T('touchStart',[{x:sx.x,y:sx.y}]);for(let i=1;i<=10;i++){await T('touchMove',[{x:sx.x-15*i,y:sx.y}]);await p.waitForTimeout(16);}await T('touchEnd',[]);await w(400);
ok(((await p.locator('#openList .row:nth-child(2) .swipe-in').getAttribute('style'))||'').includes('-92'),'swipe left still opens delete');
await p.tap('#monthTitle');await w(400); // closes the swipe
ok(!(await p.isVisible('#fName')),'closing the swipe opened nothing');
// 5. hold and let go without moving: nothing changes, no editor
await holdDrag(rowSel(3),0,{steps:1});ok((await order()).join()===before,'hold without moving keeps the order');ok(!(await p.isVisible('#fName')),'hold without moving does not open editor');
// 6. tap still opens editor
await p.tap(rowSel(1));await w(400);ok(await p.isVisible('#fName'),'tap still opens editor');await p.tap('#cancelBtn');await w(400);
// 7. drag far down with auto-scroll: last row of a long list
await p.evaluate(()=>scrollTo(0,0));await w(200);
const firstName=(await order())[0];const fy=await center(rowSel(1));
// drag to the bottom of the screen and keep holding so the page scrolls by itself
await holdDrag(rowSel(1),800-fy.y,{pause:2500,keep:true});
o=await order();ok(o[o.length-1]===firstName||o.indexOf(firstName)>=8,'auto-scroll lets a row go far down: at '+o.indexOf(firstName));
// 8. saved for the family: a second device sees the new order
const want=(await order()).join();
await w(800);
const r2=await mk();const p2=r2.p;
await p2.waitForSelector('#auth:not([hidden])');await p2.fill('#aEmail','r@test.com');await p2.fill('#aPass','secret123');await p2.tap('#aBtn');
await p2.waitForSelector('#shell:not([hidden])',{timeout:10000});await p2.waitForTimeout(1500);
const got=(await p2.$$eval('#openList .row .row-name',x=>x.map(e=>e.textContent))).join();
ok(got===want,'other device sees the same order');
// 9. second device reorders, first device updates live
await p2.$eval('#openList .row:nth-child(2)',e=>e.scrollIntoView({block:'center'}));await p2.waitForTimeout(200);const c2=await r2.c.newCDPSession(p2);const bb=await p2.locator('#openList .row:nth-child(2)').boundingBox();
const X=bb.x+bb.width/2,Y=bb.y+bb.height/2;await c2.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:X,y:Y}]});await p2.waitForTimeout(550);
for(let i=1;i<=10;i++){await c2.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:X,y:Y-bb.height*1.3*i/10}]});await p2.waitForTimeout(20);}
await c2.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p2.waitForTimeout(1500);
const want2=(await p2.$$eval('#openList .row .row-name',x=>x.map(e=>e.textContent))).join();
ok(want2!==got,'second device moved a row');
ok((await order()).join()===want2,'first device sees it live');
// 10. paid list can be reordered too
for(let i=0;i<3;i++){await p.tap('#openList .row:nth-child(1) .check');await w(500);}

const pb=await order('#paidList');const pc=await center('#paidList .row:nth-child(1)');
await holdDrag('#paidList .row:nth-child(1) .row-body',pc.h*1.3);
const pa=await order('#paidList');ok(pa[1]===pb[0]&&pa[0]===pb[1],'paid list reorders: '+pa.join());
if(shot){await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(shot,'reorder-after.png')});}
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
