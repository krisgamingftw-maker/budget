// Unit check of the receipt and list parsers on typical OCR text: node tests/receipt-parse.js
const fs=require('fs'),path=require('path');const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=src.indexOf('  // Shared clean-up for one line');const end=src.indexOf('  function renderScanRows');
const {parseScan,parseReceipt}=new Function(src.slice(start,end)+'; return {parseScan,parseReceipt};')();
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const cases=[
['supermarket', `שופרסל דיל
שופרסל בע"מ ח.פ 520022732
רח' הרצל 12 ראשון לציון טל 03-9876543
חשבונית מס / קבלה מקור
מס' 123456 15/11/2026 17:22
חלב תנובה 3% 1 6.90
לחם אחיד 7.40
עגבניות 1.235 ק"ג 12.34
במבה 4 יח' 19.60
סה"כ לפני מע"מ 39.41
מע"מ 18% 7.09
סה"כ פריטים: 7
סה"כ לתשלום 46.50
ויזה ****1234 46.50
תודה שקניתם בשופרסל`, 'שופרסל', 46.5],
['cash with change', `קפה גרג
עוסק מורשה 512345678
קבלה 7788
אמריקנו 14.00
קרואסון 12.00
סה"כ 26.00
מזומן 50.00
עודף 24.00`, 'קפה גרג', 26],
['amount on next line', `מאפיית הכיכר
קבלה
לחמניות 8.50
עוגה 42.00
סה"כ לתשלום
50.50
אשראי 50.50`, 'מאפיית הכיכר', 50.5],
['comma decimals, discount', `סופר פארם
חשבונית מס קבלה
שמפו 29,90
משחת שיניים 15,90
הנחת מועדון -5,00
סה"כ חסכת 5,00
סה"כ 40,80
ישראכרט 40,80`, 'סופר פארם', 40.8],
['ocr noise on labels', `רמי לוי שיווק השקמה
ח"פ 513770669
קופה 12 קופאי 33
מלפפונים 9.90
אורז 11.90
שמן 17.90
סה''כ 39.70
תודה ולהתראות`, 'רמי לוי', 39.7],
['no total label', `פיצה האט
חשבונית מס
פיצה משפחתית 69.00
שתיה 12.00
81.00
מע"מ 12.36`, 'פיצה האט', 81],
['fuel', `פז
תחנת דלק גלילות
חשבונית מס קבלה
95 אוקטן 40.12 ליטר
סה"כ כולל מע"מ 286.45
מאסטרקארד 286.45`, 'פז', 286.45],
];
for(const [nm,txt,name,amt] of cases){const r=parseReceipt(txt);console.log(nm,JSON.stringify(r));ok(r&&r.amount===amt,nm+' amount '+amt);ok(r&&r.name===name,nm+' name '+name);}
// lists of expenses must NOT be treated as receipts
const list=`הוצאות נובמבר
דירה 4,000
סופר 2500 ₪
חשמל - 400
אוכל כלבים 310
בתי קפה 250
סה"כ 7,460`;
ok(parseReceipt(list)===null,'expense list is not a receipt');ok(parseScan(list).length===6,'list still gives 6 rows');
const notes=`תשלומים חודש נובמבר
שכירות 4500
ביטוח רכב 350 - תשלום 3 מתוך 12
ויזה כאל 2300
מקס 1200
גן 2800
חוג 250`;
ok(parseReceipt(notes)===null,'list with card names is not a receipt');
console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
