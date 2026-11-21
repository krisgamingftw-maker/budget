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
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','cc@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
const add=async(n,a,cat)=>{await A.click('#fab');await w(350);await A.fill('#fAmount',a);await A.fill('#fName',n);await w(100);if(cat){await A.click(`#fCats [data-c=${cat}]`);}const sel=await A.getAttribute('#fCats [aria-pressed=true]','data-c');await A.click('#saveBtn');await w(500);return sel;};
const catId=async(name)=>A.evaluate(n=>{const b=[...document.querySelectorAll('#fCats .chip')].find(x=>x.textContent.includes(n));return b?b.dataset.c:null},name);
await add('דירה','4000');await add('חשמל','400');
// 1. add a category from inside the expense sheet
await A.click('#fab');await w(350);await A.fill('#fAmount','250');await A.fill('#fName','מתנה ליום הולדת של נועה');
await A.click('#fCatAdd');ok(!(await A.isHidden('#fNewCat')),'inline new category form opens');
ok(await A.isHidden('#fNewCatEmojis'),'emoji picker starts closed');
await A.click('#fNewCatEmojiBtn');await w(200);ok(await A.isVisible('#fNewCatEmojis'),'tapping the emoji opens the picker');
await A.screenshot({path:'../emoji-picker.png'});
await A.click('#fNewCatGrid .emoji-btn[data-e="🎁"]');await w(150);
ok(await A.isHidden('#fNewCatEmojis'),'picker closes after choosing');ok((await A.textContent('#fNewCatEmojiBtn'))==='🎁','chosen emoji shown');await A.fill('#fNewCatName','מתנות');await A.click('#fNewCatOk');await w(300);
const gid=await A.getAttribute('#fCats [aria-pressed=true]','data-c');ok(gid&&gid.startsWith('c'),'new category is selected: '+gid);
ok(await A.isHidden('#fNewCat'),'inline form closes');
await A.screenshot({path:'../custom-cats-sheet.png'});
await A.click('#saveBtn');await w(700);
ok((await A.textContent('#openList .row:has-text("מתנה ליום")')).includes('מתנות'),'row shows custom category');
const strip=await A.textContent('#catList');ok(strip.includes('מתנות')&&strip.includes('250'),'strip shows custom category total');
// duplicate name refused
await A.click('#fab');await w(350);await A.click('#fCatAdd');await A.fill('#fNewCatName','חשבונות');await A.click('#fNewCatOk');await w(200);
ok(!(await A.isHidden('#sheetError'))&&(await A.textContent('#sheetError')).includes('כבר יש'),'duplicate name refused');
await A.click('#cancelBtn');await w(400);
// 2. guess by custom name
await A.click('#fab');await w(350);await A.fill('#fName','מתנות לחג');await w(100);ok(await A.getAttribute('#fCats [aria-pressed=true]','data-c')===gid,'auto-guess picks custom category by name');await A.click('#cancelBtn');await w(400);
// 3. filter by custom category
await A.click(`#catList .cat-row:has-text("מתנות")`);await w();ok(await A.locator('#openList .row').count()===1,'filter by custom category');
ok((await A.textContent('#catFilterText')).includes('מתנות'),'filter note names custom category');
await A.click('#catClear');await w();
// 4. partner sees it (second user joins with the code)
const B=await (await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})).newPage();B.on('pageerror',e=>console.log('PAGEERR B',e.message));
await B.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await B.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.click('.tab[data-v=vSettings]');await w();const hcode=(await A.textContent('#codeText')).replace(/[^A-Z0-9]/g,'');
ok((await A.textContent('#setCats')).includes('מתנות'),'settings lists custom category');
await B.goto('http://127.0.0.1:8781/');await B.waitForSelector('#auth:not([hidden])');await B.click('#aSwitch');await B.fill('#aEmail','cc2@test.com');await B.fill('#aPass','secret123');await B.click('#aBtn');
await B.waitForSelector('#setup:not([hidden])',{timeout:10000});
await B.fill('#sCode',hcode);await B.click('#sJoin');await B.waitForSelector('#shell:not([hidden])',{timeout:10000});await B.waitForTimeout(1200);
ok((await B.textContent('#catList')).includes('מתנות'),'partner sees custom category in strip');
await B.click('#fab');await B.waitForTimeout(350);ok(await B.locator(`#fCats [data-c=${gid}]`).count()===1,'partner can pick custom category');await B.click('#cancelBtn');await B.waitForTimeout(300);
// 5. add from settings with emoji + color, then edit
await A.click('#setCatAdd');await w(400);await A.fill('#cName','חתונות');await A.click('#cEmojis [data-e="💍"]');await A.click('#cColors .swatch >> nth=3');
ok((await A.textContent('#cPreview')).includes('חתונות'),'preview updates');
await A.screenshot({path:'../custom-cats-new.png'});
await A.click('#saveBtn');await w(600);ok((await A.textContent('#setCats')).includes('💍 חתונות'),'added from settings');
await A.screenshot({path:'../custom-cats-settings.png',fullPage:true});
await B.click('.tab[data-v=vSettings]');await B.waitForTimeout(1000);ok((await B.textContent('#setCats')).includes('חתונות'),'partner sees new category live');
await A.click('#setCats .chip:has-text("מתנות")');await w(400);await A.fill('#cName','מתנות וימי הולדת');await A.click('#saveBtn');await w(700);
await A.click('.tab[data-v=vMonth]');await w();ok((await A.textContent('#openList .row:has-text("מתנה ליום")')).includes('מתנות וימי הולדת'),'rename shows on rows');
// 6. encryption keeps custom categories
await A.click('.tab[data-v=vSettings]');await w();await A.click('#encOnBtn');await w(400);await A.fill('#epPass','abcd');await A.fill('#epPass2','abcd');await A.click('#saveBtn');
await A.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});await A.check('#recSaved',{force:true});await A.click('#saveBtn');await w(800);
ok((await A.textContent('#setCats')).includes('מתנות וימי הולדת'),'custom category readable after encryption');
const rawCat=await A.evaluate(async(id)=>{const d=await firebase.firestore().collection('households').doc(localStorage.getItem('budget-hid-'+firebase.auth().currentUser.uid)).collection('cats').doc(id).get();return d.data()},gid);
ok(rawCat&&rawCat.e&&!rawCat.name,'custom category name stored encrypted');
await A.click('#setCatAdd');await w(400);await A.fill('#cName','לימודים');await A.click('#saveBtn');await w(700);
const raw2=await A.evaluate(async()=>{const s=await firebase.firestore().collection('households').doc(localStorage.getItem('budget-hid-'+firebase.auth().currentUser.uid)).collection('cats').get();return s.docs.map(d=>d.data())});
ok(raw2.length===3&&raw2.every(x=>x.e&&!x.name),'new category after encryption is encrypted');
// 7. delete keeps expenses
await A.click('#setCats .chip:has-text("מתנות וימי")');await w(400);await A.click('#deleteBtn');await w(200);ok((await A.textContent('#confirmText')).includes('לא יימחקו'),'delete warns expenses stay');
await A.click('#confirmYes');await w(700);ok(!(await A.textContent('#setCats')).includes('מתנות וימי'),'category deleted');
await A.click('.tab[data-v=vMonth]');await w();ok(await A.locator('#openList .row:has-text("מתנה ליום")').count()===1,'expense kept after category delete');
ok(!(await A.textContent('#openList .row:has-text("מתנה ליום")')).includes('מתנות'),'expense falls back to another category');
await A.screenshot({path:'../custom-cats-month.png'});
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
