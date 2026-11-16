const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('./travel-globe/dist/prototype/core.js');
const cities=vm.runInNewContext(fs.readFileSync('work/travel-globe/dist/prototype/destinations.js','utf8')+';destinations');

// parseLocation: [lng, lat] from Google links or raw coordinates.
const P=core.parseLocation;
assert.deepEqual(P('https://www.google.com/maps/place/Ohori/@33.5800,130.3700,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d33.5861!4d130.3764'),[130.3764,33.5861],'prefers !3d!4d place pin over viewport');
assert.deepEqual(P('https://www.google.com/maps/place/%EC%B9%B8%EC%B9%B4%EC%BC%80%EC%9D%B4+%EC%BC%80%EC%9D%B4%EB%B8%94%EC%B9%B4/@34.5118679,134.298395,16.5z/data=!4m15!1m8!3m7!1s0x3553c1c5548d47df:0x72f429d49c1ef71b!2z7J2867O4IOqwgOqwgOyZgO2YhCDri6TsubTrp4jsk7Dsi5w!3b1!8m2!3d34.342542!4d134.0465405!16zL20vMGdwNnJu!3m5!1s0x3554796f331d93a1:0x1564062946a86f6d!8m2!3d34.5156402!4d134.3006589!16s%2Fm%2F0j3fg5r?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D'),[134.3006589,34.5156402],'last !3d!4d is the selected place, earlier ones are previous context');
assert.deepEqual(P('https://www.google.com/maps/@33.5902,130.4017,15z'),[130.4017,33.5902]);
assert.deepEqual(P('https://maps.google.com/?q=33.59,130.40'),[130.40,33.59]);
assert.deepEqual(P('https://www.google.com/maps/search/?api=1&query=33.59%2C130.40'),[130.40,33.59]);
assert.deepEqual(P('https://maps.apple.com/?ll=48.8584,2.2945&q=Eiffel'),[2.2945,48.8584]);
assert.deepEqual(P('  33.5902 , 130.4017 '),[130.4017,33.5902]);
assert.deepEqual(P('-33.8568, 151.2153'),[151.2153,-33.8568]);
for(const bad of ['https://maps.app.goo.gl/AbCdEf123','하카타역 근처','91, 10','10, 181','','33.59','1,2,3'])assert.equal(P(bad),null,bad);

// distanceKm for far-from-city warning.
assert.ok(Math.abs(core.distanceKm([130.4017,33.5902],[130.3764,33.5861])-2.39)<0.1);
assert.ok(core.distanceKm(cities.fukuoka.center,[139.76,35.68])>800);

// directionsUrl: coordinates when known, otherwise name + address text.
const a={name:'오호리 공원',coord:[130.3764,33.5861]},b={name:'작은 식당',address:'하카타역 2층',coord:null};
const u=new URL(core.directionsUrl(a,b,'walk'));
assert.equal(u.origin+u.pathname,'https://www.google.com/maps/dir/');assert.equal(u.searchParams.get('api'),'1');
assert.equal(u.searchParams.get('origin'),'33.5861,130.3764');assert.equal(u.searchParams.get('destination'),'작은 식당 하카타역 2층');assert.equal(u.searchParams.get('travelmode'),'walking');
assert.equal(new URL(core.directionsUrl(a,a,'transit')).searchParams.get('travelmode'),'transit');

// buildTimeline: only manual legs count; unentered legs are unknown; same place in a row is 0.
const v=(uid,place='ohori',duration=60,fixed='')=>({uid,place,duration,fixed});
const day={start:'09:00',mode:'walk',scenario:'normal',visits:[v('a'),v('b','kushida'),v('c','tenjin')],legs:{'walk:a>b':25,'transit:b>c':10}};
let tl=core.buildTimeline(day);
assert.equal(tl.rows[1].leg,25);assert.equal(tl.rows[1].legSource,'manual');assert.equal(tl.rows[1].start,9*60+60+25);
assert.equal(tl.rows[2].leg,null,'transit value must not apply to walk day');assert.equal(tl.complete,false);assert.equal(tl.end,null);
tl=core.buildTimeline({...day,mode:'transit'});assert.equal(tl.rows[1].leg,null);assert.equal(tl.rows[2].leg,10);
tl=core.buildTimeline({...day,visits:[day.visits[1],day.visits[0],day.visits[2]]});assert.equal(tl.rows[1].leg,null,'reordered pair has no value');
tl=core.buildTimeline({start:'09:00',mode:'walk',visits:[v('x'),v('y')]});assert.equal(tl.rows[1].leg,0);assert.equal(tl.rows[1].legSource,'same');assert.equal(tl.complete,true);
tl=core.buildTimeline({start:'09:00',mode:'walk',scenario:'failure',visits:[v('a'),v('b','kushida')],legs:{'walk:a>b':5}});assert.equal(tl.rows[1].leg,5,'legacy scenario field is ignored');
tl=core.buildTimeline({start:'09:00',mode:'walk',visits:[v('a',undefined,120),v('b','kushida',60,'10:00')],legs:{'walk:a>b':18}});assert.equal(tl.rows[1].late,78);
tl=core.buildTimeline({start:'09:00',mode:'walk',visits:[v('a'),v('b','kushida',60,'12:00')]});assert.equal(tl.rows[1].anchored,true);assert.equal(tl.rows[1].start,720);

// pruneLegs keeps only current adjacent pairs (both modes).
const pruned={visits:[v('a'),v('b')],legs:{'walk:a>b':1,'transit:a>b':2,'walk:b>a':3,'walk:a>gone':4}};core.pruneLegs(pruned);
assert.deepEqual(pruned.legs,{'walk:a>b':1,'transit:a>b':2});
const empty={visits:[v('a')],legs:{'walk:a>b':1}};core.pruneLegs(empty);assert.equal(empty.legs,undefined);

// Backup v2: coords and legs round-trip; v1 still readable; restore remaps leg keys to new uids.
const trip={id:'t1',name:'좌표 시험',city:'fukuoka',date:'',hotel:null,customPlaces:[{id:'custom-a',name:'식당',address:'2층',coord:[130.41,33.59]},{id:'custom-b',name:'카페',address:''}],
 days:[{start:'09:00',mode:'walk',scenario:'normal',visits:[v('v1'),v('v2','custom-a'),v('v3','custom-b')],legs:{'walk:v1>v2':12,'transit:v2>v3':7}}],unassigned:[]};
const text=core.createBackup([trip],cities);assert.equal(JSON.parse(text).version,2);
const [read]=core.readBackup(text,cities);assert.deepEqual(read.customPlaces[0].coord,[130.41,33.59]);assert.equal(read.customPlaces[1].coord,undefined);
assert.deepEqual(read.days[0].legs,{'walk:0>1':12,'transit:1>2':7});
const v1=JSON.parse(text);v1.version=1;delete v1.trips[0].days[0].legs;delete v1.trips[0].customPlaces[0].coord;assert.doesNotThrow(()=>core.readBackup(JSON.stringify(v1),cities));
let n=0;const restored=core.appendBackup({trips:[]},[read],()=>'n'+n++).trips[0];const [x,y,z]=restored.days[0].visits.map(q=>q.uid);
assert.deepEqual(restored.days[0].legs,{[`walk:${x}>${y}`]:12,[`transit:${y}>${z}`]:7});
assert.equal(core.buildTimeline(restored.days[0]).rows[1].leg,12);
for(const mutate of [t=>t.customPlaces[0].coord=[200,33],t=>t.customPlaces[0].coord=['130',33],t=>t.customPlaces[0].coord=[130],t=>t.days[0].legs={'walk:v1>v2':-1},t=>t.days[0].legs={'walk:v1>v2':1441},t=>t.days[0].legs={'walk:v1>v2':2.5},t=>t.days[0].legs={'bike:v1>v2':5},t=>t.days[0].legs=[],t=>t.days[0].legs=Object.fromEntries(Array.from({length:7},(_,i)=>['walk:v1>x'+i,1]))]){
 const bad=structuredClone(trip);mutate(bad);assert.throws(()=>core.createBackup([bad],cities),undefined,JSON.stringify(bad.days[0].legs||bad.customPlaces[0].coord));}
const future=JSON.parse(text);future.version=3;assert.throws(()=>core.readBackup(JSON.stringify(future),cities),/버전/);

// resolvePlace uses stored custom coords.
assert.deepEqual(core.resolvePlace(trip,cities,'custom-a').coord,[130.41,33.59]);assert.equal(core.resolvePlace(trip,cities,'custom-b').coord,null);
// App: leg editing, custom place location, text export.
const app=fs.readFileSync('work/travel-globe/dist/prototype/app.js','utf8');
function boot(raw){
 let stored=raw,fail=false,blob;const els={},listeners={};
 const $=k=>els[k]||(els[k]={value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},reset(){this.value='';},click(){},remove(){},focus(){},setCustomValidity(){}});
 const ctx={...core,structuredClone,TextEncoder,Blob,Date,Intl,console,URLSearchParams,destinations:cities,crypto:require('node:crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:true}),window:{},document:{querySelector:$,getElementById:id=>$('#'+id),addEventListener:(n,fn)=>listeners[n]=fn,createElement:()=>$('a'),body:{append(){}}},URL:{createObjectURL(b){blob=b;return 'blob:t';},revokeObjectURL(){}},localStorage:{getItem:()=>stored,setItem(k,v){if(fail)throw Error('full');stored=v;}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/travel-globe/dist/prototype/day-view.js','utf8'),ctx);vm.runInContext(app,ctx);
 return {$,run:s=>vm.runInContext(s,ctx),stored:()=>JSON.parse(stored),setFail:v=>fail=v,blob:()=>blob,click(dataset){listeners.click({target:{closest:()=>({dataset,hasAttribute:()=>false})}});}};
}
const appTrip={id:'t1',name:'앱 시험',city:'fukuoka',date:'',hotel:null,customPlaces:[{id:'custom-a',name:'작은 식당',address:'하카타역 2층'}],days:[{start:'09:00',mode:'walk',scenario:'normal',visits:[v('a1'),v('a2','kushida'),v('a3','custom-a')]}],unassigned:[]};
const ui=boot(JSON.stringify({trips:[appTrip]}));ui.run("openTrip('t1');view='timeline';render()");
let html=ui.$('#panelContent').innerHTML;assert.match(html,/이동시간 미확인/);assert.match(html,/maps\/dir\/\?api=1&amp;origin=33.5861%2C130.3764&amp;destination=33.5933%2C130.4108&amp;travelmode=walking/);assert.ok(!html.includes('예시 실패')&&!html.includes('id="scenario"'));
ui.click({leg:'1'});assert.match(ui.$('#panelContent').innerHTML,/id="legMinutes"/);
ui.$('#legMinutes').value='abc';ui.click({legSave:'1'});assert.match(ui.$('#legError').textContent,/0~1440/);assert.equal(ui.stored().trips[0].days[0].legs,undefined);
ui.$('#legMinutes').value='25';ui.click({legSave:'1'});assert.deepEqual(ui.stored().trips[0].days[0].legs,{'walk:a1>a2':25});assert.match(ui.$('#panelContent').innerHTML,/도보 25분 · 직접 입력/);
ui.setFail(true);ui.click({leg:'2'});ui.$('#legMinutes').value='10';ui.click({legSave:'2'});assert.equal(ui.run("day().legs['walk:a2>a3']"),undefined,'failed save rolls back');ui.setFail(false);
ui.click({legClear:'1'});assert.equal(ui.stored().trips[0].days[0].legs,undefined);
ui.click({leg:'1'});ui.$('#legMinutes').value='25';ui.click({legSave:'1'});ui.run("reorderVisit('a2',1)");assert.equal(ui.stored().trips[0].days[0].legs,undefined,'reorder prunes stale leg');
// custom place location via detail dialog, then pin data and export.
ui.run("detail('custom-a')");ui.$('#customCoord').value='하카타역';ui.$('#customCoordSave').onclick();assert.match(ui.$('#customCoordError').textContent,/위도, 경도/);
ui.$('#customCoord').value='https://www.google.com/maps/@33.5897,130.4207,17z';ui.$('#customCoordSave').onclick();assert.deepEqual(ui.stored().trips[0].customPlaces[0].coord,[130.4207,33.5897]);assert.deepEqual(ui.run("place('custom-a').coord"),[130.4207,33.5897]);assert.equal(ui.$('#mapMissing').hidden,true);
ui.run("detail('custom-a')");ui.$('#customCoordClear').onclick();assert.equal(ui.stored().trips[0].customPlaces[0].coord,undefined);
ui.run("openCustom()");ui.$('#customName').value='새 카페';ui.$('#customAddress').value='';ui.$('#customLocation').value='https://maps.app.goo.gl/x';ui.$('#customDay').value='0';ui.$('#customForm').onsubmit({preventDefault(){}});assert.match(ui.$('#customError').textContent,/위도, 경도/);assert.equal(ui.stored().trips[0].customPlaces.length,1);
ui.$('#customLocation').value='33.59, 130.40';ui.$('#customForm').onsubmit({preventDefault(){}});assert.deepEqual(ui.stored().trips[0].customPlaces[1].coord,[130.40,33.59]);
// Search panel links the current query to Google Maps, scoped to the trip city.
assert.equal(new URL(core.mapsSearchUrl(' 우동 바카이치다이 ','TAKAMATSU')).searchParams.get('query'),'우동 바카이치다이 TAKAMATSU');assert.equal(new URL(core.mapsSearchUrl('','TAKAMATSU')).searchParams.get('query'),'TAKAMATSU');
ui.run("view='search';query='우동';render()");assert.match(ui.$('#panelContent').innerHTML,/id="googleSearch" href="https:\/\/www.google.com\/maps\/search\/\?api=1&amp;query=%EC%9A%B0%EB%8F%99\+FUKUOKA" target="_blank" rel="noopener noreferrer"/);
ui.run("query='라멘';renderSearch(true)");assert.equal(new URL(ui.$('#googleSearch').href).searchParams.get('query'),'라멘 FUKUOKA');
ui.run("dayIndex=0;view='timeline';render()");ui.click({leg:'1'});ui.$('#legMinutes').value='12';ui.click({legSave:'1'});
ui.$('#export').onclick();
async function finishApp(){const text=await ui.blob().text();assert.match(text,/↓ 12분 이동\(직접 입력\)/);assert.match(text,/↓ 이동시간 미확인/);assert.match(text,/새 카페 \[직접 추가 · 위치 등록됨\]/);assert.ok(!text.includes('시안 예시'));
console.log('PASS: location parsing, distance, directions URL, manual/same/unknown legs, leg pruning, backup v2 coords/legs with v1 compat and restore remap, leg editing UI, custom location UI, export legs');}
finishApp().catch(e=>{console.error(e);process.exitCode=1;});
