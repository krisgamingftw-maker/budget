const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8772,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await p.goto('http://127.0.0.1:8772/');return p};
const A=await mk();const w=(t=600)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','sp@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
await A.click('#fab');await w(350);await A.fill('#fAmount','2500');await A.fill('#fName','סופר');await A.check('#fRec',{force:true});await A.check('#fSplit',{force:true});await A.click('#saveBtn');await w();
await A.click('#fab');await w(350);await A.fill('#fAmount','4000');await A.fill('#fName','דירה');await A.click('#saveBtn');await w();
const row=()=>A.textContent('#openList');ok((await row()).includes('נשארו')&&(await row()).includes('2,500'),'split row shows remaining');
const hero=async()=>[(await A.textContent('#remain')).trim(),(await A.textContent('#sPaid')).trim(),(await A.textContent('#sTotal')).trim()];
console.log('hero start',await hero());
for (const a of ['300','400']){await A.click('#openList .check.add');await w(400);await A.fill('#spAmount',a);await A.click('#saveBtn');await w();}
ok((await row()).includes('1,800'),'remaining 1,800 after 300+400');
const h=await hero();console.log('hero',h);ok(h[1].includes('700')&&h[0].includes('5,800'),'hero counts spent 700, left 5,800');
await A.click('#openList .row:has-text("סופר") .row-body');await w(400);
ok((await A.textContent('#spSummary')).includes('1,800'),'sheet summary');ok(await A.locator('#spList li').count()===2,'2 purchases listed');
await A.screenshot({path:'../split-sheet.png'});
await A.click('#spList li:first-child .sp-del');await A.click('#spList li:first-child .sp-del');await w(800);
ok(await A.locator('#spList li').count()===1,'purchase deleted');ok((await A.textContent('#spSummary')).includes('2,200'),'summary live-updated 2,200');
await A.click('#cancelBtn');await w(400);
await A.screenshot({path:'../split-row.png'});
// overspend
await A.click('#openList .check.add');await w(400);await A.fill('#spAmount','2500');await A.click('#saveBtn');await w();
const all=await A.textContent('#vMonth');ok(all.includes('חריגה של'),'overspend shown');
const h2=await hero();console.log('hero over',h2);ok(h2[2].includes('6,800'),'total grows with overspend 4000+2800');
ok((await A.textContent('#openList')).indexOf('סופר')<0,'over-budget item moved to paid');
// edit via sheet link
if(!(await A.isVisible('#paidList')))await A.click('#togglePaid');await w(300);
await A.click('#paidList .row:has-text("סופר") .row-body');await w(400);await A.click('#spEdit');await w(400);
ok(await A.isChecked('#fSplit'),'edit sheet shows split on');await A.fill('#fAmount','3,000');await A.click('#saveBtn');await w();
ok((await A.textContent('#vMonth')).includes('נשארו'),'raised budget → back to remaining');
// carry to next month
await A.click('#next');await w();await A.click('#carryBtn');await w(800);
const nx=await A.textContent('#openList');ok(nx.includes('סופר')&&nx.includes('נשארו')&&nx.includes('3,000'),'next month: split carried, spends reset');
await A.click('#prev');await w();
// encryption + partner
await A.click('.tab[data-v=vSettings]');await w();const jc=(await A.textContent('#codeText')).trim();
await A.click('#encOnBtn');await w(400);await A.fill('#epPass','abcd');await A.fill('#epPass2','abcd');await A.click('#saveBtn');
await A.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});await A.check('#recSaved',{force:true});await A.click('#saveBtn');await w();
const q=async(u)=>{const r=await fetch('http://127.0.0.1:8085/v1/projects/demo-budget/databases/(default)/documents/'+u,{headers:{Authorization:'Bearer owner'}});return r.json()};
const hh=await q('households');const hp=hh.documents[0].name.split('/documents/')[1];const its=JSON.stringify(await q(hp+'/items'));
ok(!its.includes('"integerValue":"2500"')&&!its.includes('"integerValue":"300"')&&!its.includes('סופר'),'spends encrypted at rest');
await A.click('.tab[data-v=vMonth]');await w();ok((await A.textContent('#vMonth')).includes('נשארו'),'still readable after encrypt');
const B=await mk();await B.waitForSelector('#auth:not([hidden])');await B.click('#aSwitch');await B.fill('#aEmail','sp2@test.com');await B.fill('#aPass','secret123');await B.click('#aBtn');
await B.waitForSelector('#setup:not([hidden])',{timeout:10000});await B.fill('#sCode',jc);await B.click('#sJoin');await B.waitForSelector('#unlock:not([hidden])',{timeout:10000});
await B.fill('#uPass','abcd');await B.click('#uBtn');await B.waitForSelector('#shell:not([hidden])',{timeout:15000});await B.waitForTimeout(800);
await B.click('#openList .check.add');await B.waitForTimeout(400);await B.fill('#spAmount','100');await B.click('#saveBtn');await B.waitForTimeout(1000);await w(800);
ok((await A.textContent('#openList')).includes('100')||(await A.textContent('#vMonth')).includes('2,100'),'A sees partner purchase: '+(await A.textContent('#openList')).replace(/\s+/g,' '));
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
