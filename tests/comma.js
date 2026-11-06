const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','app');const nm=path.join(__dirname,'node_modules','firebase');
const srv=http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';
if(u==='/config.js'){s.setHeader('content-type','text/javascript');s.end("window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-budget.firebaseapp.com',projectId:'demo-budget',emulator:true};");return}
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(u)]||'application/octet-stream';
fs.readFile(path.join(root,u),(e,d)=>{if(e){s.statusCode=404;s.end();return}s.setHeader('content-type',ct);s.end(d)})}).listen(8769,async()=>{
const b=await chromium.launch();let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
await p.route(/www\.gstatic\.com\/firebasejs\/.*\/(firebase-[a-z-]+\.js)/,r=>{const f=r.request().url().match(/(firebase-[a-z-]+\.js)/)[1];r.fulfill({path:path.join(nm,f),contentType:'text/javascript'})});
await p.goto('http://127.0.0.1:8769/');const w=(t=600)=>p.waitForTimeout(t);
await p.waitForSelector('#auth:not([hidden])');await p.click('#aSwitch');await p.fill('#aEmail','c@test.com');await p.fill('#aPass','secret123');await p.click('#aBtn');
await p.waitForSelector('#setup:not([hidden])',{timeout:10000});await p.fill('#sName','x');await p.click('#sCreate');await p.waitForSelector('#shell:not([hidden])',{timeout:10000});await w();
await p.click('#fab');await w(350);await p.click('#fAmount');
for (const [k,exp] of [['4','4'],['0','40'],['0','400'],['0','4,000'],['0','40,000'],['0','400,000']]){await p.keyboard.type(k);ok(await p.inputValue('#fAmount')===exp,'typed → '+await p.inputValue('#fAmount'));}
for(let i=0;i<2;i++)await p.keyboard.press('Backspace');ok(await p.inputValue('#fAmount')==='4,000','backspace → '+await p.inputValue('#fAmount'));
await p.keyboard.type('.5');ok(await p.inputValue('#fAmount')==='4,000.5','decimal → '+await p.inputValue('#fAmount'));
// caret in middle: put caret after "4" and insert 1
await p.fill('#fAmount','');await p.keyboard.type('4000');await p.evaluate(()=>{const i=document.getElementById('fAmount');i.setSelectionRange(1,1)});await p.keyboard.type('1');
ok(await p.inputValue('#fAmount')==='41,000','mid insert → '+await p.inputValue('#fAmount'));await p.keyboard.type('2');ok(await p.inputValue('#fAmount')==='412,000','caret kept → '+await p.inputValue('#fAmount'));
await p.fill('#fName','דירה');await p.click('#saveBtn');await w();
ok((await p.textContent('#openList')).includes('412,000'),'saved amount shown');
await p.click('#openList .row-body');await w(400);ok(await p.inputValue('#fAmount')==='412,000','edit prefill formatted');
console.log(fail?fail+' FAILED':'ALL PASSED');await b.close();srv.close();process.exit(fail?1:0)});
