const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');const NM=path.join(__dirname,'node_modules');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8780,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
// make test images
const mkimg=async(dark,file)=>{const c=await b.newContext({viewport:{width:390,height:600},deviceScaleFactor:3,colorScheme:dark?'dark':'light'});const p=await c.newPage();
await p.setContent(`<html dir=rtl><body style="font-family:Arial;font-size:19px;padding:20px;background:${dark?'#1c1c1e':'#fff'};color:${dark?'#fff':'#000'}"><h3>הוצאות נובמבר</h3><div>דירה 4,000</div><div>סופר 2500 ₪</div><div>חשמל - 400</div><div>אוכל כלבים 310</div><div>בתי קפה 250</div><div>סה"כ 7,460</div></body></html>`);
await p.screenshot({path:file});await c.close();};
await mkimg(false,'../scan-light.png');await mkimg(true,'../scan-dark.png');
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
await c.route(/cdn\.jsdelivr\.net\/npm\/(.+)$/,r=>{let m=r.request().url().match(/cdn\.jsdelivr\.net\/npm\/(@[^/]+\/[^/@]+|[^/@]+)(?:@[^/]+)?\/?(.*)$/);let f=path.join(NM,m[1],m[2]||'');
 if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.js');
 if(!fs.existsSync(f)){console.log('MISSING',r.request().url());return r.fulfill({status:404,body:''});}
 r.fulfill({path:f,contentType:f.endsWith('.wasm')?'application/wasm':f.endsWith('.js')?'text/javascript':'application/octet-stream'})});
const A=await c.newPage();A.on('pageerror',e=>console.log('PAGEERR',e.message));A.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await A.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await A.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await A.goto('http://127.0.0.1:8780/');const w=(t=600)=>A.waitForTimeout(t);
await A.waitForSelector('#auth:not([hidden])');await A.click('#aSwitch');await A.fill('#aEmail','s@test.com');await A.fill('#aPass','secret123');await A.click('#aBtn');
await A.waitForSelector('#setup:not([hidden])',{timeout:10000});await A.fill('#sName','x');await A.click('#sCreate');await A.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
for (const img of ['../scan-light.png','../scan-dark.png']){
 await A.click('#fab');await w(400);ok(await A.isVisible('#scanBtn'),'scan button in add sheet');
 await A.setInputFiles('#scanFile',img);
 await A.waitForFunction(()=>document.getElementById('scanStatus').hidden,null,{timeout:90000});
 const rows=await A.$$eval('#scanList li',ls=>ls.map(l=>[l.querySelector('input').checked,l.querySelector('.nm').value,l.querySelector('.amt').value]));
 console.log(img,JSON.stringify(rows),await A.textContent('#scanNote'));
 const got=Object.fromEntries(rows.map(r=>[r[1],r[2]]));
 ok(got['דירה']==='4,000'&&got['סופר']==='2,500'&&got['חשמל']==='400','core rows parsed '+img);
 ok(rows.some(r=>!r[0]&&/סה/.test(r[1])),'total unchecked');
 await A.screenshot({path:img.replace('.png','-result.png')});
 if(img.includes('light')){await A.check('#scanRec',{force:true});await A.click('#saveBtn');await w(1000);
  const n=await A.locator('#openList .row').count();ok(n===rows.filter(r=>r[0]).length,'added '+n+' rows');
  ok((await A.textContent('#openList')).includes('קבוע'),'recurring flag applied');}
 else {await A.click('#cancelBtn');await w(400);}
}
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
