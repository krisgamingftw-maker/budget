const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8768,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await p.goto('http://127.0.0.1:8768/');const w=(t=600)=>p.waitForTimeout(t);
await p.waitForSelector('#auth:not([hidden])');await p.tap('#aSwitch');await p.fill('#aEmail','s@test.com');await p.fill('#aPass','secret123');await p.tap('#aBtn');
await p.waitForSelector('#setup:not([hidden])',{timeout:10000});await p.fill('#sName','x');await p.tap('#sCreate');await p.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
for (const [n,a] of [['דירה','4000'],['סופר','2300'],['גז','90']]){await p.tap('#fab');await w(350);await p.fill('#fAmount',a);await p.fill('#fName',n);await p.tap('#saveBtn');await w(400);}
const cnt=()=>p.locator('#openList .row').count();ok(await cnt()===3,'3 rows');
const cdp=await c.newCDPSession(p);
const touchSwipe=async(sel,dx)=>{const bb=await p.locator(sel).boundingBox();const y=bb.y+bb.height/2;let x=bb.x+bb.width/2;
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/10,y}]});await p.waitForTimeout(16);}
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await w(400);};
// tap still opens editor
await p.tap('#openList .row:nth-child(1) .row-body');await w(400);ok(await p.isVisible('#fName'),'tap opens editor');await p.tap('#cancelBtn');await w(400);
// short swipe snaps back
await touchSwipe('#openList .row:nth-child(1) .swipe-in',30);ok(!(await p.locator('#openList .row:nth-child(1) .swipe-in').getAttribute('style')||'').includes('92'),'short swipe snaps back');
// left swipe does nothing
await touchSwipe('#openList .row:nth-child(1) .swipe-in',-150);ok(!(await p.locator('#openList .row:nth-child(1) .swipe-in').getAttribute('style')||'').includes('translateX('),'left swipe ignored');
await touchSwipe('#openList .row:nth-child(1) .swipe-in',150);
ok((await p.locator('#openList .row:nth-child(1) .swipe-in').getAttribute('style')).includes('92'),'swipe right opens');
ok(!(await p.isVisible('#fName')),'swipe did not open editor');
await p.screenshot({path:'../swipe-open.png'});
await p.tap('#openList .row:nth-child(1) .swipe-del');await w(200);ok((await p.textContent('#openList .row:nth-child(1) .swipe-del')).includes('בטוח'),'first tap asks');
await p.screenshot({path:'../swipe-armed.png'});
await p.tap('#openList .row:nth-child(1) .swipe-del');await w(800);ok(await cnt()===2,'row deleted: '+await cnt());
// tap on open row closes it
await touchSwipe('#openList .row:nth-child(1) .swipe-in',150);await p.tap('#openList .row:nth-child(1) .row-body');await w(400);
ok(!(await p.isVisible('#fName')),'tap on open row closes it, no editor');ok(await cnt()===2,'nothing deleted');
// check button still works
await p.tap('#openList .row:nth-child(1) .check');await w(600);ok(await cnt()===1,'check still works');
// mouse swipe on goal
await p.tap('.tab[data-v=vGoals]');await w();await p.tap('#fab');await w(350);await p.fill('#gName','יפן');await p.fill('#gTarget','10000');await p.tap('#saveBtn');await w();
ok(await p.locator('.goal').count()===1,'goal created');
await touchSwipe('.goal .swipe-in',150);await p.screenshot({path:'../swipe-goal.png'});
await p.tap('.goal .swipe-del');await p.tap('.goal .swipe-del');await w(800);ok(await p.locator('.goal').count()===0,'goal deleted');
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
