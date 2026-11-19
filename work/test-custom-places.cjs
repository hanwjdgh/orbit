const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('./travel-globe/dist/prototype/core.js');
const app=fs.readFileSync('work/travel-globe/dist/prototype/app.js','utf8');
const cities=vm.runInNewContext(fs.readFileSync('work/travel-globe/dist/prototype/destinations.js','utf8')+';destinations');
const day=()=>({start:'09:00',mode:'walk',scenario:'normal',visits:[]});
const initial={id:'existing',name:'기존 여행',city:'fukuoka',date:'',hotel:null,days:[day(),day()]};
function boot(saved,fail=false){
 const els={},listeners={};let stored=saved,download;
 const element=k=>els[k]||(els[k]={value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},reset(){},click(){},remove(){}});
 const ctx={...core,destinations:cities,structuredClone,console,crypto:require('node:crypto').webcrypto,TextEncoder,Blob,setTimeout:()=>1,clearTimeout(){},URL:{createObjectURL(blob){download=blob;return 'blob:test';},revokeObjectURL(){}},window:{},document:{querySelector:element,addEventListener:(name,fn)=>listeners[name]=fn,createElement:()=>element('a'),body:{append(){}}},localStorage:{getItem:()=>stored,setItem:(k,v)=>{if(fail)throw Error('full');stored=v;}},matchMedia:()=>({matches:true})};
 element('#customAddress');vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/travel-globe/dist/prototype/day-view.js','utf8'),ctx);vm.runInContext(app,ctx);
 return {ctx,els,run:s=>vm.runInContext(s,ctx),stored:()=>stored,download:()=>download,click(dataset,attrs=[]){listeners.click({target:{closest:()=>({dataset,hasAttribute:k=>attrs.includes(k)})}});}};
}
const b=boot(JSON.stringify({trips:[initial],active:'existing'}));b.run("openTrip('existing');openCustom()");
b.els['#customName'].value='식당 <예약> & 카페';b.els['#customAddress'].value='하카타역 옆\n2층';b.els['#customDay'].value='1';b.els['#customForm'].onsubmit({preventDefault(){}});
let saved=JSON.parse(b.stored()),t=saved.trips[0],p=t.customPlaces[0],v=t.days[1].visits[0];
assert.equal(t.days[0].visits.length,0);assert.equal(v.place,p.id);assert.equal(p.address,'하카타역 옆\n2층');assert.match(b.els['#panelContent'].innerHTML,/&lt;예약&gt; &amp;/);assert.match(b.els['#mapMissing'].textContent,/위치 미등록 1곳/);
const re=boot(b.stored());re.run("openTrip('existing');dayIndex=1;render();");assert.equal(re.run('place(day().visits[0].place).name'),p.name);
re.run('editVisit(day().visits[0].uid)');re.els['#editDay'].value='0';re.els['#editDuration'].value='90';re.els['#editFixed'].value='13:00';re.els['#editNote'].value='예약 메모';re.els['#editForm'].onsubmit({preventDefault(){}});
assert.equal(re.run('trip.days[0].visits[0].note'),'예약 메모');re.run("dayIndex=0;addPlace('ohori');");re.click({reorder:v.uid,delta:'1'});assert.equal(re.run('day().visits[1].place'),p.id);
re.click({delete:v.uid});assert.equal(re.run('day().visits.length'),1);re.els['#undo'].onclick();assert.equal(re.run('day().visits[1].place'),p.id);
re.els['#export'].onclick();
async function finish(){const text=await re.download().text();assert.ok(text.includes(p.name));assert.ok(text.includes(p.address));assert.ok(text.includes('예약 메모'));assert.ok(text.includes('위치 미등록'));
 t=JSON.parse(re.stored()).trips[0];const restored=core.readBackup(core.createBackup([t],cities),cities)[0];assert.equal(restored.customPlaces[0].name,p.name);assert.equal(restored.days[0].visits[1].note,'예약 메모');
 const held=core.updateTripSettings(JSON.parse(b.stored()).trips[0],{name:t.name,date:'',dayCount:1,overflow:'hold'});assert.equal(core.readBackup(core.createBackup([held],cities),cities)[0].unassigned[0].place,p.id);
 re.els['#backupDownload'].onclick();assert.equal(core.readBackup(await re.download().text(),cities)[0].customPlaces[0].id,p.id);assert.match(re.els['#backupMessage'].textContent,/백업 다운로드를 요청/);
 const hb=boot(JSON.stringify({trips:[held]}));hb.run("openTrip('existing')");hb.els['#export'].onclick();const heldText=await hb.download().text();assert.ok(heldText.includes('미배정 장소'));assert.ok(heldText.includes('[직접 추가 · 위치 미등록]\n주소/위치 메모: '+p.address),'held custom place address missing in text export');
 const lookup=id=>core.resolvePlace(t,cities,id);assert.equal(core.routeFeatures([{place:'ohori'},{place:p.id},{place:'ohori'}],lookup).length,0);assert.equal(core.routeFeatures([{place:'ohori'},{place:'ohori'}],lookup).length,1);
 for(const mutate of [x=>x.customPlaces[0].name='',x=>x.customPlaces[0].address={},x=>x.customPlaces.push(x.customPlaces[0]),x=>x.customPlaces[0].id='ohori',x=>x.customPlaces=[]]){const bad=structuredClone(t);mutate(bad);assert.throws(()=>core.createBackup([bad],cities));}
 const failed=boot(JSON.stringify({trips:[initial]}),true);failed.run("openTrip('existing');openCustom()");failed.els['#customName'].value='남아야 할 입력';failed.els['#customAddress'].value='주소';failed.els['#customDay'].value='0';failed.els['#customForm'].onsubmit({preventDefault(){}});assert.equal(failed.run('trip.days[0].visits.length'),0);assert.equal(failed.run('trip.customPlaces'),undefined);assert.equal(failed.els['#customName'].value,'남아야 할 입력');assert.match(failed.els['#customError'].textContent,/저장하지 못/);
 console.log('PASS: custom add, selected day, reload, edit/move/reorder, delete/undo, text export, backup roundtrip, held places, map gaps, invalid backups, save rollback, escaped content');}
finish().catch(e=>{console.error(e);process.exitCode=1;});

