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
function boot({raw=null,blocked=false,seedText}){
 let stored=raw,writes=0;const els={},listeners={};
 const $=k=>els[k]||(els[k]={value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},reset(){},click(){},remove(){},focus(){},setCustomValidity(){}});
 if(seedText!==undefined)$('#orbitSeed').textContent=seedText;
 const ctx={...core,structuredClone,TextEncoder,Blob,Date,Intl,console,URLSearchParams,destinations:cities,crypto:require('node:crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:true}),window:{},location:{reload(){}},
  document:{querySelector:$,getElementById:id=>id==='orbitSeed'&&seedText===undefined?null:$('#'+id),addEventListener:(n,fn)=>listeners[n]=fn,createElement:()=>$('a'),body:{append(){}}},URL:{createObjectURL(){return 'blob:t';},revokeObjectURL(){}},
  localStorage:{getItem(){if(blocked)throw Error('blocked');return stored;},setItem(k,v){if(blocked)throw Error('blocked');writes++;stored=v;}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/travel-globe/dist/prototype/day-view.js','utf8'),ctx);vm.runInContext(app,ctx);
 return {$,run:s=>vm.runInContext(s,ctx),stored:()=>stored&&JSON.parse(stored),writes:()=>writes};
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
console.log('PASS: phone HTML embeds itinerary safely; seed runs in memory when storage is blocked, fills empty storage, and replaces existing data only after confirmation');
