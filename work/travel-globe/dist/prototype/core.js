
function validCustomPlace(p){return !!p&&typeof p.id==='string'&&/^custom-[a-zA-Z0-9-]+$/.test(p.id)&&p.id.length<=100&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=80&&typeof p.address==='string'&&p.address.length<=300;}
function resolvePlace(t,cities,id){const p=(t.customPlaces||[]).find(p=>p.id===id);return p?{...p,custom:true,area:p.address||'위치 메모 없음',coord:null}:cities[t.city].catalog.find(p=>p.id===id);}
function routeFeatures(visits,lookup){const features=[];for(let i=1;i<visits.length;i++){const a=lookup(visits[i-1].place)?.coord,b=lookup(visits[i].place)?.coord;if(a&&b)features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[a,b]}});}return features;}
function clockText(n){if(n==null)return '미확인';const days=Math.floor(n/1440),h=Math.floor(n%1440/60),m=n%60;return (days?`+${days}일 `:'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}
function minutes(s){if(!/^\d{2}:\d{2}$/.test(s||''))return null;const [h,m]=s.split(':').map(Number);return h<24&&m<60?h*60+m:null}
function buildTimeline(day){let cursor=minutes(day.start)??540,totalMove=0,complete=true;const rows=day.visits.map((v,i)=>{const leg=i===0?0:(day.scenario==='failure'&&i===1?null:(day.mode==='walk'?[35,45,25][(i-1)%3]:[18,24,16][(i-1)%3]));if(leg==null){cursor=null;complete=false}else{if(cursor!=null)cursor+=leg;totalMove+=leg}const expected=cursor,fixed=minutes(v.fixed),late=fixed!=null&&expected!=null?Math.max(0,expected-fixed):0;const start=fixed!=null?(expected==null?fixed:Math.max(expected,fixed)):expected;const end=start==null?null:start+v.duration;cursor=end;return {...v,leg,expected,start,end,late,anchored:fixed!=null&&expected==null}});return {rows,end:cursor,complete,totalMove,totalStay:day.visits.reduce((n,v)=>n+v.duration,0)}}
function updateTripSettings(original,{name,date,dayCount,overflow}){
  name=String(name||'').trim();date=String(date||'');
  if(!name||name.length>60)throw new Error('여행 이름을 1~60자로 입력해 주세요.');
  if(!Number.isInteger(dayCount)||dayCount<1||dayCount>14)throw new Error('여행 기간은 1~14일로 입력해 주세요.');
  if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new Error('올바른 출발일을 입력해 주세요.');
  const removed=original.days.slice(dayCount).flatMap((d,i)=>d.visits.map(v=>({...v,originalDay:dayCount+i+1})));
  if(removed.length&&!['hold','move'].includes(overflow))throw new Error('줄어드는 날짜의 일정을 보관하거나 옮길 방법을 선택해 주세요.');
  const next=structuredClone(original);next.name=name;next.date=date;next.unassigned=next.unassigned||[];
  next.days=next.days.slice(0,dayCount);
  while(next.days.length<dayCount)next.days.push({start:'09:00',mode:'transit',scenario:'normal',visits:[]});
  if(removed.length){if(overflow==='hold')next.unassigned.push(...removed);else next.days[dayCount-1].visits.push(...removed.map(({originalDay,...v})=>v));}
  return next;
}
function tripDateCount(start,end,fallback=4){
  if(!start&&!end)return fallback;
  if(!start||!end)throw new Error('출발일과 도착일을 모두 선택해 주세요.');
  const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
  if(!valid(start)||!valid(end))throw new Error('올바른 날짜를 선택해 주세요.');
  const count=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000+1;
  if(count<1)throw new Error('도착일은 출발일보다 빠를 수 없어요.');
  if(count>14)throw new Error('현재 시안은 최대 14일 여행을 지원합니다.');
  return count;
}
function tripEndDate(start,count){if(!start)return '';const date=new Date(start+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+count-1);return date.toISOString().slice(0,10);}
const BACKUP_MAX_BYTES=5*1024*1024;
function readBackup(text,cities,{local=false}={}){
  const fail=()=>{throw new Error('백업 내용이 올바르지 않거나 지원하지 않는 일정이 포함돼 있어요. 기존 여행은 변경되지 않았습니다.');};
  if(typeof text!=='string'||(!local&&new TextEncoder().encode(text).length>BACKUP_MAX_BYTES))throw new Error('5MB 이하의 백업 파일을 선택해 주세요.');
  let data;try{data=JSON.parse(text);}catch{throw new Error('파일을 읽을 수 없어요. ORBIT에서 저장한 JSON 백업 파일을 선택해 주세요.');}
  if(!data||data.format!=='orbit-travel-backup'||data.version!==1)throw new Error('지원하지 않는 백업 형식 또는 버전입니다.');
  if(!Array.isArray(data.trips)||(!local&&!data.trips.length)||(!local&&data.trips.length>1000))fail();
  const str=(v,max,empty=false)=>typeof v==='string'&&v.length<=max&&(empty||v.trim().length>0);
  let visits=0;
  return data.trips.map(t=>{
    if(!t||!str(t.name,60)||!Object.hasOwn(cities,t.city)||!cities[t.city].catalog||!Array.isArray(t.days)||t.days.length<1||t.days.length>14||!str(t.date,10,true))fail();
    if(t.date)try{tripDateCount(t.date,t.date);}catch{fail();}
    const customPlaces=t.customPlaces===undefined?[]:t.customPlaces;
    if(!Array.isArray(customPlaces)||customPlaces.length>10000||customPlaces.some(p=>!validCustomPlace(p))||new Set(customPlaces.map(p=>p.id)).size!==customPlaces.length)fail();
    const placeIds=new Set([...cities[t.city].catalog.map(p=>p.id),...customPlaces.map(p=>p.id)]);
    const visit=(v,held=false)=>{
      if((++visits>10000&&!local)||!v||!placeIds.has(v.place)||!Number.isInteger(v.duration)||v.duration<5||v.duration>720||!(v.fixed===''||minutes(v.fixed)!==null))fail();
      if(held&&(!Number.isInteger(v.originalDay)||v.originalDay<1||v.originalDay>14))fail();
      if(v.note!==undefined&&!str(v.note,1000,true))fail();
      return {place:v.place,duration:v.duration,fixed:v.fixed,...(v.note!==undefined?{note:v.note}:{}),...(held?{originalDay:v.originalDay}:{})};
    };
    const days=t.days.map(d=>{
      if(!d||minutes(d.start)===null||!['walk','transit'].includes(d.mode)||!['normal','failure'].includes(d.scenario)||!Array.isArray(d.visits))fail();
      return {start:d.start,mode:d.mode,scenario:d.scenario,visits:d.visits.map(v=>visit(v))};
    });
    if(t.unassigned!==undefined&&!Array.isArray(t.unassigned))fail();
    if(t.hotel!==null&&(!t.hotel||!str(t.hotel.name,80)||!str(t.hotel.address,200,true)))fail();
    if(t.deletedAt!==undefined&&(!str(t.deletedAt,40)||!Number.isFinite(Date.parse(t.deletedAt))))fail();
    return {name:t.name,city:t.city,date:t.date,days,...(t.customPlaces!==undefined?{customPlaces:customPlaces.map(p=>({id:p.id,name:p.name,address:p.address}))}:{}),hotel:t.hotel?{name:t.hotel.name,address:t.hotel.address}:null,unassigned:(t.unassigned||[]).map(v=>visit(v,true)),...(t.deletedAt?{deletedAt:t.deletedAt}:{})};
  });
}
const BACKUP_MAX_TRIPS=1000,BACKUP_MAX_VISITS=10000;
const backupText=(trips,createdAt)=>JSON.stringify({format:'orbit-travel-backup',version:1,createdAt,trips});
function createBackup(trips,cities,createdAt=new Date().toISOString()){
  const text=backupText(trips,createdAt);
  readBackup(text,cities);return text;
}
function createBackups(trips,cities){
  const createdAt=new Date().toISOString(),bytes=s=>new TextEncoder().encode(s).length,base=bytes(backupText([],createdAt)),parts=[];
  let part=[],size=base,visits=0;
  for(const t of trips){
    const tripSize=bytes(JSON.stringify(t))+1,tripVisits=t.days.reduce((n,d)=>n+d.visits.length,0)+(t.unassigned||[]).length;
    if(base+tripSize>BACKUP_MAX_BYTES||tripVisits>BACKUP_MAX_VISITS)throw new Error(`'${t.name}' 여행이 백업 한도(5MB·방문 10,000개)를 넘어 백업 파일을 만들 수 없어요. 여행 정보는 그대로 유지됩니다.`);
    if(part.length&&(part.length>=BACKUP_MAX_TRIPS||visits+tripVisits>BACKUP_MAX_VISITS||size+tripSize>BACKUP_MAX_BYTES)){parts.push(part);part=[];size=base;visits=0;}
    part.push(t);size+=tripSize;visits+=tripVisits;
  }
  parts.push(part);
  return parts.map(p=>createBackup(p,cities,createdAt));
}
function appendBackup(database,trips,id){
  return {...database,trips:[...database.trips,...trips.map(t=>({...structuredClone(t),id:id(),days:t.days.map(d=>({...d,visits:d.visits.map(v=>({...v,uid:id()}))})),unassigned:t.unassigned.map(v=>({...v,uid:id()}))}))]};
}
if(typeof module!=='undefined')module.exports={validCustomPlace,resolvePlace,routeFeatures,clockText,minutes,buildTimeline,updateTripSettings,tripDateCount,tripEndDate,readBackup,createBackup,createBackups,appendBackup,BACKUP_MAX_BYTES};
