const $=s=>document.querySelector(s),KEY='orbit-interactive-prototype-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db={trips:[],active:null,three:false},trip=null,dayIndex=0,view='plan',query='',filter='전체',detailId=null,undoState=null,map=null,mapReady=false,mapCity=null;
const pins=new Map();let pinSignature='',toastTimer;
let storageRaw=null,storageLocked=false,saveFailed=false,rawSaved=false;
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9-]{1,100}$/.test(id);
function storageMessage(message){saveFailed=true;$('#storageNotice').hidden=false;$('#storageMessage').textContent=message;$('#saveStatus').textContent='저장되지 않음';$('#recoverStorage').hidden=!storageLocked||storageRaw===null;$('#resetStorage').hidden=!(storageLocked&&rawSaved);}
const STORAGE_UNAVAILABLE='이 화면에서는 브라우저 저장소를 쓸 수 없어 여행을 저장할 수 없어요. Chrome 같은 일반 브라우저로 파일을 열거나 로컬 서버 주소(http://127.0.0.1:4173)로 열어 주세요.';
const STORAGE_MEMORY='이 화면에서는 브라우저가 저장을 막아요. 파일에 담긴 일정을 보여 드리며, 고친 내용은 이 화면을 닫으면 사라집니다.';
let storageUnavailable=false,memoryMode=false,seed=null,seedConfirm=false;
function checkSaved(saved){
  if(!saved||!Array.isArray(saved.trips))throw Error('invalid');
  readBackup(JSON.stringify({format:'orbit-travel-backup',version:2,trips:saved.trips}),destinations,{local:true});
  const ids=new Set();
  for(const t of saved.trips){if(!validId(t.id)||ids.has(t.id))throw Error('invalid');ids.add(t.id);const uids=new Set();for(const v of [...t.days.flatMap(d=>d.visits),...(t.unassigned||[])]){if(!validId(v.uid)||uids.has(v.uid))throw Error('invalid');uids.add(v.uid);}}
  return saved;
}
const seedDb=()=>({...structuredClone(seed.db),three:seed.db.three===true,seedStamp:seed.stamp});
try{const el=document.getElementById?.('orbitSeed');if(el){const s=JSON.parse(el.textContent);if(s?.format!=='orbit-phone-seed'||typeof s.stamp!=='string')throw Error('seed');checkSaved(s.db);seed=s;}}catch{seed=null;}
try{storageRaw=localStorage.getItem(KEY);}catch{storageUnavailable=true;}
if(storageUnavailable){if(seed){memoryMode=true;db=seedDb();}else storageLocked=true;storageMessage(memoryMode?STORAGE_MEMORY:STORAGE_UNAVAILABLE);}
else try{
  if(storageRaw!==null){const saved=checkSaved(JSON.parse(storageRaw));db=saved;db.three=saved.three===true;}
}catch{storageLocked=true;storageMessage('저장 자료를 읽을 수 없어 덮어쓰기를 막았습니다. 원본 자료를 내려받아 보관해 주세요. 원본 복구 파일은 일반 여행 백업과 다릅니다.');}
if(seed&&!storageUnavailable&&!storageLocked){
  if(storageRaw===null){db=seedDb();persist();}
  else if(db.seedStamp!==seed.stamp){$('#seedNotice').hidden=false;$('#seedMessage').textContent='파일에 담긴 일정('+seed.stamp.slice(0,16).replace('T',' ')+' UTC에 만듦)이 이 기기에 저장된 일정과 달라요. 파일의 일정으로 바꿀 수 있어요.';}
}
$('#seedApply').onclick=()=>{
  if(!seed)return;
  if(!seedConfirm){seedConfirm=true;$('#seedApply').textContent='정말 바꾸기 (이 기기에서 고친 일정은 사라져요)';return;}
  const previous=db;db=seedDb();if(!persist()){db=previous;return;}
  seedConfirm=false;$('#seedNotice').hidden=true;welcome();toast('파일에 담긴 일정으로 바꿨어요.');
};
$('#recoverStorage').onclick=()=>{if(storageRaw===null)return;const url=URL.createObjectURL(new Blob([storageRaw],{type:'application/json;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='ORBIT-저장원본-복구용.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);if(storageLocked){rawSaved=true;storageMessage('복구용 원본 파일을 내려받았어요. 파일이 보관된 것을 확인한 뒤 저장 자료를 비우고 새로 시작할 수 있어요. 일반 여행 백업 파일이 있다면 백업·복원으로 여행을 되살릴 수 있습니다.');}};
$('#resetStorage').onclick=()=>{
  if(!storageLocked||!rawSaved||!confirm('이 브라우저의 ORBIT 저장 자료를 모두 지우고 새로 시작합니다. 되돌릴 수 없습니다. 복구용 원본 파일을 보관했나요?'))return;
  try{if(localStorage.getItem(KEY)!==storageRaw){storageMessage('그 사이 저장 자료가 바뀌어 지우지 않았어요. 새로고침해 주세요.');return;}localStorage.removeItem(KEY);}catch{storageMessage('저장 자료를 지우지 못했어요. 브라우저 설정에서 저장이 허용되는지 확인해 주세요.');return;}
  location.reload();
};
window.addEventListener?.('storage',e=>{if(!storageLocked&&(e.key===KEY||e.key===null)&&e.newValue!==storageRaw)storageMessage('다른 탭에서 저장 내용이 바뀌었습니다. 이 탭의 변경은 저장되지 않으니 입력 중인 내용을 따로 보관한 뒤 새로고침해 주세요.');});
const city=()=>destinations[trip?.city||'fukuoka'],catalog=()=>city().catalog,day=()=>trip.days[dayIndex],place=id=>indexedPlace(id),newDay=()=>({start:'09:00',mode:'transit',scenario:'normal',visits:[]});
let placeCacheTrip=null,placeCacheList=null,placeCache=new Map();
function indexedPlace(id){if(placeCacheTrip!==trip||placeCacheList!==trip.customPlaces){placeCacheTrip=trip;placeCacheList=trip.customPlaces;placeCache=new Map(catalog().map(p=>[p.id,p]));for(const p of trip.customPlaces||[])placeCache.set(p.id,{...p,custom:true,area:p.address||'위치 메모 없음',coord:p.coord||null});}return placeCache.get(id);}
function persist(){
  trip?.days.forEach(pruneLegs);
  if(memoryMode){saveFailed=false;$('#saveStatus').textContent='이 화면에서만 수정됨';return true;}
  if(storageUnavailable){storageMessage(STORAGE_UNAVAILABLE);return false;}
  if(storageLocked){storageMessage('저장 자료 보호 중입니다. 원본 자료를 보관하고 문제를 해결한 뒤 다시 열어 주세요. 변경은 적용하지 않았습니다.');return false;}
  try{
    if(localStorage.getItem(KEY)!==storageRaw){storageMessage('다른 탭에서 저장 내용이 바뀌었습니다. 입력 중인 내용을 따로 보관한 뒤 새로고침해 주세요. 기존 저장 내용은 덮어쓰지 않았습니다.');return false;}
    const text=JSON.stringify(db);localStorage.setItem(KEY,text);storageRaw=text;saveFailed=false;$('#storageNotice').hidden=true;$('#saveStatus').textContent=trip?'✓ 이 기기에 저장됨':'';return true;
  }catch{storageMessage('저장 공간이 부족하거나 브라우저가 저장을 허용하지 않습니다. 변경은 적용하지 않았습니다. 기존 여행은 유지됩니다. 입력창 내용은 닫기 전에 따로 보관해 주세요.');return false;}
}
function refocus(...selectors){for(const s of [...selectors,'#panelContent h2']){const el=document.querySelector(s);if(el){el.focus?.();return;}}}
function saveDayField(key,value){const previous=day()[key];day()[key]=value;if(!persist()){day()[key]=previous;toast('저장하지 못해 이전 설정을 유지했어요.');}renderPanel();}
function reorderVisit(uid,delta){const visits=day().visits,i=visits.findIndex(v=>v.uid===uid),j=i+delta;if(i<0||j<0||j>=visits.length)return;[visits[i],visits[j]]=[visits[j],visits[i]];if(!persist()){[visits[i],visits[j]]=[visits[j],visits[i]];toast('순서를 저장하지 못했어요. 이전 순서를 유지합니다.');return;}render();refocus(`[data-reorder="${uid}"][data-delta="${delta}"]:not(:disabled)`,`[data-reorder="${uid}"]:not(:disabled)`);}
function deleteVisit(uid){const visits=day().visits,index=visits.findIndex(v=>v.uid===uid);if(index<0)return;const [visit]=visits.splice(index,1);if(!persist()){visits.splice(index,0,visit);toast('삭제를 저장하지 못했어요. 방문은 유지됩니다.');return;}undoState={tripId:trip.id,day:dayIndex,index,visit};render();refocus();toast('일정에서 삭제했어요.',true);}
function toast(msg,undo=false){clearTimeout(toastTimer);$('#toast span').textContent=msg;$('#undo').hidden=!undo;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),undo?9000:3000)}
function dateText(index){if(!trip.date)return '날짜 미정';const d=new Date(trip.date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+index);return `${d.getUTCMonth()+1}.${d.getUTCDate()}`}
function dayOptions(selected=dayIndex){return trip.days.map((d,i)=>`<option value="${i}" ${i===selected?'selected':''}>Day ${i+1} · ${dateText(i)}</option>`).join('')}
function welcome(){
  trip=null;$('#welcome').hidden=false;$('#workspace').hidden=true;$('#export').hidden=true;$('#saveStatus').textContent='';
  const active=db.trips.filter(t=>!t.deletedAt),deleted=db.trips.filter(t=>t.deletedAt);
  $('#recent').innerHTML='<h3>작성 중인 여행</h3>'+(active.length?active.slice().reverse().map(t=>`<div class="recent-row"><button class="recent-trip" data-open="${esc(t.id)}"><span>${esc(t.name)}<br><small>${destinations[t.city].name} · ${t.days.length}일 · ${memoryMode?'이 화면에서만 보관':'이 기기에 저장됨'}</small></span><span>↗</span></button><button class="trip-delete" data-remove-trip="${esc(t.id)}" aria-label="${esc(t.name)} 여행 삭제">삭제</button></div>`).join(''):'<p class="hint">작성 중인 여행이 없어요. 새 여행을 만들어 보세요.</p>')+(deleted.length?`<details class="deleted-trips"><summary>삭제한 여행 ${deleted.length}개</summary><p class="hint">삭제한 여행은 이 브라우저에 보관됩니다. 복원하면 일정과 숙소 메모를 다시 볼 수 있어요.</p>${deleted.slice().reverse().map(t=>`<div class="recent-row"><span class="deleted-name">${esc(t.name)}<small>${destinations[t.city].name} · ${t.days.length}일</small></span><button data-restore-trip="${esc(t.id)}" aria-label="${esc(t.name)} 여행 복원">복원</button></div>`).join('')}</details>`:'');
}
let pendingTripDelete=null;
function requestTripDelete(id){const target=db.trips.find(t=>t.id===id&&!t.deletedAt);if(!target)return;pendingTripDelete=id;$('#deleteTripName').textContent=target.name;$('#deleteTripError').textContent='';$('#deleteTrip').showModal();}
$('#confirmTripDelete').onclick=()=>{
  const target=db.trips.find(t=>t.id===pendingTripDelete&&!t.deletedAt);if(!target)return;
  const previousActive=db.active;target.deletedAt=new Date().toISOString();if(db.active===target.id)db.active=null;
  if(!persist()){delete target.deletedAt;db.active=previousActive;$('#deleteTripError').textContent='삭제 내용을 저장하지 못했어요. 여행은 그대로 유지됩니다.';return;}
  pendingTripDelete=null;$('#deleteTrip').close();welcome();toast('여행을 삭제했어요. 삭제한 여행에서 복원할 수 있어요.');
};
function restoreTrip(id){const target=db.trips.find(t=>t.id===id&&t.deletedAt);if(!target)return;const stamp=target.deletedAt;delete target.deletedAt;if(!persist()){target.deletedAt=stamp;toast('복원을 저장하지 못했어요. 다시 시도해 주세요.');return;}welcome();toast('여행과 일정을 복원했어요.');}

function openTrip(id){trip=db.trips.find(t=>t.id===id&&!t.deletedAt);if(!trip)return;db.active=id;dayIndex=0;view='plan';query='';filter='전체';undoState=null;$('#toast').classList.remove('show');$('#welcome').hidden=true;$('#workspace').hidden=false;$('#export').hidden=false;$('#workspace').classList.remove('mobile-map');$('#mobileView').textContent='지도 보기';$('#saveStatus').textContent=saveFailed?'저장되지 않음':'✓ 이 기기에 저장됨';render();initMap();}
$('#createForm').onsubmit=e=>{e.preventDefault();const id=crypto.randomUUID?crypto.randomUUID():'trip-'+Date.now();const cityId=$('#tripCity').value,n=tripDateCount($('#tripDate').value,$('#tripEndDate').value);const t={id,city:cityId,name:$('#tripName').value.trim()||`${destinations[cityId].name} ${n-1}박 ${n}일`,date:$('#tripDate').value,days:Array.from({length:n},newDay),hotel:null};db.trips.push(t);if(!persist()){db.trips.pop();$('#createError').textContent='여행을 저장하지 못했어요. 입력 내용은 그대로 남아 있습니다.';return;}$('#createError').textContent='';openTrip(id);toast('새 여행을 만들었어요. 첫 장소를 담아 보세요.');};
$('#tripCity').onchange=()=>{$('#tripName').placeholder=`${destinations[$('#tripCity').value].name} 3박 4일`};
function render(){if(!trip)return;$('#tripTitle').textContent=trip.name;$('#tripMeta').textContent=`${trip.days.length-1}박 ${trip.days.length}일 · ${trip.date?trip.date+' ~ '+tripEndDate(trip.date,trip.days.length):'날짜 미정'} · 현지 시간 기준`;$('#cityLabel').textContent=`${city().en} / ${city().country}`;$('#mapCity').textContent=`${city().name}, ${city().country}`;$('#days').innerHTML=trip.days.map((d,i)=>`<button data-day="${i}" class="${i===dayIndex?'active':''}" aria-current="${i===dayIndex?'date':'false'}">Day ${i+1}<small>${dateText(i)}</small></button>`).join('');$('.tabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.panel===view)));renderPanel();updateMap();}
function locationNote(p){return p.custom?'<p class="location-note">직접 추가 · '+(p.coord?'위치 등록됨':'위치 미등록')+'<br>'+esc(p.address||'위치 메모 없음')+'</p>':''}
function visitNote(v){return typeof v.note==='string'&&v.note?`<p class="visit-note">${esc(v.note)}</p>`:''}
function hotelCard(){return `<div class="hotel-card"><span aria-hidden="true">⌂</span><div><b>${esc(trip.hotel?.name||'머물 곳을 정해볼까요?')}</b><p>${esc(trip.hotel?.address||'숙소 이름과 주소를 메모해 두세요.')}</p></div><button data-hotel>${trip.hotel?'수정':'등록'}</button></div>`}
let editingLeg=null;
const modeName=()=>day().mode==='walk'?'도보':'대중교통';
function legRow(rows,i,editable){
  const a=place(rows[i-1].place),b=place(rows[i].place),v=rows[i],same=v.legSource==='same';
  const text=same?'같은 장소':v.leg===null?'이동시간 미확인':modeName()+' '+v.leg+'분 · 직접 입력';
  const link=same?'':'<a href="'+esc(directionsUrl(a,b,day().mode))+'" target="_blank" rel="noopener noreferrer" aria-label="'+esc(a.name)+'에서 '+esc(b.name)+'까지 '+modeName()+' 길찾기">길찾기 ↗</a>';
  let tools='';
  if(editable&&!same){
    const label=esc(a.name)+'에서 '+esc(b.name)+'까지 이동시간';
    tools=editingLeg===i?'<span class="leg-editor"><input id="legMinutes" type="number" inputmode="numeric" min="0" max="1440" step="1" value="'+(v.legSource==='manual'?v.leg:'')+'" aria-label="'+label+'(분)"><button data-leg-save="'+i+'">저장</button>'+(v.legSource==='manual'?'<button data-leg-clear="'+i+'">지우기</button>':'')+'<button data-leg-cancel="'+i+'">취소</button></span><span id="legError" role="alert"></span>'
      :'<button data-leg="'+i+'" aria-label="'+label+' '+(v.legSource==='manual'?'수정':'입력')+'">'+(v.legSource==='manual'?'시간 수정':'시간 입력')+'</button>';
  }
  return '<div class="leg '+(v.leg===null?'bad':'')+'"><span>'+text+'</span>'+link+tools+'</div>';
}
function saveLeg(i,value){
  const d=day(),a=d.visits[i-1],b=d.visits[i];if(!a||!b)return;
  const key=legKey(d.mode,a,b),previous=d.legs?{...d.legs}:undefined,next={...(d.legs||{})};
  if(value===null)delete next[key];else next[key]=value;
  if(Object.keys(next).length)d.legs=next;else delete d.legs;
  if(!persist()){if(previous)d.legs=previous;else delete d.legs;toast('이동시간을 저장하지 못했어요. 이전 값을 유지합니다.');return;}
  editingLeg=null;render();refocus('[data-leg="'+i+'"]');toast(value===null?'이동시간을 지웠어요.':'이동시간을 저장했어요.');
}
function submitLeg(i){const raw=$('#legMinutes').value.trim(),n=Number(raw);if(raw===''||!Number.isInteger(n)||n<0||n>1440){$('#legError').textContent='0~1440 사이의 분을 정수로 입력해 주세요.';return;}saveLeg(i,n);}
let editingExpense=null,pendingExpenseDelete=null;
const expenseDefaultDay=()=>travelDayInfo(trip).index??dayIndex;
function renderExpenses(){
  const list=trip.expenses||[],rates=trip.exchangeRate||{},totals=expenseTotals(list,rates),editing=list.find(x=>x.id===editingExpense),home=cityCurrency(city());
  const currency=editing?.currency||home,day=editing?.day??expenseDefaultDay(),category=editing?.category||'food';
  const rateCurrencies=Object.keys(CURRENCIES).filter(c=>c!=='KRW'&&(totals.byCurrency[c]||c===home));
  const options=(map,selected)=>Object.entries(map).map(([k,v])=>'<option value="'+k+'"'+(k===selected?' selected':'')+'>'+v+'</option>').join('');
  const days=trip.days.map((_,i)=>i).filter(i=>totals.byDay[i]);
  $('#panelContent').innerHTML='<div class="expenses"><div class="panel-heading"><h2 tabindex="-1">여행 경비</h2><span>'+list.length+'건</span></div>'
   +(list.length?'<section class="expense-summary"><p class="expense-total">'+formatTotals(totals.byCurrency)+'</p><p class="hint">'+(totals.krw!==null?'약 '+formatMoney(totals.krw,'KRW')+' · 입력한 환율 기준 추정':'환율을 입력하면 원화 합계를 추정해 드려요.')+'</p><ul class="expense-categories">'+Object.entries(EXPENSE_CATEGORIES).filter(([k])=>totals.byCategory[k]).map(([k,v])=>'<li><span>'+v+'</span><b>'+formatTotals(totals.byCategory[k])+'</b></li>').join('')+'</ul></section>':'')
   +(rateCurrencies.length?'<details class="expense-rates"'+(list.length&&totals.krw===null?' open':'')+'><summary>원화 환산 환율</summary>'+rateCurrencies.map(c=>'<label>1 '+CURRENCIES[c].label+' =<input id="rate-'+c+'" type="number" inputmode="decimal" min="0" step="any" value="'+(rates[c]??'')+'" aria-label="1 '+CURRENCIES[c].label+'당 원화"> 원</label>').join('')+'</details>':'')
   +'<form id="expenseForm" class="expense-form"><label>날짜<select id="expenseDay">'+dayOptions(day)+'</select></label><div class="expense-amount"><label>금액<input id="expenseAmount" inputmode="decimal" autocomplete="off" placeholder="0"></label><label>통화<select id="expenseCurrency">'+options(Object.fromEntries(Object.entries(CURRENCIES).map(([k,v])=>[k,v.symbol+' '+v.label])),currency)+'</select></label></div><label>분류<select id="expenseCategory">'+options(EXPENSE_CATEGORIES,category)+'</select></label><label>메모 (선택)<input id="expenseNote" maxlength="100" placeholder="예: 우동 2인분"></label><p id="expenseError" role="alert"></p><div class="dialog-actions">'+(editing?'<button type="button" data-expense-cancel="1">취소</button>':'')+'<button class="primary" type="submit">'+(editing?'수정 저장':'추가')+'</button></div></form>'
   +(list.length?days.map(i=>'<section class="expense-day"><h3>Day '+(i+1)+' · '+dateText(i)+'<span>'+formatTotals(totals.byDay[i])+'</span></h3>'+list.filter(x=>x.day===i).map(x=>'<div class="expense-row'+(x.id===editingExpense?' editing':'')+'"><span class="expense-cat">'+EXPENSE_CATEGORIES[x.category]+'</span><b>'+formatMoney(x.amount,x.currency)+'</b><span class="expense-note">'+esc(x.note||'')+'</span><span class="expense-tools"><button data-expense-edit="'+x.id+'" aria-label="'+EXPENSE_CATEGORIES[x.category]+' '+formatMoney(x.amount,x.currency)+' 수정">수정</button><button class="delete" data-expense-delete="'+x.id+'">'+(pendingExpenseDelete===x.id?'정말 삭제':'삭제')+'</button></span></div>').join('')+'</section>').join(''):'<p class="empty">아직 기록한 경비가 없어요. 위에서 첫 경비를 추가해 보세요.</p>')
   +'</div>';
  $('#expenseForm').onsubmit=e=>{e.preventDefault();submitExpense();};
  for(const c of rateCurrencies)$('#rate-'+c).onchange=()=>saveRate(c);
  $('#expenseAmount').value=editing?String(editing.amount):'';$('#expenseNote').value=editing?.note||'';
}
function submitExpense(){
  const fail=m=>{$('#expenseError').textContent=m;};
  const raw=$('#expenseAmount').value.trim().replace(/,/g,''),amount=Number(raw),currency=$('#expenseCurrency').value,category=$('#expenseCategory').value,day=Number($('#expenseDay').value),note=$('#expenseNote').value.trim(),info=CURRENCIES[currency];
  if(!raw||!Number.isFinite(amount)||amount<=0)return fail('금액을 0보다 큰 숫자로 입력해 주세요.');
  if(info&&Math.abs(Math.round(amount*10**info.decimals)-amount*10**info.decimals)>1e-6)return fail(info.decimals?'소수는 둘째 자리까지 입력해 주세요.':info.label+' 금액은 소수 없이 입력해 주세요.');
  const editing=(trip.expenses||[]).find(x=>x.id===editingExpense);
  const entry={id:editing?.id||(crypto.randomUUID?crypto.randomUUID():'x-'+Date.now().toString(36)),day,amount,currency,category,...(note?{note}:{}),createdAt:editing?.createdAt||new Date().toISOString()};
  if(!validExpense(entry,trip.days.length))return fail('날짜와 금액(1억 이하), 메모(100자 이내)를 확인해 주세요.');
  if(!editing&&(trip.expenses||[]).length>=2000)return fail('여행 하나에 경비는 2,000건까지 기록할 수 있어요.');
  const previous=trip.expenses;trip.expenses=editing?previous.map(x=>x.id===entry.id?entry:x):[...(previous||[]),entry];
  if(!persist()){if(previous===undefined)delete trip.expenses;else trip.expenses=previous;return fail('저장하지 못했어요. 입력한 내용은 그대로 남아 있어요.');}
  editingExpense=null;pendingExpenseDelete=null;renderExpenses();$('#expenseDay').value=String(day);$('#expenseCurrency').value=currency;$('#expenseCategory').value=category;
  toast(editing?'경비를 수정했어요.':formatMoney(amount,currency)+' 경비를 추가했어요.');
}
function saveRate(c){
  const raw=$('#rate-'+c).value.trim(),rate=Number(raw),previous=trip.exchangeRate,next={...(previous||{})};
  if(raw==='')delete next[c];else if(!(rate>0&&rate<=100000)){toast('환율은 0보다 큰 숫자로 입력해 주세요.');return;}else next[c]=rate;
  if(Object.keys(next).length)trip.exchangeRate=next;else delete trip.exchangeRate;
  if(!persist()){if(previous)trip.exchangeRate=previous;else delete trip.exchangeRate;toast('환율을 저장하지 못했어요.');return;}
  renderExpenses();
}
function deleteExpense(id){
  if(pendingExpenseDelete!==id){pendingExpenseDelete=id;renderExpenses();refocus('[data-expense-delete="'+id+'"]');return;}
  const previous=trip.expenses;trip.expenses=previous.filter(x=>x.id!==id);if(!trip.expenses.length)delete trip.expenses;
  if(!persist()){trip.expenses=previous;toast('삭제하지 못했어요. 경비는 그대로 있어요.');return;}
  pendingExpenseDelete=null;if(editingExpense===id)editingExpense=null;renderExpenses();refocus();toast('경비를 삭제했어요.');
}
function renderPanel(){const el=$('#panelContent');if(view==='today'){renderDayView();return}if(view==='expenses'){renderExpenses();return}if(view==='search'){renderSearch();return}const tl=buildTimeline(day());if(view==='timeline'){renderTimeline(tl);return}el.innerHTML=hotelCard()+unassignedCard()+`<div class="panel-heading"><h2 tabindex="-1">Day ${dayIndex+1}의 발자국</h2><span>${day().visits.length}개의 장소</span></div>`+(day().visits.length?tl.rows.map((v,i)=>{const p=place(v.place);return `${i?legRow(tl.rows,i,false):''}<article class="stop"><span class="number">${i+1}</span><div class="stop-body"><button class="stop-name" data-detail="${p.id}">${esc(p.name)}</button><p>${esc(p.area)} · 체류 ${v.duration}분${v.fixed?' · '+esc(v.fixed)+' 고정':''}</p>${locationNote(place(v.place))}${visitNote(v)}<div class="stop-tools"><button data-reorder="${v.uid}" data-delta="-1" aria-label="${esc(p.name)} 위로" ${i===0?'disabled':''}>↑</button><button data-reorder="${v.uid}" data-delta="1" aria-label="${esc(p.name)} 아래로" ${i===tl.rows.length-1?'disabled':''}>↓</button><button data-edit="${v.uid}" aria-label="${esc(p.name)} 날짜·시간·메모 편집">날짜·시간·메모</button><button class="delete" data-delete="${v.uid}" aria-label="${esc(p.name)} 삭제">삭제</button></div></div></article>`}).join(''):`<div class="empty"><h3>아직 비어 있는 하루</h3><p>가고 싶은 곳을 하나씩 담아보세요.<br>나만의 여행이 여기서 시작됩니다.</p><button class="primary" data-panel="search">＋ 첫 장소 찾기</button></div>`)+`<div class="summary"><span>체류 ${tl.totalStay}분</span><span>${tl.complete?'이동 '+tl.totalMove+'분':'이동시간 미확인'}</span></div><button class="wide" data-panel="search">＋ 장소 추가 <span>→</span></button><div class="notice">이동시간은 시간표에서 구간마다 직접 입력합니다. 길찾기 ↗로 Google 지도에서 확인해 보세요.</div>${day().visits.length?'<button class="primary wide" data-panel="timeline">하루 시간표 확인 <span>→</span></button>':''}`;}
function renderSearch(resultsOnly=false){const q=query.trim().toLowerCase();const list=catalog().filter(p=>(filter==='전체'||p.cat===filter)&&`${p.name} ${p.area} ${p.en}`.toLowerCase().includes(q));const results=list.map(p=>`<article class="place-card"><button class="place-art" data-detail="${p.id}" style="--art:${p.color}" aria-label="${esc(p.name)} 상세"><span>${p.en}</span><b aria-hidden="true">${p.glyph}</b></button><div class="place-info"><div><h3>${esc(p.name)}</h3><small>${esc(p.area)} · ${p.cat}</small></div><button data-add="${p.id}" aria-label="${esc(p.name)} Day ${dayIndex+1}에 추가">＋</button></div></article>`).join('')||'<div class="empty"><h3>일치하는 예시 장소가 없어요.</h3><p>찾는 장소를 직접 입력해 일정에 담아보세요.</p><button data-clear-search>검색 초기화</button></div>';if(resultsOnly){$('#searchResults').innerHTML=results;$('#googleSearch').href=mapsSearchUrl(query,city().en);return;}$('#panelContent').innerHTML=`<div class="panel-heading"><h2>어디에 가볼까요?</h2><span>Day ${dayIndex+1}에 담기</span></div><div class="searchbox"><input id="searchInput" type="search" aria-label="예시 장소 검색" placeholder="예시 장소 이름으로 검색" value="${esc(query)}"></div><div class="filters">${['전체','문화','산책','쇼핑'].map(f=>`<button data-filter="${f}" class="${f===filter?'active':''}">${f}</button>`).join('')}</div><div class="hint">${city().name}의 예시 장소 ${catalog().length}곳 · 전체 장소 검색은 추후 연결됩니다.</div><form id="quickForm" class="google-search"><a id="googleSearch" href="${esc(mapsSearchUrl(query,city().en))}" target="_blank" rel="noopener noreferrer">① Google 지도에서 찾기 ↗</a><label>② 찾은 장소의 주소창 링크 붙여넣기<input id="quickLink" maxlength="2000" placeholder="https://www.google.com/maps/place/..." autocomplete="off"></label><div class="quick-row"><select id="quickDay" aria-label="담을 날짜">${dayOptions()}</select><button class="primary" type="submit">③ 이 날짜에 추가</button></div><p id="quickError" role="alert"></p></form><button class="wide manual-add" data-custom>＋ 검색에 없는 장소 직접 추가</button><div id="searchResults">${results}</div>`;$('#quickForm').onsubmit=e=>{e.preventDefault();quickAdd();};const input=$('#searchInput');let composing=false;
input.oncompositionstart=()=>{composing=true;};
input.oncompositionend=()=>{composing=false;query=input.value;renderSearch(true);};
input.oninput=e=>{query=input.value;if(composing||e.isComposing)return;renderSearch(true);};}

function renderTimeline(tl){$('#panelContent').innerHTML=`<div class="panel-heading"><h2>하루를 한눈에</h2><span>Day ${dayIndex+1}</span></div><div class="time-settings"><label>하루 시작<input id="startTime" type="time" value="${day().start}" required></label><label>이동수단<select id="travelMode"><option value="transit" ${day().mode==='transit'?'selected':''}>대중교통</option><option value="walk" ${day().mode==='walk'?'selected':''}>도보</option></select></label></div><div class="notice">구간마다 길찾기 ↗로 시간을 확인한 뒤 입력해 주세요. 입력하지 않은 구간은 미확인으로 남고, 그 뒤 시각도 미확인이 됩니다. 이동수단을 바꾸면 그 수단으로 입력한 값만 쓰입니다. 영업시간·예약 가능 여부는 확인하지 않습니다.</div>`+(tl.rows.length?tl.rows.map((v,i)=>{const p=place(v.place);return `${i?legRow(tl.rows,i,true):''}<div class="timeline-item"><span class="clock">${clockText(v.start)}</span><div><h3>${esc(p.name)}</h3><p>체류 ${v.duration}분${v.fixed?' · '+esc(v.fixed)+' 고정':''}</p>${locationNote(place(v.place))}${visitNote(v)}${v.late?`<p class="conflict">예상 도착이 고정 시각보다 ${v.late}분 늦어요.</p>`:''}${v.anchored?'<p class="conflict">앞 구간이 미확인이므로 도착 가능 여부를 확인해 주세요.</p>':''}<button data-edit="${v.uid}" aria-label="${esc(p.name)} 시간·메모 편집">시간·메모</button></div></div>`}).join('')+`<div class="timeline-total"><span>${tl.complete?'예상 종료 시각':'종료 시각 미확인'}</span><br><b>${tl.complete?clockText(tl.end):'—'}</b><p>체류 ${tl.totalStay}분 · ${tl.complete?'이동 '+tl.totalMove+'분':'이동시간 미확인 구간 있음'}<br>숙소 출발·복귀 이동은 포함하지 않았습니다.</p></div>`:'<div class="empty"><h3>시간표에 담을 장소가 없어요.</h3><button data-panel="search">장소 찾기</button></div>')+'<button class="wide" style="margin-top:16px" data-panel="plan">← 일정 편집으로</button>';$('#startTime').onchange=e=>{if(minutes(e.target.value)==null){e.target.value=day().start;return}saveDayField('start',e.target.value)};$('#travelMode').onchange=e=>{saveDayField('mode',e.target.value)};const legInput=$('#legMinutes');if(legInput){legInput.focus?.();legInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submitLeg(editingLeg);}};}}
function addPlace(id,index=dayIndex){if(!place(id)||!trip.days[index])return;trip.days[index].visits.push({uid:crypto.randomUUID?crypto.randomUUID():'v-'+Date.now(),place:id,duration:60,fixed:''});if(!persist()){trip.days[index].visits.pop();toast('장소를 저장하지 못했어요. 다시 시도해 주세요.');return false;}render();toast(`Day ${index+1}에 ${place(id).name}을 담았어요.`);return true;}
function detail(id){const p=place(id);if(!p)return;if(p.custom){customDetail(id);return;}detailId=id;$('#detailContent').innerHTML=`<span class="eyebrow">${p.en} / PLACE PREVIEW</span><h2 id="detailTitle">${esc(p.name)}</h2><div class="detail-meta"><span>${esc(p.area)}</span><span>${p.cat}</span><span>예시 장소</span></div><div class="detail-art" style="--art:${p.color}" aria-hidden="true">${p.glyph}</div><p>${esc(p.desc)}</p><p>운영시간 · 확인 필요<br>주소·사진·입구 정보는 아직 연결하지 않았습니다.</p><a href="https://www.google.com/maps/search/?api=1&query=${p.coord[1]},${p.coord[0]}" target="_blank" rel="noopener noreferrer">외부 지도에서 위치 확인 ↗</a><div class="detail-controls"><select id="detailDay" aria-label="장소를 추가할 날짜">${dayOptions()}</select><button class="primary" id="detailAdd">선택한 날짜에 추가</button></div><p class="hint">같은 장소를 다시 담으면 별도의 방문으로 추가됩니다.</p>`;$('#detailAdd').onclick=()=>{if(addPlace(detailId,Number($('#detailDay').value)))$('#detail').close()};$('#detail').showModal();if(map)map.flyTo({center:p.coord,zoom:15.5,pitch:db.three?50:0,duration:motion()});}
function editVisit(uid){const v=day().visits.find(v=>v.uid===uid);if(!v)return;$('#editId').value=uid;$('#editTitle').textContent=place(v.place).name;$('#editDay').innerHTML=dayOptions();$('#editDuration').value=v.duration;$('#editFixed').value=v.fixed;$('#editNote').value=v.note||'';$('#editError').textContent='';$('#edit').showModal();}
$('#editForm').onsubmit=e=>{
  e.preventDefault();const uid=$('#editId').value,index=day().visits.findIndex(v=>v.uid===uid);if(index<0)return;
  const target=Number($('#editDay').value),duration=Number($('#editDuration').value),fixed=$('#editFixed').value,note=$('#editNote').value.trim();
  if(!trip.days[target]||!Number.isInteger(duration)||duration<5||duration>720||(fixed&&minutes(fixed)===null)||note.length>1000){$('#editError').textContent='날짜·시간을 확인하고 메모는 1,000자 이내로 입력해 주세요.';return;}
  const previous=structuredClone(trip.days),v=day().visits[index];v.duration=duration;v.fixed=fixed;v.note=note;
  if(target!==dayIndex){day().visits.splice(index,1);trip.days[target].visits.push(v);}
  if(!persist()){trip.days=previous;$('#editError').textContent='저장하지 못했어요. 입력한 메모는 창에 남아 있으니 다시 시도해 주세요.';return;}
  $('#edit').close();render();refocus(`[data-edit="${uid}"]`);toast(target!==dayIndex?`Day ${target+1}로 메모와 함께 옮겼어요.`:'방문 정보와 메모를 저장했어요.');
};
$('#hotelForm').onsubmit=e=>{e.preventDefault();if(!$('#hotelName').value.trim())return;const previous=trip.hotel;trip.hotel={name:$('#hotelName').value.trim(),address:$('#hotelAddress').value.trim()};if(!persist()){trip.hotel=previous;$('#hotelError').textContent='숙소 메모를 저장하지 못했어요. 입력 내용은 남아 있습니다.';return;}$('#hotelError').textContent='';$('#hotel').close();render();toast('숙소 메모를 저장했어요.');};
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.leg){editingLeg=Number(b.dataset.leg);renderPanel();return}if(b.dataset.legSave){submitLeg(Number(b.dataset.legSave));return}if(b.dataset.legClear){saveLeg(Number(b.dataset.legClear),null);return}if(b.dataset.legCancel){const i=Number(b.dataset.legCancel);editingLeg=null;renderPanel();refocus('[data-leg="'+i+'"]');return}if(b.dataset.expenseEdit){editingExpense=b.dataset.expenseEdit;pendingExpenseDelete=null;renderExpenses();$('#expenseAmount').focus?.();return}if(b.dataset.expenseDelete){deleteExpense(b.dataset.expenseDelete);return}if(b.dataset.expenseCancel){editingExpense=null;renderExpenses();return}if(b.dataset.panel||b.dataset.day!==undefined){editingLeg=null;editingExpense=null;pendingExpenseDelete=null;}if(b.dataset.close){$('#'+b.dataset.close).close();return}if(b.dataset.removeTrip){requestTripDelete(b.dataset.removeTrip);return}if(b.dataset.restoreTrip){restoreTrip(b.dataset.restoreTrip);return}if(b.dataset.open){openTrip(b.dataset.open);return}if(!trip)return;if(b.dataset.panel){if(b.dataset.panel==='today'&&view!=='today'){const info=travelDayInfo(trip);if(info.index!==null)dayIndex=info.index;}view=b.dataset.panel;render();$('#panelContent').scrollTop=0}if(b.dataset.day!==undefined){dayIndex=Number(b.dataset.day);render()}if(b.dataset.filter){filter=b.dataset.filter;renderSearch()}if(b.hasAttribute('data-clear-search')){query='';filter='전체';renderSearch()}if(b.hasAttribute('data-custom'))openCustom();if(b.dataset.add)addPlace(b.dataset.add);if(b.dataset.detail)detail(b.dataset.detail);if(b.dataset.edit)editVisit(b.dataset.edit);if(b.dataset.assign)assignVisit(b.dataset.assign);if(b.dataset.reorder)reorderVisit(b.dataset.reorder,Number(b.dataset.delta));if(b.dataset.delete)deleteVisit(b.dataset.delete);if(b.hasAttribute('data-hotel')){$('#hotelError').textContent='';$('#hotelName').value=trip.hotel?.name||'';$('#hotelAddress').value=trip.hotel?.address||'';$('#hotel').showModal()}});
$('#undo').onclick=()=>{if(!undoState||trip?.id!==undoState.tripId)return;const target=trip.days[undoState.day];if(!target){toast('여행 기간이 바뀌어 실행 취소할 수 없어요.');return;}if(trip.days.some(d=>d.visits.some(v=>v.uid===undoState.visit.uid)))return;const index=Math.min(undoState.index,target.visits.length);target.visits.splice(index,0,undoState.visit);if(!persist()){target.visits.splice(index,1);toast('복원을 저장하지 못했어요. 다시 실행 취소할 수 있어요.',true);return;}undoState=null;render();toast('삭제한 방문을 복원했어요.');};
$('#home').onclick=welcome;$('#newTrip').onclick=welcome;$('#mobileView').onclick=()=>{const on=$('#workspace').classList.toggle('mobile-map');$('#mobileView').textContent=on?'일정 보기':'지도 보기';if(on)requestAnimationFrame(()=>map?.resize());};
$('#export').onclick=()=>{if(!trip)return;const custom=p=>p.custom?" [직접 추가 · "+(p.coord?'위치 등록됨':'위치 미등록')+"]\n주소/위치 메모: "+p.address:"";const text=[trip.name,`${city().name} · ${trip.date||'날짜 미정'} · ${trip.days.length}일`,'이동시간은 직접 입력한 값이며, 입력하지 않은 구간은 미확인입니다.',trip.hotel?`숙소: ${trip.hotel.name} / ${trip.hotel.address}`:'',...trip.days.map((d,i)=>`\nDay ${i+1}\n`+buildTimeline(d).rows.map((v,i)=>`${i?'  ↓ '+legLabel(v)+'\n':''}${clockText(v.start)} ${place(v.place).name}${custom(place(v.place))} (체류 ${v.duration}분)${v.note?"\n메모: "+v.note:""}`).join('\n')),...(trip.unassigned?.length?['\n미배정 장소',...trip.unassigned.map(v=>`${place(v.place).name}${custom(place(v.place))} (체류 ${v.duration}분${v.fixed?' · '+v.fixed+' 고정':''})${v.note?'\n메모: '+v.note:''}`)]:[]),...(trip.expenses?.length?['\n경비',...trip.days.map((d,i)=>{const xs=trip.expenses.filter(x=>x.day===i);return xs.length?'Day '+(i+1)+' · '+dateText(i)+'\n'+xs.map(x=>EXPENSE_CATEGORIES[x.category]+' '+formatMoney(x.amount,x.currency)+(x.note?' '+x.note:'')).join('\n'):'';}).filter(Boolean),'합계: '+formatTotals(expenseTotals(trip.expenses,trip.exchangeRate||{}).byCurrency)]:[])].join('\n');const u=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='ORBIT-시안-여행일정.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
function unassignedCard(){
  const visits=trip.unassigned||[];if(!visits.length)return '';
  return `<details class="unassigned" open><summary>미배정 장소 ${visits.length}곳</summary><p class="hint">기간을 줄이며 보관한 장소입니다. 날짜를 선택해 다시 담으세요.</p>${visits.map(v=>`<div class="held-visit"><b>${esc(place(v.place).name)}</b><p>이전 Day ${v.originalDay} · 체류 ${v.duration}분${v.fixed?' · '+esc(v.fixed)+' 고정':''}</p>${locationNote(place(v.place))}${visitNote(v)}<div class="held-actions"><select id="assign-${esc(v.uid)}" aria-label="${esc(place(v.place).name)} 배정 날짜">${dayOptions()}</select><button data-assign="${esc(v.uid)}" aria-label="${esc(place(v.place).name)} 일정에 다시 담기">다시 담기</button></div></div>`).join('')}</details>`;
}
function assignVisit(uid){
  const index=(trip.unassigned||[]).findIndex(v=>v.uid===uid);if(index<0)return;
  const target=Number(document.getElementById('assign-'+uid).value);if(!trip.days[target])return;
  const held=trip.unassigned[index];const {originalDay,...visit}=held;trip.unassigned.splice(index,1);trip.days[target].visits.push(visit);
  if(!persist()){trip.days[target].visits.pop();trip.unassigned.splice(index,0,held);toast('저장하지 못했어요. 미배정 장소에 그대로 보관됩니다.');return;}render();refocus();toast(`Day ${target+1}에 다시 담았어요. 고정 시각을 확인해 주세요.`);
}
function previewDateRange(prefix,fallback=4){
  const start=$('#'+prefix+'Date'),end=$('#'+prefix+'EndDate'),summary=$('#'+prefix+'DateSummary');
  end.min=start.value||'';end.setCustomValidity('');
  try{const count=tripDateCount(start.value,end.value,fallback);summary.textContent=(start.value?'':'날짜 미정 · ')+(count===1?'당일 여행':`${count-1}박 ${count}일`);return count;}
  catch(error){summary.textContent=error.message;end.setCustomValidity(error.message);return null;}
}
$('#tripDate').oninput=()=>previewDateRange('trip');$('#tripEndDate').oninput=()=>previewDateRange('trip');
function previewSettings(){
  const count=previewDateRange('settings',trip.days.length),valid=count!==null;
  const removed=valid?trip.days.slice(count):[],total=removed.reduce((n,d)=>n+d.visits.length,0);
  $('#settingsImpact').hidden=!total;$('#settingsOverflow').disabled=!total;$('#settingsOverflow').required=!!total;
  $('#settingsAffected').innerHTML=removed.map((d,i)=>d.visits.length?`<p><b>Day ${count+i+1} · ${dateText(count+i)}</b><br>${d.visits.map(v=>esc(place(v.place).name)).join(', ')}</p>`:'').join('');
  $('#settingsDateNote').hidden=$('#settingsDate').value===(trip.date||'');
  $('#settingsError').textContent='';
}
$('#tripSettings').onclick=()=>{
  $('#settingsName').value=trip.name;$('#settingsDate').value=trip.date||'';$('#settingsEndDate').value=tripEndDate(trip.date,trip.days.length);$('#settingsOverflow').value='';
  previewSettings();$('#settings').showModal();
};
$('#settingsEndDate').oninput=previewSettings;$('#settingsDate').oninput=previewSettings;
$('#settingsForm').onsubmit=e=>{
  e.preventDefault();try{
    const next=updateTripSettings(trip,{name:$('#settingsName').value,date:$('#settingsDate').value,dayCount:tripDateCount($('#settingsDate').value,$('#settingsEndDate').value,trip.days.length),overflow:$('#settingsOverflow').value});
    const previous=trip,index=db.trips.findIndex(t=>t.id===trip.id);db.trips[index]=next;trip=next;if(!persist()){db.trips[index]=previous;trip=previous;$('#settingsError').textContent='여행 정보를 저장하지 못했어요. 기존 기간과 일정을 유지합니다.';return;}dayIndex=Math.min(dayIndex,trip.days.length-1);undoState=null;pinSignature='';
    $('#settings').close();render();toast('여행 정보를 변경했어요.');
  }catch(error){$('#settingsError').textContent=error.message;}
};
function motion(){return matchMedia('(prefers-reduced-motion: reduce)').matches?0:650}
function initMap(){if(map){map.resize();updateMap();return}try{if(!window.maplibregl)throw Error();map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/bright',center:city().center,zoom:city().zoom,pitch:db.three?50:0,bearing:0});map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');map.on('load',()=>{const style=map.getStyle(),source=Object.keys(style.sources).find(k=>style.sources[k].type==='vector');if(source&&!style.layers.some(l=>l.type==='fill-extrusion'))map.addLayer({id:'orbit-buildings',source,'source-layer':'building',type:'fill-extrusion',minzoom:14.5,layout:{visibility:db.three?'visible':'none'},paint:{'fill-extrusion-color':'#bfccb4','fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':0.9}},style.layers.find(l=>l.type==='symbol')?.id);map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'visit-line',source:'route',type:'line',paint:{'line-color':'#cc8a5d','line-width':3,'line-dasharray':[2,2]}});mapReady=true;$('#mapStatus').hidden=true;applyDimension();updateMap()});map.on('error',()=>{if(!mapReady){$('#mapStatus').hidden=false;$('#mapStatus').textContent='지도 연결을 기다리고 있어요. 일정 편집은 계속할 수 있습니다.'}});setTimeout(()=>{if(!mapReady){$('#mapStatus').hidden=false;$('#mapStatus').textContent='지도 연결이 지연되고 있습니다. 인터넷 연결을 확인해 주세요.'}},15000)}catch{$('#mapStatus').hidden=false;$('#mapStatus').textContent='지도를 열 수 없습니다. 일정 편집과 시간표는 계속 사용할 수 있어요.'}}
function applyDimension(zoomIn=false){if(!mapReady)return;map.getStyle().layers.filter(l=>l.type==='fill-extrusion').forEach(l=>map.setLayoutProperty(l.id,'visibility',db.three?'visible':'none'));map.easeTo({pitch:db.three?50:0,...(zoomIn&&db.three&&map.getZoom()<14.5?{zoom:14.7}:{}),duration:motion()});$('#dimension').textContent=db.three?'2D로 보기':'3D 켜기';$('#dimension').setAttribute('aria-pressed',String(db.three));}
$('#dimension').onclick=()=>{db.three=!db.three;if(!persist()){db.three=!db.three;toast('지도 설정을 저장하지 못했어요.');return;}applyDimension(true);};
function updateMap(){if(!trip)return;const missing=day().visits.filter(v=>!place(v.place)?.coord).length;$('#mapMissing').textContent=missing?'위치 미등록 '+missing+'곳 · 지도 표시와 연결선에서 제외됩니다.':'';$('#mapMissing').hidden=!missing;if(!mapReady)return;if(mapCity!==trip.city){mapCity=trip.city;pins.forEach(m=>m.remove());pins.clear();pinSignature='';map.jumpTo({center:city().center,zoom:city().zoom,pitch:db.three?50:0});}const shown=[...catalog(),...(trip.customPlaces||[]).map(c=>place(c.id)).filter(p=>p.coord)];const signature=trip.id+':'+day().visits.map(v=>v.place).join(',')+':'+shown.filter(p=>p.custom).map(p=>p.id+'@'+p.coord).join(',');if(signature===pinSignature)return;pinSignature=signature;const ids=new Set(shown.map(p=>p.id));pins.forEach((m,id)=>{if(!ids.has(id)){m.remove();pins.delete(id);}});shown.forEach(p=>{let marker=pins.get(p.id);if(!marker){const el=document.createElement('button');el.className='pin';el.onclick=()=>detail(p.id);marker=new maplibregl.Marker({element:el}).setLngLat(p.coord).addTo(map);pins.set(p.id,marker)}marker.setLngLat(p.coord);marker.getElement().setAttribute('aria-label',p.name+' 지도 상세');marker.getElement().classList.toggle('custom-pin',!!p.custom);const nums=day().visits.map((v,i)=>v.place===p.id?i+1:null).filter(Boolean),el=marker.getElement();el.textContent=(nums.length?nums.join('·')+' ':'')+p.name;el.classList.toggle('chosen',nums.length>0)});map.getSource('route').setData({type:'FeatureCollection',features:routeFeatures(day().visits,place)});}
$('#fit').onclick=()=>{if(!mapReady)return;const coords=day().visits.map(v=>place(v.place).coord).filter(Boolean);if(!coords.length){map.flyTo({center:city().center,zoom:city().zoom,pitch:db.three?50:0,duration:motion()});return}const bounds=new maplibregl.LngLatBounds(coords[0],coords[0]);coords.forEach(c=>bounds.extend(c));map.fitBounds(bounds,{padding:{top:90,bottom:140,left:60,right:60},maxZoom:16,duration:motion()})};
welcome();




function openCustom(){
  $('#customForm').reset();$('#customName').value=query.trim().slice(0,80);$('#customDay').innerHTML=dayOptions();$('#customError').textContent='';$('#custom').showModal();
}
function addCustomPlace(name,address,coord,index){
  const id='custom-'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),p={id,name,address,...(coord?{coord}:{})};
  if(!validCustomPlace(p)||!trip.days[index])return '장소 이름은 1~80자, 주소 또는 위치 메모는 300자 이내로 입력해 주세요.';
  const previous=trip.customPlaces;trip.customPlaces=[...(previous||[]),p];trip.days[index].visits.push({uid:id+'-visit',place:id,duration:60,fixed:'',note:''});
  if(!persist()){trip.days[index].visits.pop();if(previous===undefined)delete trip.customPlaces;else trip.customPlaces=previous;return '저장하지 못했어요. 입력 내용은 남아 있으니 다시 시도해 주세요.';}
  dayIndex=index;view='plan';render();toast(placedMessage(coord));return '';
}
const placedMessage=coord=>!coord?'선택한 날짜에 장소를 담았어요. 지도 위치는 미등록 상태입니다.':farFromCity(coord)?'장소를 담았어요. 여행 도시와 멀리 떨어진 위치이니 링크를 확인해 주세요.':'장소를 담고 지도에 위치를 표시했어요.';
function quickAdd(){
  const link=$('#quickLink').value.trim(),coord=parseLocation(link),name=placeNameFromLink(link),index=Number($('#quickDay').value);
  if(!coord){$('#quickError').textContent='지도 위치를 읽지 못했어요. 브라우저에서 연 긴 Google 지도 주소를 복사하거나 33.59, 130.40처럼 위도, 경도를 입력해 주세요.';return;}
  if(!name){openCustom();$('#customLocation').value=link;$('#customDay').value=String(index);$('#customError').textContent='링크에서 장소 이름을 찾지 못했어요. 이름을 입력해 주세요.';return;}
  const existing=(trip.customPlaces||[]).find(p=>p.name===name&&p.coord?.[0]===coord[0]&&p.coord?.[1]===coord[1]);
  if(existing){if(addPlace(existing.id,index)){dayIndex=index;view='plan';render();}return;}
  const error=addCustomPlace(name,'',coord,index);if(error)$('#quickError').textContent=error;
}
$('#customForm').onsubmit=e=>{
  e.preventDefault();const name=$('#customName').value.trim(),address=$('#customAddress').value.trim(),index=Number($('#customDay').value);
  const location=$('#customLocation').value.trim(),coord=location?parseLocation(location):undefined;
  if(coord===null){$('#customError').textContent='지도 위치를 읽지 못했어요. 브라우저에서 연 긴 Google 지도 주소를 복사하거나 33.59, 130.40처럼 위도, 경도를 입력해 주세요.';return;}
  const error=addCustomPlace(name,address,coord,index);if(error){$('#customError').textContent=error;return;}
  $('#custom').close();
};
const farFromCity=coord=>distanceKm(city().center,coord)>50;
function saveCustomCoord(id,coord){
  const previous=trip.customPlaces;trip.customPlaces=previous.map(p=>p.id!==id?p:coord?{...p,coord}:(({coord,...rest})=>rest)(p));
  if(!persist()){trip.customPlaces=previous;$('#customCoordError').textContent='위치를 저장하지 못했어요. 이전 상태를 유지합니다.';return;}
  $('#detail').close();render();toast(!coord?'지도 위치를 지웠어요.':farFromCity(coord)?'위치를 저장했어요. 여행 도시와 멀리 떨어진 위치이니 확인해 주세요.':'지도에 위치를 표시했어요.');
}
function customDetail(id){
  const p=place(id);$('#detailContent').innerHTML='<span class="eyebrow">MY PLACE</span><h2 id="detailTitle">'+esc(p.name)+'</h2>'+locationNote(p)+'<label>지도 링크 또는 좌표<input id="customCoord" maxlength="2000" value="'+(p.coord?p.coord[1]+', '+p.coord[0]:'')+'" placeholder="Google 지도 링크 또는 33.59, 130.40"></label><p class="hint">주소 메모는 좌표로 바꾸지 않습니다. 지도 링크나 좌표를 넣어야 핀과 연결선에 표시됩니다.</p><p id="customCoordError" role="alert"></p><div class="dialog-actions">'+(p.coord?'<button id="customCoordClear">위치 지우기</button>':'')+'<button id="customCoordSave">위치 저장</button></div><div class="detail-controls"><select id="detailDay" aria-label="장소를 추가할 날짜">'+dayOptions()+'</select><button class="primary" id="detailAdd">선택한 날짜에 추가</button></div><p class="hint">같은 장소를 별도의 방문으로 다시 담습니다.</p>';
  $('#detailAdd').onclick=()=>{if(addPlace(id,Number($('#detailDay').value)))$('#detail').close();};
  $('#customCoordSave').onclick=()=>{const coord=parseLocation($('#customCoord').value);if(!coord){$('#customCoordError').textContent='지도 위치를 읽지 못했어요. 브라우저에서 연 긴 Google 지도 주소를 복사하거나 33.59, 130.40처럼 위도, 경도를 입력해 주세요.';return;}saveCustomCoord(id,coord);};
  if(p.coord)$('#customCoordClear').onclick=()=>saveCustomCoord(id,null);
  $('#detail').showModal();
}

$('#printOpen').onclick=()=>openPrint();
$('#printScope').onchange=()=>updatePrintPreview();
$('#printNotes').onchange=()=>updatePrintPreview();
$('#printRun').onclick=()=>{updatePrintPreview();$('#printDialog').close();window.print();};
window.addEventListener?.('beforeprint',()=>{if(!trip){$('#printSheet').innerHTML='';return;}updatePrintPreview();});
window.addEventListener?.('focus',()=>{if(trip&&view==='today')renderDayView();});
let pendingBackup=null,backupReadId=0;
$('#backupOpen').onclick=()=>{
  backupReadId++;pendingBackup=null;$('#backupFile').value='';$('#backupPreview').hidden=true;$('#backupPreview').textContent='';$('#backupMessage').textContent='';$('#backupRestore').disabled=true;
  $('#backupCount').textContent=`작성 중 ${db.trips.filter(t=>!t.deletedAt).length}개 · 삭제 보관 ${db.trips.filter(t=>t.deletedAt).length}개`;
  $('#backupDownload').disabled=!db.trips.length;$('#backup').showModal();
};
$('#phoneExport').onclick=async()=>{
  $('#backupMessage').textContent='휴대폰용 파일을 만들고 있어요…';
  try{
    const get=async f=>{const r=await fetch(f,{cache:'no-store'});if(!r.ok)throw Error(f);return r.text();},files=['destinations.js','core.js','day-view.js','app.js'];
    const [index,style,...texts]=await Promise.all(['index.html','style.css',...files].map(get));
    const html=phoneHtml({index,style,scripts:Object.fromEntries(files.map((f,i)=>[f,texts[i]]))},{trips:db.trips,active:null,three:db.three},new Date().toISOString());
    const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='ORBIT-휴대폰-'+new Date().toISOString().slice(0,10)+'.html';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('#backupMessage').textContent='휴대폰용 HTML을 내려받았어요. 카카오톡 나에게 보내기나 드라이브로 휴대폰에 옮긴 뒤 Chrome으로 여세요. 일정을 고치면 다시 만들어 보내면 돼요.';
  }catch{$('#backupMessage').textContent='휴대폰용 파일은 PC에서 로컬 서버 주소(http://127.0.0.1:4173)로 연 ORBIT에서 만들 수 있어요.';}
};
$('#backup').addEventListener('close',()=>{backupReadId++;pendingBackup=null;});
$('#backupDownload').onclick=()=>{
  try{
    const texts=createBackups(db.trips,destinations),name='ORBIT-여행백업-'+new Date().toISOString().slice(0,10);
    const save=(text,i)=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name+(texts.length>1?`-${i+1}of${texts.length}`:'')+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    texts.forEach((text,i)=>i?setTimeout(()=>save(text,i),i*500):save(text,i));
    $('#backupMessage').textContent=texts.length>1?`여행이 많아 백업을 ${texts.length}개 파일로 나눠 내려받아요. 브라우저가 여러 파일 다운로드를 물으면 허용해 주세요. 복원할 때는 모든 파일을 하나씩 복원해야 합니다.`:'백업 다운로드를 요청했어요. 브라우저의 다운로드 목록에서 파일을 확인해 주세요.';
  }catch(error){$('#backupMessage').textContent=error.message;}
};
$('#backupFile').onchange=async()=>{
  const readId=++backupReadId,file=$('#backupFile').files[0];pendingBackup=null;$('#backupRestore').disabled=true;$('#backupPreview').hidden=true;$('#backupMessage').textContent='';if(!file)return;
  try{
    if(file.size>BACKUP_MAX_BYTES)throw new Error('5MB 이하의 백업 파일을 선택해 주세요.');
    $('#backupMessage').textContent='백업을 확인하고 있어요…';const text=await file.text();if(readId!==backupReadId)return;
    pendingBackup=readBackup(text,destinations);
    $('#backupPreview').innerHTML=`<h3>복원할 여행 ${pendingBackup.length}개</h3><ul>${pendingBackup.map(t=>`<li><b>${esc(t.name)}</b><br>${esc(destinations[t.city].name)} · ${t.days.length}일 · ${t.date||'날짜 미정'}${t.deletedAt?' · 삭제 보관':''}</li>`).join('')}</ul>`;
    $('#backupPreview').hidden=false;$('#backupRestore').disabled=false;$('#backupMessage').textContent='목록을 확인한 뒤 복원 버튼을 눌러 주세요.';
  }catch(error){if(readId===backupReadId)$('#backupMessage').textContent=error.message;}
};
$('#backupRestore').onclick=()=>{
  if(!pendingBackup)return;
  const previous=db,count=pendingBackup.length;
  let serial=0;const stamp=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  db=appendBackup(db,pendingBackup,()=>crypto.randomUUID?crypto.randomUUID():'restore-'+stamp+'-'+serial++);
  if(!persist()){db=previous;$('#backupMessage').textContent='저장 공간이 부족하거나 저장할 수 없어요. 기존 여행은 유지되고 복원은 적용되지 않았습니다.';return;}
  pendingBackup=null;$('#backupRestore').disabled=true;$('#backup').close();welcome();toast(`${count}개 여행을 복원했어요. 같은 이름의 여행도 별도로 추가됩니다.`);
};
