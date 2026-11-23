// Changing the emoji (and color) of any category, built-in or family-made, from Settings or
// from the "עריכת קטגוריות" button above the month's category strip (opens a sheet in place),
// or by holding a category tile on the month page.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8782,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const page=async(ctxOpt)=>{const P=await (await b.newContext(Object.assign({viewport:{width:390,height:844},serviceWorkers:'block'},ctxOpt||{}))).newPage();P.on('pageerror',e=>{console.log('PAGEERR',e.message);fail++});
await P.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await P.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await P.goto('http://127.0.0.1:8782/');return P;};
const A=await page({deviceScaleFactor:2});const w=(t=600)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','ed@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
const add=async(n,a)=>{await A.click('#fab');await w(350);await A.fill('#fAmount',a);await A.fill('#fName',n);await w(100);await A.click('#saveBtn');await w(500);};
ok(await A.isVisible('#catEditBtn'),'edit button shows even on an empty month');
await add('דירה','4000');await add('חשמל','400');
const rowTag=(n)=>A.textContent(`#openList .row:has-text("${n}") .cat-tag`);
ok((await rowTag('דירה')).includes('🏠'),'built-in emoji before edit');
// 1. the strip has an edit tile that leads to the categories card
ok(await A.isVisible('#catEditBtn'),'edit button above the category strip');
await A.screenshot({path:'../cat-edit-strip.png'});
await A.click('#catEditBtn');await w(500);
ok(await A.isVisible('#shCats')&&(await A.textContent('#shCats')).includes('חשבונות'),'button opens the categories sheet on the month page');
await A.screenshot({path:'../cat-sheet.png'});
await A.click('#sheetX');await w(400);
const goSettings=async()=>{await A.click('.tab[data-v=vSettings]');await w(600);};
await goSettings();
ok(await A.isVisible('#catCard'),'settings categories card');
const chips=await A.textContent('#setCats');ok(chips.includes('בית')&&chips.includes('חשבונות')&&chips.includes('שונות'),'settings lists built-in categories too');
// 2. change a built-in category's emoji
await A.click('#setCats [data-c=home]');await w(400);
ok(await A.isHidden('#cNameField'),'name of a built-in category is not editable');
ok(await A.isVisible('#cBuiltinNote'),'built-in note shown');
ok(await A.isHidden('#cOrig'),'reset hidden while nothing changed');
await A.click('#cEmojis [data-e="🔧"]');await w(100);
ok(await A.isVisible('#cOrig'),'reset shows after a change');
ok((await A.textContent('#cPreview')).includes('🔧'),'preview shows new emoji');
await A.screenshot({path:'../cat-edit-builtin.png'});
await A.click('#saveBtn');await w(700);
ok((await A.textContent('#setCats [data-c=home]')).includes('🔧'),'settings shows new emoji');
await A.click('.tab[data-v=vMonth]');await w();
ok((await rowTag('דירה')).includes('🔧'),'existing expense shows the new emoji');
ok((await A.textContent('#catList')).includes('🔧'),'strip shows the new emoji');
await A.click('#fab');await w(350);ok((await A.textContent('#fCats [data-c=home]')).includes('🔧'),'expense sheet chip shows the new emoji');await A.click('#cancelBtn');await w(400);
// 3. partner sees it
await A.click('.tab[data-v=vSettings]');await w();const hcode=(await A.textContent('#codeText')).replace(/[^A-Z0-9]/g,'');
const B=await page();await B.waitForSelector('#auth:not([hidden])');await B.click('#aSwitch');await B.fill('#aEmail','ed2@test.com');await B.fill('#aPass','secret123');await B.click('#aBtn');
await B.waitForSelector('#setup:not([hidden])',{timeout:10000});await B.fill('#sCode',hcode);await B.click('#sJoin');await B.waitForSelector('#shell:not([hidden])',{timeout:10000});await B.waitForTimeout(1200);
ok((await B.textContent('#openList .row:has-text("דירה") .cat-tag')).includes('🔧'),'partner sees the new emoji');
// 4. fix a family category's emoji, typed by hand
await A.click('#setCatAdd');await w(400);await A.fill('#cName','מתנות');await A.click('#cEmojis [data-e="🎂"]');await A.click('#saveBtn');await w(600);
await A.click('.tab[data-v=vMonth]');await w();await add('מתנות לנועה','200');
ok((await rowTag('מתנות לנועה')).includes('🎂'),'custom category with the wrong emoji');
await goSettings();await A.click('#setCats .chip:has-text("מתנות")');await w(400);
ok(await A.isVisible('#cNameField')&&await A.isVisible('#deleteBtn'),'custom category keeps name + delete');
await A.fill('#cEmoji','🎁');await A.click('#saveBtn');await w(700);
await A.click('.tab[data-v=vMonth]');await w();ok((await rowTag('מתנות לנועה')).includes('🎁'),'expense shows corrected custom emoji');
ok((await B.textContent('#openList .row:has-text("מתנות לנועה") .cat-tag')).includes('🎁'),'partner sees corrected custom emoji');
// 5. encryption keeps the change, emoji stored sealed
await A.click('.tab[data-v=vSettings]');await w();await A.click('#encOnBtn');await w(400);await A.fill('#epPass','abcd');await A.fill('#epPass2','abcd');await A.click('#saveBtn');
await A.waitForFunction(()=>/[A-Z0-9]{5}-/.test(document.getElementById('recCode').textContent),null,{timeout:20000});await A.check('#recSaved',{force:true});await A.click('#saveBtn');await w(900);
const raw=await A.evaluate(async()=>{const d=await firebase.firestore().collection('households').doc(localStorage.getItem('budget-hid-'+firebase.auth().currentUser.uid)).collection('cats').doc('b-home').get();return d.data()});
ok(raw&&raw.e&&!raw.emoji&&raw.base==='home','built-in override sealed after encryption, base kept');
ok((await A.textContent('#setCats [data-c=home]')).includes('🔧'),'override readable after encryption');
ok(!(await A.textContent('#setCats')).includes('🔒'),'override never shows as a locked category');
// 6. back to the original
await A.click('#setCats [data-c=home]');await w(400);await A.click('#cOrig');await w(100);
ok((await A.inputValue('#cEmoji'))==='🏠','reset puts the original emoji back');await A.click('#saveBtn');await w(700);
const gone=await A.evaluate(async()=>{const d=await firebase.firestore().collection('households').doc(localStorage.getItem('budget-hid-'+firebase.auth().currentUser.uid)).collection('cats').doc('b-home').get();return !d.exists});
ok(gone,'reset removes the saved override');
await A.click('.tab[data-v=vMonth]');await w();ok((await rowTag('דירה')).includes('🏠'),'expense back to the original emoji');
// 7. X closes a sheet without saving
await A.click('#fab');await w(400);ok(await A.isVisible('#sheetX'),'sheet has an X button');await A.fill('#fAmount','1');await A.fill('#fName','לא לשמור');
await A.click('#sheetX');await w(500);ok(await A.isHidden('#sheet'),'X closes the sheet');ok(await A.locator('#openList .row:has-text("לא לשמור")').count()===0,'X does not save');
// 8. delete (hide) a built-in category, with confirmation, and bring it back
await goSettings();await A.click('#setCats [data-c=misc]');await w(400);ok(await A.isHidden('#deleteBtn'),'"שונות" cannot be deleted');await A.click('#sheetX');await w(400);
await A.click('#setCats [data-c=bills]');await w(400);ok(await A.isVisible('#deleteBtn'),'built-in category has a delete button');
await A.click('#deleteBtn');await w(200);ok((await A.textContent('#confirmText')).includes('לא יימחקו'),'asks before deleting');
await A.screenshot({path:'../cat-delete-confirm.png'});
await A.click('#confirmYes');await w(800);
ok(await A.locator('#setCats [data-c=bills]').count()===0,'deleted category gone from the list');
ok(await A.isVisible('#setCatsHiddenWrap')&&(await A.textContent('#setCatsHidden')).includes('חשבונות'),'deleted built-in listed for restore');
await A.screenshot({path:'../cat-settings.png',fullPage:true});
await A.click('.tab[data-v=vMonth]');await w();ok(await A.locator('#openList .row:has-text("חשמל")').count()===1,'expense kept');
ok((await rowTag('חשמל')).includes('שונות'),'expense moves to שונות');
await A.click('#fab');await w(350);ok(await A.locator('#fCats [data-c=bills]').count()===0,'deleted category not offered for new expenses');await A.fill('#fName','חשמל');await w(150);
ok(await A.getAttribute('#fCats [aria-pressed=true]','data-c')==='misc','auto-guess skips the deleted category');await A.click('#cancelBtn');await w(400);
await A.click('.tab[data-v=vSettings]');await w();await A.click('#setCatsHidden [data-c=bills]');await w(700);
ok(await A.locator('#setCats [data-c=bills]').count()===1&&await A.isHidden('#setCatsHiddenWrap'),'restored');
await A.click('.tab[data-v=vMonth]');await w();ok((await rowTag('חשמל')).includes('חשבונות'),'expense back in its category');
// 9. edit in place from the month page: sheet list → editor → back to the list
await A.click('#catEditBtn');await w(500);await A.click('#shCats [data-c=car]');await w(400);
ok((await A.textContent('#sheetTitle')).includes('רכב'),'chip in the sheet opens the editor');
await A.click('#cEmojis [data-e="✈️"]');await A.click('#saveBtn');await w(700);
ok(await A.isVisible('#shCats'),'after saving it goes back to the categories list');
ok((await A.textContent('#shCats [data-c=car]')).includes('✈️'),'list shows the new emoji');
await A.click('#sheetX');await w(400);ok(await A.isHidden('#sheet'),'X closes the list');
ok(await A.isVisible('#vMonth'),'still on the month page');
// 10. long-press a tile on the month page
const tile=A.locator('#catList .cat-row').first();const bb=await tile.boundingBox();
await A.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await A.mouse.down();await w(700);await A.mouse.up();await w(400);
ok(await A.isVisible('#cEmojis'),'long-press opens that category\'s editor');
ok(!(await A.evaluate(()=>document.querySelector('#catList .cat-row.on'))),'long-press does not also filter');
await A.click('#sheetX');await w(400);ok(await A.isHidden('#sheet'),'closing a long-press editor closes the sheet');
await tile.click();await w(400);ok(await A.locator('#catList .cat-row.on').count()===1,'a normal tap still filters');
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
