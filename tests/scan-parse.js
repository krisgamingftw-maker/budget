const fs=require('fs');const src=fs.readFileSync('/home/claude/budget/app.js','utf8');
const start=src.indexOf('  function parseScan(text) {');const end=src.indexOf('  function renderScanRows');
const parseScan=new Function(src.slice(start,end)+'; return parseScan;')();
const cases=`סופר 350 08/11/2026
08.11.26 שופרסל 412.90
8 בנובמבר 2026 דירה 4,000
נובמבר 2026
14:29
חשמל 400 ₪ 02/11
קפה 12.50 ₪
דלק 310 | 3.11.2026
רמי לוי 08-11-2026 523.40
תשלום 2 מתוך 3 מקס 180
העברה ל 4 ****1234 250
סה"כ 7,460
גז 120
2026-11-08 ביטוח לאומי 402`;
for(const l of cases.split('\n'))console.log(JSON.stringify(l),'→',JSON.stringify(parseScan(l)));
