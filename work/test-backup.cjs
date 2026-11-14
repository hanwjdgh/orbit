const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('./travel-globe/dist/prototype/core.js');
const cities=vm.runInNewContext(fs.readFileSync('work/travel-globe/dist/prototype/destinations.js','utf8')+';destinations');
const visit={uid:'old-visit',place:'ohori',duration:75,fixed:'13:30'};
const original={id:'old-trip',name:'백업 확인용 여행',city:'fukuoka',date:'2026-11-12',days:[{start:'08:30',mode:'walk',scenario:'failure',visits:[visit]}],hotel:{name:'숙소 메모',address:'주소 확인'},unassigned:[{...visit,uid:'held',originalDay:4}],deletedAt:'2026-10-14T00:00:00.000Z'};
const text=core.createBackup([original],cities),parsed=core.readBackup(text,cities);
assert.equal(parsed[0].hotel.address,original.hotel.address);assert.deepEqual(parsed[0].unassigned[0],{place:'ohori',duration:75,fixed:'13:30',originalDay:4});assert.equal(parsed[0].deletedAt,original.deletedAt);
let i=0;const before={trips:[original],active:'old-trip',three:true},after=core.appendBackup(before,parsed,()=>`new-${i++}`);
assert.equal(before.trips.length,1);assert.equal(after.trips.length,2);assert.notEqual(after.trips[1].id,original.id);assert.notEqual(after.trips[1].days[0].visits[0].uid,after.trips[1].unassigned[0].uid);assert.equal(after.active,before.active);
const twice=core.appendBackup(after,parsed,()=>`new-${i++}`);assert.equal(twice.trips.length,3);assert.equal(new Set(twice.trips.map(t=>t.id)).size,3);
assert.deepEqual(core.readBackup(core.createBackup(after.trips,cities),cities)[1],parsed[0]);
for(const modify of [d=>d.version=2,d=>d.trips[0].city='unknown',d=>d.trips[0].days[0].visits[0].place='missing',d=>d.trips[0].date='2026-02-30',d=>d.trips[0].days[0].start='25:00',d=>d.trips[0].unassigned[0].duration=-1,d=>d.trips[0].hotel.name={},d=>d.trips[0].days[0].visits[0].fixed='24:60']){const data=JSON.parse(text);modify(data);assert.throws(()=>core.readBackup(JSON.stringify(data),cities));}
assert.throws(()=>core.readBackup('{broken',cities));assert.throws(()=>core.readBackup('x'.repeat(core.BACKUP_MAX_BYTES+1),cities));
// Exercise the actual UI restore handler, including storage failure, without touching browser data.
const app=fs.readFileSync('work/travel-globe/dist/prototype/app.js','utf8'),handler=app.slice(app.indexOf("$('#backupRestore').onclick=()=>{"));
for(const saved of [false,true]){
 const elements={},context={...core,structuredClone,crypto:require('node:crypto').webcrypto,db:structuredClone(before),pendingBackup:parsed,persist:()=>saved,welcome:()=>{},toast:()=>{},$:key=>elements[key]||(elements[key]={close(){}})};
 vm.createContext(context);vm.runInContext(handler,context);elements['#backupRestore'].onclick();assert.equal(context.db.trips.length,saved?2:1);if(!saved)assert.match(elements['#backupMessage'].textContent,/기존 여행은 유지/);
}
fs.writeFileSync('work/backup-test.json',text);fs.writeFileSync('work/backup-invalid.json','{"format":"wrong"}');
console.log('PASS: roundtrip, preserved fields, additive IDs, repeat import, malformed/unsupported input, size limit, save rollback and successful restore');
