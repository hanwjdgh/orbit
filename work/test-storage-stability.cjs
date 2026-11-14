const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const core=require('./travel-globe/dist/prototype/core.js'),app=fs.readFileSync('work/travel-globe/dist/prototype/app.js','utf8');
const cities=vm.runInNewContext(fs.readFileSync('work/travel-globe/dist/prototype/destinations.js','utf8')+';destinations');
const visit=(uid,place='ohori')=>({uid,place,duration:60,fixed:'',note:'보존할 메모'}),day=visits=>({start:'09:00',mode:'walk',scenario:'normal',visits});
const initial={id:'existing',name:'기존 여행',city:'fukuoka',date:'2026-10-17',hotel:{name:'기존 숙소',address:'주소'},days:[day([visit('a'),visit('b')]),day([visit('c')])],unassigned:[{...visit('held'),originalDay:3}]};
function boot(raw,readFails=false){
 let stored=raw,fail=false,writes=0,blob,confirmAnswer=false,reloads=0;const els={},listeners={},winListeners={};
 const $=key=>els[key]||(els[key]={value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},reset(){},click(){},remove(){},setCustomValidity(){}});
 const ctx={...core,structuredClone,TextEncoder,Blob,performance,Date,Intl,console,destinations:cities,crypto:require('node:crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:true}),window:{addEventListener:(name,fn)=>winListeners[name]=fn},confirm:()=>confirmAnswer,location:{reload(){reloads++;}},document:{querySelector:$,getElementById:id=>$('#'+id),addEventListener:(name,fn)=>listeners[name]=fn,createElement:()=>$('a'),body:{append(){}}},URL:{createObjectURL(b){blob=b;return 'blob:test';},revokeObjectURL(){}},localStorage:{getItem(){if(readFails)throw Error('blocked');return stored;},setItem(k,v){writes++;if(fail)throw Error('QuotaExceededError');stored=v;},removeItem(){writes++;stored=null;}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/travel-globe/dist/prototype/day-view.js','utf8'),ctx);vm.runInContext(app,ctx);
 return {$,run:s=>vm.runInContext(s,ctx),setFail:v=>fail=v,stored:()=>stored,external:v=>stored=v,writes:()=>writes,blob:()=>blob,confirm:v=>confirmAnswer=v,reloaded:()=>reloads,storageEvent:key=>winListeners.storage({key,newValue:stored}),click(dataset){listeners.click({target:{closest:()=>({dataset,hasAttribute:()=>false})}});}};
}
const raw=JSON.stringify({trips:[initial],active:'existing',three:false});
const b=boot(raw);b.run("openTrip('existing')");assert.equal(b.writes(),0,'opening must not rewrite all trips');b.setFail(true);
const unchanged=()=>{assert.deepEqual(JSON.parse(b.run('JSON.stringify(trip)')),initial);assert.equal(b.stored(),raw);};
b.run("addPlace('ohori')");unchanged();b.run("reorderVisit('a',1)");unchanged();b.run("deleteVisit('a')");unchanged();
b.$('#hotelName').value='변경할 숙소';b.$('#hotelAddress').value='새 주소';b.$('#hotelForm').onsubmit({preventDefault(){}});unchanged();assert.match(b.$('#hotelError').textContent,/저장하지 못/);assert.equal(b.$('#hotelName').value,'변경할 숙소');
b.run("saveDayField('start','11:00')");unchanged();b.run("saveDayField('mode','transit')");unchanged();b.run("saveDayField('scenario','failure')");unchanged();
b.$('#assign-held').value='1';b.run("assignVisit('held')");unchanged();
b.$('#settingsName').value='짧아진 여행';b.$('#settingsDate').value='2026-10-17';b.$('#settingsEndDate').value='2026-10-17';b.$('#settingsOverflow').value='hold';b.$('#settingsForm').onsubmit({preventDefault(){}});unchanged();assert.match(b.$('#settingsError').textContent,/기존 기간/);
b.$('#dimension').onclick();assert.equal(b.run('db.three'),false);
b.$('#tripName').value='새 여행';b.$('#tripCity').value='fukuoka';b.$('#tripDate').value='';b.$('#tripEndDate').value='';b.$('#createForm').onsubmit({preventDefault(){}});assert.equal(b.run('db.trips.length'),1);assert.match(b.$('#createError').textContent,/저장하지 못/);
b.setFail(false);b.run("deleteVisit('a')");assert.equal(b.run('day().visits.length'),1);const deleted=b.stored();b.setFail(true);b.$('#undo').onclick();assert.equal(b.stored(),deleted);assert.equal(b.run('day().visits.length'),1);assert.equal(b.run('undoState.visit.uid'),'a');b.setFail(false);b.$('#undo').onclick();assert.equal(b.run('day().visits.length'),2);assert.equal(b.$('#storageNotice').hidden,true);
const reopened=boot(b.stored());reopened.run("openTrip('existing')");assert.equal(reopened.run('day().visits[0].note'),'보존할 메모');
// A second tab's committed edit must survive stale saves.
const concurrent=boot(raw);concurrent.run("openTrip('existing')");const latest=JSON.parse(raw);latest.trips[0].name='다른 탭에서 수정';concurrent.external(JSON.stringify(latest));concurrent.run("deleteVisit('a')");assert.equal(JSON.parse(concurrent.stored()).trips[0].name,'다른 탭에서 수정');assert.equal(concurrent.run('day().visits.length'),2);assert.match(concurrent.$('#storageMessage').textContent,/다른 탭/);
// Invalid data is never silently filtered and overwritten.
for(const damaged of ['{broken',JSON.stringify({trips:[initial,{name:'손상된 여행'}]}),JSON.stringify({trips:[initial,initial]})]){const invalid=boot(damaged);assert.equal(invalid.run('storageLocked'),true);assert.equal(invalid.run('persist()'),false);assert.equal(invalid.writes(),0);assert.equal(invalid.stored(),damaged);invalid.$('#recoverStorage').onclick();assert.ok(invalid.blob());}
const unreadable=boot(raw,true);assert.equal(unreadable.run('storageLocked'),true);assert.equal(unreadable.run('persist()'),false);assert.equal(unreadable.writes(),0);
// IDs rendered into HTML attributes must be plain tokens.
for(const mutate of [t=>t.days[0].visits[0].uid='a" onclick="x',t=>t.unassigned[0].uid='<b>',t=>t.id='x" y']){const t=structuredClone(initial);mutate(t);assert.equal(boot(JSON.stringify({trips:[t]})).run('storageLocked'),true);}
// Damaged data: reset offered only after raw download, and only on confirm.
{const d=boot('{broken');assert.equal(d.$('#resetStorage').hidden,true);d.$('#recoverStorage').onclick();assert.equal(d.$('#resetStorage').hidden,false);d.$('#resetStorage').onclick();assert.equal(d.stored(),'{broken');d.external('{"trips":[]}');d.confirm(true);d.$('#resetStorage').onclick();assert.equal(d.stored(),'{"trips":[]}','must not delete data another tab rewrote');d.external('{broken');d.$('#resetStorage').onclick();assert.equal(d.stored(),null);assert.equal(d.reloaded(),1);}
// Raw recovery download is for damaged data only, not quota failures.
{const q=boot(raw);q.run("openTrip('existing')");q.setFail(true);q.run("addPlace('ohori')");assert.equal(q.$('#storageNotice').hidden,false);assert.equal(q.$('#recoverStorage').hidden,true);}
// Another tab's save warns immediately, before the next edit.
{const w=boot(raw);w.run("openTrip('existing')");w.external('{"trips":[]}');w.storageEvent('orbit-interactive-prototype-v1');assert.equal(w.$('#storageNotice').hidden,false);assert.match(w.$('#storageMessage').textContent,/다른 탭/);}
// Stress fixture: 100 trips / 10,000 visits; include 1,000 custom places in one trip.
const many=Array.from({length:100},(_,i)=>({...structuredClone(initial),id:'trip-'+i,name:'여행 '+i,days:[day(Array.from({length:100},(_,j)=>visit('v-'+j)))],unassigned:[]}));
many[0].customPlaces=Array.from({length:1000},(_,i)=>({id:'custom-'+i,name:'직접 추가 '+i,address:'위치 메모'}));
many[0].days[0].visits=Array.from({length:100},(_,i)=>visit('custom-v-'+i,'custom-'+i));
const t0=performance.now(),large=boot(JSON.stringify({trips:many})),loaded=performance.now();large.run("openTrip('trip-0');view='today';render()");const rendered=performance.now();large.run("reorderVisit('custom-v-0',1)");const edited=performance.now();
assert.equal(large.run('db.trips.length'),100);assert.equal(large.run('day().visits.length'),100);assert.equal(large.run('day().visits[1].uid'),'custom-v-0');
const backup=core.createBackup(JSON.parse(large.stored()).trips,cities),restored=core.readBackup(backup,cities);assert.equal(restored.length,100);assert.equal(restored.flatMap(t=>t.days.flatMap(d=>d.visits)).length,10000);
const results={trips:100,visits:10000,customPlaces:1000,loadMs:Math.round(loaded-t0),renderStringMs:Math.round(rendered-loaded),editAndSaveMs:Math.round(edited-rendered),backupBytes:Buffer.byteLength(backup),note:'Node mock-DOM timings, not real mobile rendering benchmarks'};
fs.writeFileSync('work/storage-stress-results.json',JSON.stringify(results,null,2));console.log('PASS: failed saves rollback all edited operations, undo retry, no write on open, stale-tab protection, damaged/read-blocked data preserved, large dataset backup/reload');console.log(results);
