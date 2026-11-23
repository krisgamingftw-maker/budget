// Unit check of how a bank/card screenshot is put back together from its pieces: node tests/scan-layout.js
// The pieces below are the boxes the reader found on a real Cal (Visa) screenshot, with the texts made up.
const fs=require('fs'),path=require('path');const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=src.indexOf('  // Shared clean-up for one line');const end=src.indexOf('  function renderScanRows');
const {groupLayout,classifyPiece,amountFromDigits,tidyName,parseScan}=new Function(src.slice(start,end)+'; return {groupLayout,classifyPiece,amountFromDigits,tidyName,parseScan};')();
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
// what each piece is
const k=t=>classifyPiece(t).kind;
ok(k('15/11/2026')==='date','a date alone');
ok(k('₪ 4 3 .00')==='amount'&&k('w28.00')==='amount'&&k('₪0')==='amount','an amount alone (₪ often read as w)');
ok(k('Apple Pay')==='junk'&&k('G Pay')==='junk','a wallet badge is not a name');
ok(k('349-267693')==='junk','an account number is not an amount');
ok(k('נתח קצבים אשקל')==='text','a shop name');
ok(k('דירה 4,000')==='row','name and amount on one line');
// digits read glyph by glyph
ok(amountFromDigits('308.45')===308.45&&amountFromDigits('1.204.66')===1204.66&&amountFromDigits('1.850')===1850&&amountFromDigits('45.00')===45&&amountFromDigits('')===null,'amounts from digits');
ok(tidyName('Apple Pay מאפיית החיטה')==='מאפיית החיטה'&&tidyName('יוניברס אשקלון G Pay')==='יוניברס אשקלון','badges dropped from names');
ok(parseScan('w Apple Pay מאפיית החיטה 10')[0].name.indexOf('Apple')<0,'badges dropped by the line reader too');
// the page: header (card name with its last 4 digits, next charge, "as of" date), then cards of date + shop + amount
const B=(y0,y1,x0,x1,kind,text,extra)=>Object.assign({y0,y1,x0,x1,kind,text,hasDate:/\d\/\d/.test(text)||/\d{4}-\d\d-\d\d/.test(text)},extra||{});
const items=[
 B(288,326,622,979,'text','כרטיסי אשראי'),
 B(571,618,1078,1555,'row','ויזה כ.א.ל זהב 1234',{name:'ויזה כ א ל זהב',amount:1234}),
 B(676,710,1235,1556,'text','סה"כ חיוב הבא:'),
 B(770,813,1349,1558,'amount','2,345.67',{amount:2345.67}),
 B(768,810,240,689,'text','נכון לתאריך 2026-11-20'),
 B(880,922,1244,1480,'date','15/11/2026'), B(978,1008,1164,1480,'text','מאפייה'), B(916,985,107,334,'amount','',{amount:12}),
 B(1135,1177,1244,1480,'date','15/11/2026'), B(1221,1263,1120,1479,'row','העברה ב BIT 12',{name:'העברה ב BIT',amount:12}), B(1171,1240,107,334,'amount','',{amount:45}),
 B(1389,1432,1244,1480,'date','15/11/2026'), B(1477,1528,1088,1480,'text','קצביה'), B(1425,1495,106,387,'amount','',{amount:100.93}),
 B(1899,1941,1248,1480,'date','17/11/2026'), B(1987,2038,1161,1480,'text','סופרמרקט'), B(1934,2004,107,334,'amount','',{amount:30.66}),
];
const rows=groupLayout(items);
console.log(JSON.stringify(rows));
ok(rows.list===true,'seen as a bank list (so never taken for one receipt)');
ok(JSON.stringify(rows.map(r=>[r.name,r.amount,r.on]))===JSON.stringify([['מאפייה',12,true],['העברה ב BIT',45,true],['קצביה',100.93,true],['סופרמרקט',30.66,true]]),'every card: its own name with the amount on the same card, header skipped');
// a plain list (Notes) keeps its old behaviour: no dates, the total is shown unticked
const notes=groupLayout([B(10,40,0,300,'text','הוצאות נובמבר'),B(60,90,0,300,'row','דירה 4,000',{name:'דירה',amount:4000}),B(110,140,0,300,'row','סה"כ 4,000',{name:'סה"כ',amount:4000})]);
ok(JSON.stringify(notes.map(r=>[r.name,r.amount,r.on]))===JSON.stringify([['דירה',4000,true],['סה"כ',4000,false]]),'plain list: heading ignored, total unticked');
console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
