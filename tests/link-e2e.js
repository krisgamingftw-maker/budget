const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8773,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const A=await c.newPage();
A.on('pageerror',e=>console.log('PAGEERR',e.message));
await A.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await A.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.goto('http://127.0.0.1:8773/');const w=(t=700)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','l@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
await A.click('#fab');await w(350);ok(await A.isHidden('#fLinkWrap'),'link field hidden with no goals/savings');await A.click('#cancelBtn');await w(400);
// goal + saving
await A.click('.tab[data-v=vGoals]');await w();await A.click('#fab');await w(350);await A.fill('#gName','יפן');await A.fill('#gTarget','20000');await A.fill('#gStart','1000');await A.click('#saveBtn');await w();
await A.click('.tab[data-v=vSavings]');await w();await A.click('#fab');await w(350);await A.fill('#svName','קרן השתלמות');await A.fill('#svBalance','50000');await A.fill('#svMonthly','1500');await A.click('#saveBtn');await w();
await A.click('.tab[data-v=vMonth]');await w();
const add=async(n,a,link,rec)=>{await A.click('#fab');await w(350);await A.fill('#fAmount',a);await A.fill('#fName',n);if(rec)await A.check('#fRec',{force:true});if(link)await A.selectOption('#fLink',{label:link});await A.click('#saveBtn');await w();};
await add('חיסכון ליפן','800','יפן',true);await add('הפקדה לקרן','1500','קרן השתלמות',true);
const ot=await A.textContent('#openList');ok(ot.includes('הפקדה ליפן')&&ot.includes('הפקדה לקרן השתלמות'),'rows show link');
await A.screenshot({path:'../link-month.png'});
const goalSaved=async()=>{await A.click('.tab[data-v=vGoals]');await w();const t=await A.textContent('.goal-saved');await A.click('.tab[data-v=vMonth]');await w();return t.trim()};
const savBal=async()=>{await A.click('.tab[data-v=vSavings]');await w();const t=await A.textContent('#savWrap .goal-saved');const all=await A.textContent('#savWrap');await A.click('.tab[data-v=vMonth]');await w();return [t.trim(),all]};
ok((await goalSaved()).includes('1,000'),'goal starts 1,000');
await A.click('#openList .row:has-text("חיסכון ליפן") .check');await w(900);
ok((await goalSaved()).includes('1,800'),'goal 1,800 after paying');
await A.click('#openList .row:has-text("הפקדה לקרן") .check');await w(900);
const sb=await savBal();ok(sb[0].includes('51,500'),'saving 51,500 after paying: '+sb[0]);ok(sb[1].includes('מקושר להוצאה'),'saving shows linked');
// untick
if(!(await A.isVisible('#paidList')))await A.click('#togglePaid');await w(300);
await A.click('#paidList .row:has-text("חיסכון ליפן") .check');await w(900);ok((await goalSaved()).includes('1,000'),'untick removes goal deposit');
await A.click('#openList .row:has-text("חיסכון ליפן") .check');await w(900);ok((await goalSaved()).includes('1,800'),'re-tick adds once');
// edit amount of paid linked
await A.click('#paidList .row:has-text("חיסכון ליפן") .row-body');await w(400);ok((await A.inputValue('#fLink')).startsWith('goal:'),'edit shows link');await A.fill('#fAmount','900');await A.click('#saveBtn');await w(1200);
ok((await goalSaved()).includes('1,900'),'edit amount updates deposit');
// next month carry keeps link, paying again adds new deposit
await A.click('#next');await w();await A.click('#carryBtn');await w(900);
ok((await A.textContent('#openList')).includes('הפקדה ליפן'),'carried with link');
await A.click('#openList .row:has-text("חיסכון ליפן") .check');await w(900);ok((await goalSaved()).includes('2,800'),'next month deposit adds: 1,900+900');
// delete paid linked via swipe
if(!(await A.isVisible('#paidList')))await A.click('#togglePaid');await w(300);
const r=A.locator('#paidList .row:has-text("חיסכון ליפן") .swipe-in');await r.evaluate(e=>e.scrollIntoView({block:'center'}));const bb=await r.boundingBox();
await A.mouse.move(bb.x+300,bb.y+20);await A.mouse.down();for(let i=1;i<=10;i++)await A.mouse.move(bb.x+300-15*i,bb.y+20);await A.mouse.up();await w(300);
await A.click('#paidList .row:has-text("חיסכון ליפן") .swipe-del');await A.click('#paidList .row:has-text("חיסכון ליפן") .swipe-del');await w(1000);
ok((await goalSaved()).includes('1,900'),'deleting paid linked item removes its deposit');
// encryption then link flows still work
await A.click('#prev');await w();
await A.click('.tab[data-v=vSettings]');await w();await A.click('#encOnBtn');await w(400);await A.fill('#epPass','abcd');await A.fill('#epPass2','abcd');await A.click('#saveBtn');
await A.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});await A.check('#recSaved',{force:true});await A.click('#saveBtn');await w();
await A.click('.tab[data-v=vMonth]');await w();
ok((await goalSaved()).includes('1,900'),'after encryption goal still 1,900');
const sb2=await savBal();ok(sb2[0].includes('51,500'),'after encryption saving still 51,500: '+sb2[0]);
const q=async(u)=>{const r=await fetch('http://127.0.0.1:8085/v1/projects/demo-budget/databases/(default)/documents/'+u,{headers:{Authorization:'Bearer owner'}});return r.json()};
const hh=await q('households');const hp=hh.documents[0].name.split('/documents/')[1];const sv=JSON.stringify(await q(hp+'/savings'));ok(!sv.includes('"1500"')&&!sv.includes('השתלמות'),'saving deposits encrypted');
if(!(await A.isVisible('#paidList')))await A.click('#togglePaid');await w(300);
await A.click('#paidList .row:has-text("הפקדה לקרן") .check');await w(1200);const sb3=await savBal();ok(sb3[0].includes('50,000'),'encrypted untick removes saving deposit: '+sb3[0]);
await A.click('#openList .row:has-text("הפקדה לקרן") .check');await w(1200);const sb4=await savBal();ok(sb4[0].includes('51,500'),'encrypted re-tick adds: '+sb4[0]);
await A.click('.tab[data-v=vSavings]');await w();await A.screenshot({path:'../link-sav.png',fullPage:true});
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
