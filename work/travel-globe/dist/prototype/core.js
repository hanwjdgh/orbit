
const validCoord=c=>Array.isArray(c)&&c.length===2&&c.every(Number.isFinite)&&Math.abs(c[0])<=180&&Math.abs(c[1])<=90;
function validCustomPlace(p){return !!p&&(p.coord===undefined||validCoord(p.coord))&&typeof p.id==='string'&&/^custom-[a-zA-Z0-9-]+$/.test(p.id)&&p.id.length<=100&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=80&&typeof p.address==='string'&&p.address.length<=300;}
function resolvePlace(t,cities,id){const p=(t.customPlaces||[]).find(p=>p.id===id);return p?{...p,custom:true,area:p.address||'위치 메모 없음',coord:p.coord||null}:cities[t.city].catalog.find(p=>p.id===id);}
function routeFeatures(visits,lookup){const features=[];for(let i=1;i<visits.length;i++){const a=lookup(visits[i-1].place)?.coord,b=lookup(visits[i].place)?.coord;if(a&&b)features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[a,b]}});}return features;}
function clockText(n){if(n==null)return '미확인';const days=Math.floor(n/1440),h=Math.floor(n%1440/60),m=n%60;return (days?`+${days}일 `:'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}
function minutes(s){if(!/^\d{2}:\d{2}$/.test(s||''))return null;const [h,m]=s.split(':').map(Number);return h<24&&m<60?h*60+m:null}
const legKey=(mode,a,b)=>`${mode}:${a.uid}>${b.uid}`;
function buildTimeline(day){let cursor=minutes(day.start)??540,totalMove=0,complete=true;const rows=day.visits.map((v,i)=>{let leg=0,legSource=null;if(i){const prev=day.visits[i-1],manual=day.legs?.[legKey(day.mode,prev,v)];if(prev.place===v.place)legSource='same';else if(Number.isInteger(manual)){leg=manual;legSource='manual';}else leg=null;}if(leg==null){cursor=null;complete=false}else{if(cursor!=null)cursor+=leg;totalMove+=leg}const expected=cursor,fixed=minutes(v.fixed),late=fixed!=null&&expected!=null?Math.max(0,expected-fixed):0;const start=fixed!=null?(expected==null?fixed:Math.max(expected,fixed)):expected;const end=start==null?null:start+v.duration;cursor=end;return {...v,leg,legSource,expected,start,end,late,anchored:fixed!=null&&expected==null}});return {rows,end:cursor,complete,totalMove,totalStay:day.visits.reduce((n,v)=>n+v.duration,0)}}
function legLabel(v){return v.legSource==='same'?'같은 장소':v.leg===null?'이동시간 미확인':v.leg+'분 이동(직접 입력)';}
function pruneLegs(day){if(!day.legs)return;const keep=new Set(day.visits.slice(1).flatMap((v,i)=>['walk','transit'].map(m=>legKey(m,day.visits[i],v))));for(const k of Object.keys(day.legs))if(!keep.has(k))delete day.legs[k];if(!Object.keys(day.legs).length)delete day.legs;}
function parseLocation(text){
  const s=String(text||'').trim(),n=String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const m=[...s.matchAll(new RegExp('!3d'+n+'!4d'+n,'g'))].at(-1)||s.match(new RegExp('@'+n+','+n))||s.match(new RegExp('[?&](?:q|query|ll)='+n+String.raw`(?:,|%2C)\s*`+n,'i'))||s.match(new RegExp('^'+n+String.raw`\s*,\s*`+n+'$'));
  if(!m)return null;const coord=[Number(m[2]),Number(m[1])];return validCoord(coord)?coord:null;
}
function distanceKm([lng1,lat1],[lng2,lat2]){const rad=Math.PI/180,a=Math.sin((lat2-lat1)*rad/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lng2-lng1)*rad/2)**2;return 12742*Math.asin(Math.sqrt(a));}
const seedScript=(db,stamp)=>'<script id="orbit'+'Seed" type="application/json">'+JSON.stringify({format:'orbit-phone-seed',version:1,stamp,db}).replace(/</g,'\\u003c')+'</script>';
function snapshotHtml(pristine,db,stamp){const tag=seedScript(db,stamp),re=/<script id="orbitSeed" type="application\/json">[\s\S]*?<\/script>/;return re.test(pristine)?pristine.replace(re,()=>tag):pristine.replace('</head>',()=>tag+'</head>');}
function snapshotFileName(name,d){const p=n=>String(n).padStart(2,'0');return (String(name||'').trim().replace(/[\\/:*?"<>|]/g,'_')||'ORBIT')+'-'+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+'.html';}
function phoneHtml({index,style,scripts},db,stamp){
  const seed=seedScript(db,stamp);
  let html=index.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+style+'</style>');
  for(const f of ['destinations.js','core.js','day-view.js','app.js'])html=html.replace('<script src="'+f+'"></script>',()=>(f==='destinations.js'?seed:'')+'<script>'+scripts[f].replaceAll('</script','<\\/script')+'</script>');
  return html;
}
function parseShareText(text){
  const lines=String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean),rest=[];let link='',coord=null;
  for(const line of lines){
    const url=/https?:\/\/\S+/.exec(line);
    if(url){link||=url[0];const before=line.slice(0,url.index).trim();if(before)rest.push(before);continue;}
    const c=parseLocation(line);if(c&&!coord){coord=c;continue;}
    rest.push(line);
  }
  if(!rest.length||(!link&&!coord))return null;
  return {name:rest[0].slice(0,80),address:rest.slice(1).join(' ').slice(0,300),link,coord};
}
function placeNameFromLink(text){const m=/\/maps\/place\/([^/@?#]+)/.exec(String(text||''));if(!m)return '';try{return decodeURIComponent(m[1].replace(/\+/g,' ')).trim().slice(0,80);}catch{return '';}}
function mapsSearchUrl(query,cityName){return 'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query:[String(query||'').trim(),cityName].filter(Boolean).join(' ')});}
function directionsUrl(a,b,mode){const where=p=>p.coord?p.coord[1]+','+p.coord[0]:[p.name,p.address].filter(Boolean).join(' ');return 'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin:where(a),destination:where(b),travelmode:mode==='walk'?'walking':'transit'});}
const CURRENCIES={JPY:{label:'엔',symbol:'¥',decimals:0},KRW:{label:'원',symbol:'₩',decimals:0},USD:{label:'달러',symbol:'$',decimals:2},EUR:{label:'유로',symbol:'€',decimals:2},GBP:{label:'파운드',symbol:'£',decimals:2}};
const EXPENSE_CATEGORIES={food:'식비',transport:'교통',lodging:'숙박',activity:'입장·체험',shopping:'쇼핑',other:'기타'};
function cityCurrency(c){return ({'일본':'JPY','대한민국':'KRW','미국':'USD','프랑스':'EUR','영국':'GBP'})[c?.country]||'KRW';}
function formatMoney(amount,currency){const d=CURRENCIES[currency].decimals;return CURRENCIES[currency].symbol+amount.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});}
function validExpense(e,dayCount){
  const c=e&&Object.hasOwn(CURRENCIES,e.currency)?CURRENCIES[e.currency]:null,scaled=c&&e.amount*10**c.decimals;
  return !!c&&typeof e.id==='string'&&/^[A-Za-z0-9-]{1,100}$/.test(e.id)&&Number.isInteger(e.day)&&e.day>=0&&e.day<dayCount&&typeof e.amount==='number'&&Number.isFinite(e.amount)&&e.amount>0&&e.amount<=1e8&&Math.abs(Math.round(scaled)-scaled)<1e-6&&Object.hasOwn(EXPENSE_CATEGORIES,e.category)&&(e.note===undefined||(typeof e.note==='string'&&e.note.length<=100))&&(e.createdAt===undefined||(typeof e.createdAt==='string'&&e.createdAt.length<=40));
}
function expenseTotals(list,rates={}){
  const sum=(a,b)=>Math.round(((a||0)+b)*100)/100,byCurrency={},byCategory={},byDay={};
  for(const x of list){byCurrency[x.currency]=sum(byCurrency[x.currency],x.amount);for(const [o,k] of [[byCategory,x.category],[byDay,x.day]]){o[k]??={};o[k][x.currency]=sum(o[k][x.currency],x.amount);}}
  const missingRates=Object.keys(byCurrency).filter(c=>c!=='KRW'&&!(rates[c]>0));
  return {byCurrency,byCategory,byDay,missingRates,krw:missingRates.length?null:Math.round(Object.entries(byCurrency).reduce((s,[c,a])=>s+a*(c==='KRW'?1:rates[c]),0))};
}
function formatTotals(byCurrency){return Object.keys(CURRENCIES).filter(c=>byCurrency[c]).map(c=>formatMoney(byCurrency[c],c)).join(' · ');}
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
  if(next.expenses)next.expenses=next.expenses.map(x=>x.day>=dayCount?{...x,day:dayCount-1}:x);
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
  if(!data||data.format!=='orbit-travel-backup'||![1,2].includes(data.version))throw new Error('지원하지 않는 백업 형식 또는 버전입니다.');
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
      let legs;
      if(d.legs!==undefined){
        if(!d.legs||typeof d.legs!=='object'||Array.isArray(d.legs)||Object.keys(d.legs).length>d.visits.length*2)fail();
        const index=new Map(d.visits.map((v,i)=>[v?.uid,i]));legs={};
        for(const [k,minutes] of Object.entries(d.legs)){const m=/^(walk|transit):([A-Za-z0-9-]+)>([A-Za-z0-9-]+)$/.exec(k);if(!m||!Number.isInteger(minutes)||minutes<0||minutes>1440)fail();if(index.has(m[2])&&index.has(m[3]))legs[m[1]+':'+index.get(m[2])+'>'+index.get(m[3])]=minutes;}
      }
      return {start:d.start,mode:d.mode,scenario:d.scenario,visits:d.visits.map(v=>visit(v)),...(legs&&Object.keys(legs).length?{legs}:{})};
    });
    if(t.unassigned!==undefined&&!Array.isArray(t.unassigned))fail();
    if(t.hotel!==null&&(!t.hotel||!str(t.hotel.name,80)||!str(t.hotel.address,200,true)))fail();
    if(t.deletedAt!==undefined&&(!str(t.deletedAt,40)||!Number.isFinite(Date.parse(t.deletedAt))))fail();
    if(t.expenses!==undefined&&(!Array.isArray(t.expenses)||t.expenses.length>2000||t.expenses.some(x=>!validExpense(x,t.days.length))||new Set(t.expenses.map(x=>x.id)).size!==t.expenses.length))fail();
    if(t.exchangeRate!==undefined&&(!t.exchangeRate||typeof t.exchangeRate!=='object'||Array.isArray(t.exchangeRate)||Object.entries(t.exchangeRate).some(([c,r])=>c==='KRW'||!Object.hasOwn(CURRENCIES,c)||typeof r!=='number'||!(r>0&&r<=100000))))fail();
    return {name:t.name,city:t.city,date:t.date,days,...(t.customPlaces!==undefined?{customPlaces:customPlaces.map(p=>({id:p.id,name:p.name,address:p.address,...(p.coord?{coord:[...p.coord]}:{})}))}:{}),hotel:t.hotel?{name:t.hotel.name,address:t.hotel.address}:null,unassigned:(t.unassigned||[]).map(v=>visit(v,true)),...(t.deletedAt?{deletedAt:t.deletedAt}:{}),...(t.expenses!==undefined?{expenses:t.expenses.map(({id,day,amount,currency,category,note,createdAt})=>({id,day,amount,currency,category,...(note!==undefined?{note}:{}),...(createdAt?{createdAt}:{})}))}:{}),...(t.exchangeRate?{exchangeRate:{...t.exchangeRate}}:{})};
  });
}
const BACKUP_MAX_TRIPS=1000,BACKUP_MAX_VISITS=10000;
const backupText=(trips,createdAt)=>JSON.stringify({format:'orbit-travel-backup',version:2,createdAt,trips});
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
  return {...database,trips:[...database.trips,...trips.map(t=>({...structuredClone(t),id:id(),days:t.days.map(d=>{const visits=d.visits.map(v=>({...v,uid:id()}));return {...d,visits,...(d.legs?{legs:Object.fromEntries(Object.entries(d.legs).map(([k,minutes])=>{const [,mode,i,j]=/^(\w+):(\d+)>(\d+)$/.exec(k);return [mode+':'+visits[i].uid+'>'+visits[j].uid,minutes];}))}:{})};}),unassigned:t.unassigned.map(v=>({...v,uid:id()})),...(t.expenses?{expenses:t.expenses.map(x=>({...x,id:id()}))}:{})}))]};
}
if(typeof module!=='undefined')module.exports={parseShareText,snapshotHtml,snapshotFileName,phoneHtml,CURRENCIES,EXPENSE_CATEGORIES,cityCurrency,formatMoney,validExpense,expenseTotals,formatTotals,placeNameFromLink,mapsSearchUrl,legLabel,validCoord,legKey,pruneLegs,parseLocation,distanceKm,directionsUrl,validCustomPlace,resolvePlace,routeFeatures,clockText,minutes,buildTimeline,updateTripSettings,tripDateCount,tripEndDate,readBackup,createBackup,createBackups,appendBackup,BACKUP_MAX_BYTES};
