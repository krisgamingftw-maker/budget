const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');const NM=path.join(__dirname,'node_modules');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8780,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
// a receipt photo: narrow thermal-printer look, off-white paper, monospaced digits
const mk=async(file,html)=>{const c=await b.newContext({viewport:{width:360,height:820},deviceScaleFactor:3});const p=await c.newPage();
await p.setContent(`<html dir=rtl><body style="margin:0;background:#d8d4cc;padding:14px"><div style="background:#f6f3ec;color:#222;font-family:'Courier New',Arial;font-size:17px;padding:16px 14px;line-height:1.5">${html}</div></body></html>`);
await p.screenshot({path:file});await c.close();};
const row=(a,b)=>`<div style="display:flex;justify-content:space-between"><span>${a}</span><span>${b}</span></div>`;
await mk('../receipt.png',`<div style="text-align:center;font-size:24px;font-weight:bold">שופרסל דיל</div><div style="text-align:center">שופרסל בע"מ ח.פ 520022732</div><div style="text-align:center">חשבונית מס / קבלה</div><div>15/11/2026 17:22 קופה 4</div><hr>`+
 row('חלב תנובה','6.90')+row('לחם אחיד','7.40')+row('עגבניות','12.34')+row('במבה','19.60')+row('גבינה צהובה','32.90')+'<hr>'+
 row('סה"כ לפני מע"מ','67.29')+row('מע"מ 18%','12.11')+row('סה"כ פריטים','5')+`<div style="font-size:21px;font-weight:bold">${row('סה"כ לתשלום','79.14')}</div>`+row('ויזה ****1234','79.14')+'<div style="text-align:center">תודה שקניתם בשופרסל</div>');
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
await c.route(/cdn\.jsdelivr\.net\/npm\/(.+)$/,r=>{let m=r.request().url().match(/cdn\.jsdelivr\.net\/npm\/(@[^/]+\/[^/@]+|[^/@]+)(?:@[^/]+)?\/?(.*)$/);let f=path.join(NM,m[1],m[2]||'');
 if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.js');
 if(!fs.existsSync(f)){console.log('MISSING',r.request().url());return r.fulfill({status:404,body:''});}
 r.fulfill({path:f,contentType:f.endsWith('.wasm')?'application/wasm':f.endsWith('.js')?'text/javascript':'application/octet-stream'})});
const A=await c.newPage();A.on('pageerror',e=>console.log('PAGEERR',e.message));A.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await A.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await A.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.goto('http://127.0.0.1:8780/');const w=(t=600)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','r@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
await A.click('#fab');await w(400);await A.setInputFiles('#scanFile','../receipt.png');
await A.waitForFunction(()=>document.getElementById('scanStatus').hidden,null,{timeout:120000});
let rows=await A.$$eval('#scanList li',ls=>ls.map(l=>[l.querySelector('input').checked,l.querySelector('.nm').value,l.querySelector('.amt').value]));
console.log('receipt',JSON.stringify(rows),await A.textContent('#scanNote'));
ok(rows.length===1,'receipt gives a single expense');ok(rows[0]&&rows[0][2]==='79.14','final total 79.14');ok(rows[0]&&rows[0][1]==='שופרסל','store name');
ok(await A.isVisible('#scanRecRow')===false,'no recurring switch for a receipt');
await A.screenshot({path:'../receipt-result.png'});
ok(await A.isVisible('#scanAll'),'show-all-lines button');await A.click('#scanAll');await w(300);
rows=await A.$$eval('#scanList li',ls=>ls.map(l=>[l.querySelector('input').checked,l.querySelector('.nm').value,l.querySelector('.amt').value]));
ok(rows.length>3&&rows.every(r=>!r[0]),'all lines shown, none ticked ('+rows.length+')');
// back to one row and save it
await A.click('#cancelBtn');await w(400);
await A.click('#fab');await w(400);await A.$eval('#scanFile',e=>{e.value=''});await A.setInputFiles('#scanFile','../receipt.png');
await A.waitForFunction(()=>document.getElementById('scanStatus').hidden&&document.querySelectorAll('#scanList li').length===1,null,{timeout:120000});
await A.click('#saveBtn');await w(1000);
const t=await A.textContent('#openList');console.log('LIST',t);ok(t.includes('שופרסל')&&t.includes('79.14'),'receipt saved as one expense');
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
