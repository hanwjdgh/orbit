const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('./travel-globe/dist/prototype/core.js');
const cities=vm.runInNewContext(fs.readFileSync('work/travel-globe/dist/prototype/destinations.js','utf8')+';destinations');
const day=uid=>({start:'09:00',mode:'walk',scenario:'normal',visits:[{uid,place:'ritsurin',duration:60,fixed:''}]});
const trip={id:'t1',name:'다카마쓰 </script> 여행',city:'takamatsu',date:'2026-11-20',hotel:null,days:[day('v1'),day('v2')],unassigned:[],expenses:[{id:'e1',day:0,amount:980,currency:'JPY',category:'food'}]};
const seedDb={trips:[trip],active:null,three:false};

// phoneHtml inlines sources and embeds the itinerary safely.
const index='<html><head><link rel="stylesheet" href="style.css"></head><body><script src="destinations.js"></script><script src="core.js"></script><script src="day-view.js"></script><script src="app.js"></script></body></html>';
const html=core.phoneHtml({index,style:'body{}',scripts:{'destinations.js':'var d=1;','core.js':'var c="</script>";','day-view.js':'var v;','app.js':'var a;'}},seedDb,'2026-11-18T10:00:00.000Z');
assert.ok(!html.includes('src="app.js"')&&html.includes('<style>body{}</style>'));assert.ok(html.includes('var c="<\\/script>";'));
const seedMatch=/<script id="orbitSeed" type="application\/json">([\s\S]*?)<\/script>/.exec(html);assert.ok(seedMatch,'seed block present');assert.ok(html.indexOf('orbitSeed')<html.indexOf('var d=1;'),'seed before app scripts');
assert.ok(!seedMatch[1].includes('</script'));const seed=JSON.parse(seedMatch[1]);assert.equal(seed.stamp,'2026-11-18T10:00:00.000Z');assert.equal(seed.db.trips[0].name,trip.name);

// App startup with an embedded seed.
const app=fs.readFileSync('work/travel-globe/dist/prototype/app.js','utf8');
function boot({raw=null,blocked=false,seedText,now,pristine}){
 let stored=raw,writes=0,blob;const els={},listeners={},win={};
 const $=k=>els[k]||(els[k]={value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},reset(){},click(){},remove(){},focus(){},setCustomValidity(){}});
 if(seedText!==undefined)$('#orbitSeed').textContent=seedText;
 const RealDate=Date,FixedDate=class extends RealDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return new RealDate(now).getTime();}};
 const ctx={...core,structuredClone,TextEncoder,Blob,Date:now?FixedDate:Date,Intl,console,URLSearchParams,destinations:cities,crypto:require('node:crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:true}),window:{addEventListener:(n,fn)=>win[n]=fn},location:{reload(){}},
  document:{...(pristine?{documentElement:{outerHTML:pristine}}:{}),querySelector:$,getElementById:id=>id==='orbitSeed'&&seedText===undefined?null:$('#'+id),addEventListener:(n,fn)=>listeners[n]=fn,createElement:()=>$('a'),body:{append(){}}},URL:{createObjectURL(b){blob=b;return 'blob:t';},revokeObjectURL(){}},
  localStorage:{getItem(){if(blocked)throw Error('blocked');return stored;},setItem(k,v){if(blocked)throw Error('blocked');writes++;stored=v;}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/travel-globe/dist/prototype/day-view.js','utf8'),ctx);vm.runInContext(app,ctx);
 return {$,run:s=>vm.runInContext(s,ctx),stored:()=>stored&&JSON.parse(stored),writes:()=>writes,blob:()=>blob,win};
}
const seedText=seedMatch[1];
// 1) Storage blocked: run in memory from the seed, edits work but are not saved.
let b=boot({blocked:true,seedText});assert.equal(b.run('db.trips.length'),1);assert.equal(b.run('storageLocked'),false);assert.match(b.$('#storageMessage').textContent,/닫으면 사라/);
b.run("openTrip('t1');addPlace('tamamo')");assert.equal(b.run('trip.days[0].visits.length'),2);assert.match(b.$('#saveStatus').textContent,/이 화면에서만/);
// 2) Empty storage: seed becomes the saved data.
b=boot({seedText});assert.equal(b.stored().trips[0].name,trip.name);assert.equal(b.stored().seedStamp,seed.stamp);assert.equal(b.$('#seedNotice').hidden,undefined,'no replace prompt when nothing to replace');
// 3) Same seed already applied: no prompt, no write.
b=boot({raw:JSON.stringify({...seedDb,seedStamp:seed.stamp}),seedText});assert.notEqual(b.$('#seedNotice').hidden,false);assert.equal(b.writes(),0);
// 4) Different saved data: prompt, replace only on second click.
const other={trips:[{...structuredClone(trip),id:'old',name:'휴대폰에서 고친 일정'}],active:null,three:false,seedStamp:'2026-11-01T00:00:00.000Z'};
b=boot({raw:JSON.stringify(other),seedText});assert.equal(b.$('#seedNotice').hidden,false);assert.match(b.$('#seedMessage').textContent,/파일에 담긴 일정/);
b.$('#seedApply').onclick();assert.equal(b.stored().trips[0].name,'휴대폰에서 고친 일정');assert.match(b.$('#seedApply').textContent,/정말/);
b.$('#seedApply').onclick();assert.equal(b.stored().trips[0].name,trip.name);assert.equal(b.stored().seedStamp,seed.stamp);assert.equal(b.$('#seedNotice').hidden,true);
// 5) Broken seed is ignored.
b=boot({seedText:'{nope'});assert.equal(b.run('db.trips.length'),0);
(async()=>{
// 6) Snapshot from the page itself (no server): replace or insert the seed.
const pristineWithSeed='<!doctype html>\n<html><head><title>x</title></head><body>'+seedMatch[0]+'<script>var app=1;</script></body></html>';
const db2={trips:[{...structuredClone(trip),name:'바뀐 일정'}],active:null,three:false};
let snap=core.snapshotHtml(pristineWithSeed,db2,'2026-11-19T12:30:00.000Z');assert.equal(snap.match(/id="orbitSeed"/g).length,1);assert.ok(snap.includes('바뀐 일정')&&!snap.includes(seed.stamp));
snap=core.snapshotHtml('<html><head></head><body><script>var app=1;</script></body></html>',db2,'s1');assert.ok(snap.indexOf('orbitSeed')<snap.indexOf('</head>'));
assert.equal(core.snapshotFileName('다카마쓰 3박 4일',new Date(2026,10,19,21,5)),'다카마쓰 3박 4일-1119-2105.html');assert.equal(core.snapshotFileName('a/b:c*?',new Date(2026,0,2,3,4)),'a_b_c__-0102-0304.html');assert.equal(core.snapshotFileName('',new Date(2026,0,2,3,4)),'ORBIT-0102-0304.html');
// 7) Memory mode: edits show a save button, closing warns, saving clears the warning.
let m=boot({blocked:true,seedText,pristine:pristineWithSeed});m.run("openTrip('t1');addPlace('tamamo')");assert.equal(m.$('#saveSnapshot').hidden,false);
const ev={preventDefault(){this.prevented=true;}};m.win.beforeunload(ev);assert.ok(ev.prevented,'warns before closing');
await m.run("saveSnapshot()");const out=await m.blob().text();assert.ok(out.includes('orbitSeed')&&out.includes('tamamo'));const ev2={preventDefault(){this.prevented=true;}};m.win.beforeunload(ev2);assert.ok(!ev2.prevented,'no warning after saving');
// 8) During the trip, the file opens on today's day view.
m=boot({raw:JSON.stringify({...seedDb,seedStamp:seed.stamp}),seedText,now:'2026-11-21T01:00:00Z'});assert.equal(m.run('trip?.id'),'t1');assert.equal(m.run('view'),'today');assert.equal(m.run('dayIndex'),1);
m=boot({raw:JSON.stringify({...seedDb,seedStamp:seed.stamp}),seedText,now:'2026-12-05T01:00:00Z'});assert.equal(m.run('trip'),null);
console.log('PASS: phone HTML embeds itinerary safely; seed runs in memory when storage is blocked, fills empty storage, replaces only after confirmation; self-snapshot without server, file names, unsaved-change guard, opens today during the trip');
})().catch(e=>{console.error(e);process.exitCode=1;});
// Regression: real sources contain seed-like strings; snapshot must replace only the real seed.
{const dir='work/travel-globe/dist/prototype/',files=['destinations.js','core.js','day-view.js','app.js'];
 const built=core.phoneHtml({index:fs.readFileSync(dir+'index.html','utf8'),style:fs.readFileSync(dir+'style.css','utf8'),scripts:Object.fromEntries(files.map(f=>[f,fs.readFileSync(dir+f,'utf8')]))},seedDb,'s1');
 const again=core.snapshotHtml(built,{trips:[],active:null,three:false},'s2');
 assert.equal(again.length-built.length,core.snapshotHtml('<head></head>',{trips:[],active:null,three:false},'s2').length-core.snapshotHtml('<head></head>',seedDb,'s1').length,'only the seed block changes');
 assert.ok(again.includes('function snapshotFileName(')&&again.includes('"stamp":"s2"')&&!again.includes('"stamp":"s1"'));}
