const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const core=require('./travel-globe/dist/prototype/core.js'),app=fs.readFileSync('work/travel-globe/dist/prototype/app.js','utf8');
const cities=vm.runInNewContext(fs.readFileSync('work/travel-globe/dist/prototype/destinations.js','utf8')+';destinations');
const trip={id:'t',name:'메모 시험',city:'fukuoka',date:'',hotel:null,days:[{start:'09:00',mode:'walk',scenario:'normal',visits:[{uid:'a',place:'ohori',duration:60,fixed:'',note:'예약 <확인>\n준비물 & 우산'},{uid:'b',place:'ohori',duration:60,fixed:'',note:'두 번째 방문'}]},{start:'09:00',mode:'walk',scenario:'normal',visits:[]}]};
const parsed=core.readBackup(core.createBackup([trip],cities),cities)[0];assert.equal(parsed.days[0].visits[0].note,trip.days[0].visits[0].note);assert.equal(parsed.days[0].visits[1].note,'두 번째 방문');
const old=structuredClone(trip);delete old.days[0].visits[0].note;assert.doesNotThrow(()=>core.readBackup(core.createBackup([old],cities),cities));
for(const note of ['x'.repeat(1001),{bad:true}]){const bad=structuredClone(trip);bad.days[0].visits[0].note=note;assert.throws(()=>core.createBackup([bad],cities));}
const moved=structuredClone(trip);moved.days.reverse();const held=core.updateTripSettings(moved,{name:moved.name,date:'',dayCount:1,overflow:'hold'});assert.equal(held.unassigned[0].note,trip.days[0].visits[0].note);assert.equal(core.readBackup(core.createBackup([held],cities),cities)[0].unassigned[0].note,trip.days[0].visits[0].note);
const handler=app.slice(app.indexOf("$('#editForm').onsubmit="),app.indexOf("\n$('#hotelForm')"));
for(const saved of [true,false]){
 const t=structuredClone(trip),els={'#editId':{value:'a'},'#editDay':{value:'1'},'#editDuration':{value:'60'},'#editFixed':{value:''},'#editNote':{value:'새 메모\n둘째 줄'},'#editError':{},'#editForm':{},'#edit':{close(){}}};let storage='';
 const ctx={trip:t,dayIndex:0,day:()=>t.days[0],$:k=>els[k],structuredClone,minutes:core.minutes,persist:()=>{if(saved)storage=JSON.stringify(t);return saved;},render(){},refocus(){},toast(){}};vm.createContext(ctx);vm.runInContext(handler,ctx);els['#editForm'].onsubmit({preventDefault(){}});
 if(saved){assert.equal(JSON.parse(storage).days[1].visits[0].note,'새 메모\n둘째 줄');assert.equal(t.days[0].visits[0].note,'두 번째 방문');els['#editId'].value='b';els['#editDay'].value='0';els['#editNote'].value='';els['#editForm'].onsubmit({preventDefault(){}});assert.equal(t.days[0].visits[0].note,'');}
 else{assert.deepEqual(t,trip);assert.match(els['#editError'].textContent,/저장하지 못/);assert.equal(els['#editNote'].value,'새 메모\n둘째 줄');}
}
const escaped=vm.runInNewContext(app.slice(app.indexOf('const esc='),app.indexOf('\nlet db='))+'\n'+app.slice(app.indexOf('function visitNote'),app.indexOf('function hotelCard'))+';visitNote({note:"<script> & test"})');assert.ok(escaped.includes('&lt;script&gt; &amp; test'));
console.log('PASS: notes roundtrip, legacy backups, held visits, repeated places, move/save/reload, clear, failed save rollback and HTML escaping');
