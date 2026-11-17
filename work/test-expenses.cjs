const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('./travel-globe/dist/prototype/core.js');
const cities=vm.runInNewContext(fs.readFileSync('work/travel-globe/dist/prototype/destinations.js','utf8')+';destinations');

// Defaults and formatting.
assert.equal(core.cityCurrency(cities.takamatsu),'JPY');assert.equal(core.cityCurrency(cities.paris),'EUR');assert.equal(core.cityCurrency(cities.newyork),'USD');assert.equal(core.cityCurrency(cities.london),'GBP');
assert.equal(core.formatMoney(1200,'JPY'),'¥1,200');assert.equal(core.formatMoney(12.5,'USD'),'$12.50');assert.equal(core.formatMoney(35000,'KRW'),'₩35,000');

// Validation.
const e=(id,day,amount,currency='JPY',category='food',note)=>({id,day,amount,currency,category,...(note!==undefined?{note}:{})});
assert.ok(core.validExpense(e('x1',0,1200),4));assert.ok(core.validExpense(e('x2',3,12.34,'USD','transport','택시'),4));
for(const bad of [e('x',4,100),e('x',-1,100),e('x',0,0),e('x',0,-5),e('x',0,100000001),e('x',0,12.5,'JPY'),e('x',0,1.234,'USD'),e('x',0,100,'CNY'),e('x',0,100,'JPY','tips'),e('x',0,100,'JPY','food','가'.repeat(101)),e('a b',0,100),{...e('x',0,100),amount:'100'}])
 assert.equal(core.validExpense(bad,4),false,JSON.stringify(bad));

// Totals: by currency, category, day, and estimated KRW.
const list=[e('a',0,1200),e('b',0,800,'JPY','transport'),e('c',1,3000,'JPY','food'),e('d',1,10.1,'USD','shopping'),e('f',2,20.2,'USD','shopping'),e('g',2,15000,'KRW','other')];
let t=core.expenseTotals(list,{});
assert.deepEqual(t.byCurrency,{JPY:5000,USD:30.3,KRW:15000});assert.deepEqual(t.byCategory.food,{JPY:4200});assert.deepEqual(t.byCategory.shopping,{USD:30.3});assert.deepEqual(t.byDay[1],{JPY:3000,USD:10.1});
assert.equal(t.krw,null);assert.deepEqual(t.missingRates.sort(),['JPY','USD']);
t=core.expenseTotals(list,{JPY:9.1,USD:1400});assert.equal(t.krw,Math.round(5000*9.1+30.3*1400+15000));assert.deepEqual(t.missingRates,[]);
assert.equal(core.expenseTotals([],{}).krw,0);

// Shortening a trip moves expenses on removed days to the last remaining day.
const trip={id:'t1',name:'경비 시험',city:'takamatsu',date:'2026-11-20',hotel:null,days:Array.from({length:4},()=>({start:'09:00',mode:'walk',scenario:'normal',visits:[]})),unassigned:[],expenses:[e('a',0,100),e('b',3,200)],exchangeRate:{JPY:9.1}};
const shorter=core.updateTripSettings(trip,{name:trip.name,date:trip.date,dayCount:2});assert.deepEqual(shorter.expenses.map(x=>x.day),[0,1]);assert.equal(trip.expenses[1].day,3,'original untouched');

// Backup round-trip and validation; restore gives new ids.
const [read]=core.readBackup(core.createBackup([trip],cities),cities);assert.deepEqual(read.expenses.map(x=>[x.day,x.amount,x.currency]),[[0,100,'JPY'],[3,200,'JPY']]);assert.deepEqual(read.exchangeRate,{JPY:9.1});
const plain=structuredClone(trip);delete plain.expenses;delete plain.exchangeRate;const [none]=core.readBackup(core.createBackup([plain],cities),cities);assert.equal(none.expenses,undefined);
let n=0;const restored=core.appendBackup({trips:[]},[read],()=>'id'+n++).trips[0];assert.ok(restored.expenses.every(x=>/^id\d+$/.test(x.id)));assert.notEqual(restored.expenses[0].id,restored.expenses[1].id);
for(const mutate of [x=>x.expenses=[e('a',4,100)],x=>x.expenses={},x=>x.expenses=[e('a',0,100),e('a',1,100)],x=>x.exchangeRate={KRW:1},x=>x.exchangeRate={JPY:0},x=>x.exchangeRate={JPY:'9'},x=>x.expenses=Array.from({length:2001},(_,i)=>e('z'+i,0,1))]){
 const bad=structuredClone(trip);mutate(bad);assert.throws(()=>core.createBackup([bad],cities),undefined,JSON.stringify(bad.exchangeRate));}

// App: expense tab.
const app=fs.readFileSync('work/travel-globe/dist/prototype/app.js','utf8');
function boot(raw,now){
 let stored=raw,fail=false,blob;const els={},listeners={};
 const $=k=>els[k]||(els[k]={value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},reset(){this.value='';},click(){},remove(){},focus(){},setCustomValidity(){}});
 const RealDate=Date,FixedDate=class extends RealDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return new RealDate(now).getTime();}};
 const ctx={...core,structuredClone,TextEncoder,Blob,Date:now?FixedDate:Date,Intl,console,URLSearchParams,destinations:cities,crypto:require('node:crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:true}),window:{},document:{querySelector:$,getElementById:id=>$('#'+id),addEventListener:(n,fn)=>listeners[n]=fn,createElement:()=>$('a'),body:{append(){}}},URL:{createObjectURL(b){blob=b;return 'blob:t';},revokeObjectURL(){}},localStorage:{getItem:()=>stored,setItem(k,v){if(fail)throw Error('full');stored=v;}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/travel-globe/dist/prototype/day-view.js','utf8'),ctx);vm.runInContext(app,ctx);
 return {$,run:s=>vm.runInContext(s,ctx),trip:()=>JSON.parse(stored).trips[0],setFail:v=>fail=v,blob:()=>blob,click(dataset){listeners.click({target:{closest:()=>({dataset,hasAttribute:()=>false})}});}};
}
const fresh=structuredClone(trip);delete fresh.expenses;delete fresh.exchangeRate;
const ui=boot(JSON.stringify({trips:[fresh]}),'2026-11-21T03:00:00Z');ui.run("openTrip('t1')");ui.click({panel:'expenses'});
let html=ui.$('#panelContent').innerHTML;assert.match(html,/id="expenseForm"/);assert.match(html,/<option value="JPY" selected>/);assert.match(html,/<option value="1" selected>Day 2/,'defaults to local today (11.21 = Day 2)');assert.match(html,/아직 기록한 경비가 없어요/);
const fill=(amount,currency='JPY',category='food',note='',day='1')=>{ui.$('#expenseAmount').value=amount;ui.$('#expenseCurrency').value=currency;ui.$('#expenseCategory').value=category;ui.$('#expenseNote').value=note;ui.$('#expenseDay').value=day;ui.$('#expenseForm').onsubmit({preventDefault(){}});};
fill('abc');assert.match(ui.$('#expenseError').textContent,/금액/);assert.equal(ui.trip().expenses,undefined);
fill('12.5');assert.match(ui.$('#expenseError').textContent,/소수/);
fill('980','JPY','food','우동 <곱빼기>');let saved=ui.trip().expenses;assert.equal(saved.length,1);assert.deepEqual([saved[0].day,saved[0].amount,saved[0].category,saved[0].note],[1,980,'food','우동 <곱빼기>']);
html=ui.$('#panelContent').innerHTML;assert.match(html,/¥980/);assert.match(html,/우동 &lt;곱빼기&gt;/);assert.equal(ui.$('#expenseAmount').value,'','form clears after add');
fill('12.30','USD','shopping','','0');fill('300','JPY','transport','버스','1');
html=ui.$('#panelContent').innerHTML;assert.match(html,/¥1,280/);assert.match(html,/\$12.30/);assert.match(html,/환율을 입력하면/);
// exchange rate
ui.$('#rate-JPY').value='9.1';ui.$('#rate-JPY').onchange();ui.$('#rate-USD').value='1400';ui.$('#rate-USD').onchange();assert.deepEqual(ui.trip().exchangeRate,{JPY:9.1,USD:1400});assert.match(ui.$('#panelContent').innerHTML,/약 ₩28,868/);
ui.$('#rate-JPY').value='';ui.$('#rate-JPY').onchange();assert.deepEqual(ui.trip().exchangeRate,{USD:1400});
// edit
const id=ui.trip().expenses[0].id;ui.click({expenseEdit:id});assert.equal(ui.$('#expenseAmount').value,'980');ui.$('#expenseAmount').value='1080';ui.$('#expenseForm').onsubmit({preventDefault(){}});assert.equal(ui.trip().expenses.find(x=>x.id===id).amount,1080);assert.equal(ui.trip().expenses.length,3);
// delete needs a second click
ui.click({expenseDelete:id});assert.equal(ui.trip().expenses.length,3);assert.match(ui.$('#panelContent').innerHTML,/정말 삭제/);ui.click({expenseDelete:id});assert.equal(ui.trip().expenses.length,2);
// failed save rolls back
ui.setFail(true);fill('500');assert.equal(ui.run('trip.expenses.length'),2);assert.match(ui.$('#expenseError').textContent,/저장하지 못/);assert.equal(ui.$('#expenseAmount').value,'500','input kept on failure');ui.setFail(false);
// text export includes expenses
ui.$('#export').onclick();
(async()=>{const text=await ui.blob().text();assert.match(text,/경비/);assert.match(text,/Day 2 · 11.21/);assert.match(text,/교통 ¥300 버스/);assert.match(text,/합계: ¥300 · \$12.30/);
console.log('PASS: expense currency defaults/format, validation, totals and KRW estimate, trip shortening, backup round-trip/validation/restore ids, expense tab add/edit/delete/rollback, exchange rate, text export');})().catch(err=>{console.error(err);process.exitCode=1;});
