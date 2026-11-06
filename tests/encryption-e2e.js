const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8767,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await p.goto('http://127.0.0.1:8767/');return p;};
const w=(p,t=700)=>p.waitForTimeout(t);
const signup=async(p,email)=>{await p.waitForSelector('#auth:not([hidden])');await p.click('#aSwitch');await p.fill('#aEmail',email);await p.fill('#aPass','secret123');await p.click('#aBtn');await p.waitForSelector('#setup:not([hidden])',{timeout:10000});};
const login=async(p,email)=>{await p.waitForSelector('#auth:not([hidden])');await p.fill('#aEmail',email);await p.fill('#aPass','secret123');await p.click('#aBtn');};
const rows=p=>p.locator('#openList .row, #paidList .row').count();
const A=await mk();await signup(A,'kris@test.com');await A.fill('#sName','משפחה');await A.click('#sCreate');
await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w(A);
for (const [n,a] of [['דירה','4000'],['סופר','2300']]){await A.click('#fab');await w(A,350);await A.fill('#fAmount',a);await A.fill('#fName',n);await A.click('#saveBtn');await w(A,400);}
await A.click('#incomeBtn');await w(A,350);await A.fill('#fIncome','15000');await A.click('#saveBtn');await w(A);
await A.click('.tab[data-v=vGoals]');await w(A);await A.click('#fab');await w(A,350);await A.fill('#gName','טיול');await A.fill('#gTarget','8000');await A.fill('#gStart','1500');await A.click('#saveBtn');await w(A);
await A.click('.goal .btn');await w(A,350);await A.fill('#dAmount','700');await A.click('#saveBtn');await w(A);
const goalTxtBefore=await A.textContent('#vGoals');
await A.click('.tab[data-v=vSettings]');await w(A);
const code=(await A.textContent('#codeText')).trim().replace('-','');
ok(await A.isVisible('#encOnBtn'),'enable button visible');
await A.click('#encOnBtn');await w(A,400);
await A.fill('#epPass','family1');await A.fill('#epPass2','family2');await A.click('#saveBtn');await w(A,400);
ok(await A.isVisible('#sheetError'),'mismatch error: '+(await A.textContent('#sheetError')));
await A.fill('#epPass2','family1');await A.click('#saveBtn');
await A.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});
const rec=(await A.textContent('#recCode')).trim();ok(rec.length>=20,'recovery code shown '+rec);
await A.screenshot({path:'../enc-recovery.png'});
await A.click('#scrim',{force:true}).catch(()=>{});await w(A,300);
ok(await A.isVisible('#recCode'),'recovery sheet cannot be dismissed before ticking');
await A.check('#recSaved',{force:true});await A.click('#saveBtn');await w(A,500);
ok(!(await A.isVisible('#recCode')),'recovery sheet closed');
await A.screenshot({path:'../enc-settings.png',fullPage:true});
console.log('encText:',await A.textContent('#encText'));
await A.click('.tab[data-v=vMonth]');await w(A);ok(await rows(A)===2,'A still sees 2 rows');
ok((await A.textContent('#vMonth')).includes('דירה'),'A sees names');
await A.click('.tab[data-v=vGoals]');await w(A);const gAfter=await A.textContent('#vGoals');ok(gAfter===goalTxtBefore,'goals unchanged after encryption');
if(gAfter!==goalTxtBefore)console.log(goalTxtBefore,'\n',gAfter);
// add after encryption
await A.click('.tab[data-v=vMonth]');await w(A);await A.click('#fab');await w(A,350);await A.fill('#fAmount','99');await A.fill('#fName','סודי');await A.click('#saveBtn');await w(A,800);
// raw firestore
const hid=(await A.evaluate(()=>window.__hid||null));
const q=async(p)=>{const r=await fetch(`http://127.0.0.1:8085/v1/projects/demo-budget/databases/(default)/documents/${p}`,{headers:{Authorization:'Bearer owner'}});return r.json()};
const hh=await q('households?pageSize=10');const hdoc=hh.documents[0];const hpath=hdoc.name.split('/documents/')[1];
ok(!!hdoc.fields.crypto,'household has crypto');
const its=await q(hpath+'/items');const dump=JSON.stringify(its);
ok(!dump.includes('דירה')&&!dump.includes('סודי')&&!dump.includes('4000'),'no plaintext names/amounts in items');
console.log('sample item fields:',Object.keys(its.documents[0].fields));
const ms=JSON.stringify(await q(hpath+'/months'));ok(!ms.includes('15000'),'income hidden');
const gs=JSON.stringify(await q(hpath+'/goals'));ok(!gs.includes('טיול')&&!gs.includes('8000')&&!gs.includes('700'),'goals hidden');
// partner
const B=await mk();await signup(B,'p@test.com');await B.fill('#sCode',code);await B.click('#sJoin');
await B.waitForSelector('#unlock:not([hidden])',{timeout:10000});ok(true,'partner sees unlock screen');
await B.screenshot({path:'../enc-unlock.png'});
await B.fill('#uPass','wrongpw');await B.click('#uBtn');await w(B,2500);ok(await B.isVisible('#uErr'),'wrong pw error: '+(await B.textContent('#uErr')));
await B.fill('#uPass','family1');await B.click('#uBtn');await B.waitForSelector('#shell:not([hidden])',{timeout:15000});await w(B);
ok(await rows(B)===3,'partner sees 3 rows: '+await rows(B));ok((await B.textContent('#vMonth')).includes('סודי'),'partner decrypts names');
// reload keeps key
await B.reload();await B.waitForSelector('#shell:not([hidden])',{timeout:15000});await w(B);ok(await rows(B)===3,'after reload no password needed');
// partner edits, A sees
await B.click('#openList .row .check');await w(B);await w(A);ok(await A.locator('#paidList .row').count()===1,'A sees partner tick');
// partner logs out, uses recovery code
await B.click('.tab[data-v=vSettings]');await w(B);await B.click('#logoutBtn');await w(B);
await login(B,'p@test.com');await B.waitForSelector('#unlock:not([hidden])',{timeout:10000});ok(true,'after logout key forgotten');
await B.click('#uSwitch');await B.fill('#uCode',rec.toLowerCase().replace(/-/g,''));await B.click('#uBtn');
await B.waitForSelector('#shell:not([hidden])',{timeout:15000});await w(B,1000);
ok(await B.isVisible('#epPass'),'recovery leads to new password sheet');
await B.fill('#epPass','newpass9');await B.fill('#epPass2','newpass9');await B.click('#saveBtn');await w(B,3000);
ok(!(await B.isVisible('#epPass')),'new password saved');
// new device for A with new password
const A2=await mk();await login(A2,'kris@test.com');await A2.waitForSelector('#unlock:not([hidden])',{timeout:10000});
await A2.fill('#uPass','family1');await A2.click('#uBtn');await w(A2,2500);ok(await A2.isVisible('#uErr'),'old password rejected');
await A2.fill('#uPass','newpass9');await A2.click('#uBtn');await A2.waitForSelector('#shell:not([hidden])',{timeout:15000});await w(A2);ok(await rows(A2)===3,'new password works');
// A original device still fine
await A.reload();await A.waitForSelector('#shell:not([hidden])',{timeout:15000});await w(A);ok(await rows(A)===3,'A device still unlocked');
// new recovery code from settings
await A.click('.tab[data-v=vSettings]');await w(A);await A.click('#encCodeBtn');await w(A,3000);
const rec2=(await A.textContent('#recCode')).trim();ok(rec2!==rec&&rec2.length>=20,'new recovery code '+rec2);
await A.check('#recSaved',{force:true});await A.click('#saveBtn');await w(A,500);
// change password from settings
await A.click('#encPassBtn');await w(A,400);await A.fill('#epPass','third333');await A.fill('#epPass2','third333');await A.click('#saveBtn');await w(A,3000);
const A3=await mk();await login(A3,'kris@test.com');await A3.waitForSelector('#unlock:not([hidden])',{timeout:10000});
await A3.click('#uSwitch');await A3.fill('#uCode',rec);await A3.click('#uBtn');await w(A3,3000);ok(await A3.isVisible('#uErr'),'old recovery code rejected');
await A3.fill('#uCode',rec2);await A3.click('#uBtn');await A3.waitForSelector('#shell:not([hidden])',{timeout:15000});ok(true,'new recovery code works');
console.log(fail?`${fail} FAILED`:'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
