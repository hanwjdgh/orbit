const $=s=>document.querySelector(s),KEY='orbit-interactive-prototype-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db={trips:[],active:null,three:false},trip=null,dayIndex=0,view='plan',query='',filter='전체',detailId=null,undoState=null,map=null,mapReady=false,mapCity=null;
const pins=new Map();let pinSignature='',toastTimer;
try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved&&Array.isArray(saved.trips)){db.trips=saved.trips.filter(t=>t&&typeof t.id==='string'&&typeof t.name==='string'&&destinations[t.city]?.spots&&Array.isArray(t.days)&&t.days.length>=1&&t.days.length<=14&&t.days.every(d=>d&&Array.isArray(d.visits)&&d.visits.every(v=>v&&typeof v.uid==='string'&&(destinations[t.city].catalog.some(p=>p.id===v.place)||(Array.isArray(t.customPlaces)&&t.customPlaces.some(p=>validCustomPlace(p)&&p.id===v.place)))&&Number.isFinite(v.duration)&&v.duration>=5&&v.duration<=720)));db.active=saved.active;db.three=saved.three===true;}}catch{}
const city=()=>destinations[trip?.city||'fukuoka'],catalog=()=>city().catalog,day=()=>trip.days[dayIndex],place=id=>resolvePlace(trip,destinations,id),newDay=()=>({start:'09:00',mode:'transit',scenario:'normal',visits:[]});
function persist(){try{localStorage.setItem(KEY,JSON.stringify(db));$('#saveStatus').textContent=trip?'✓ 이 기기에 저장됨':'';return true}catch{$('#saveStatus').textContent='저장 실패 · 내보내기 필요';return false}}
function toast(msg,undo=false){clearTimeout(toastTimer);$('#toast span').textContent=msg;$('#undo').hidden=!undo;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),undo?9000:3000)}
function dateText(index){if(!trip.date)return '날짜 미정';const d=new Date(trip.date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+index);return `${d.getUTCMonth()+1}.${d.getUTCDate()}`}
function dayOptions(selected=dayIndex){return trip.days.map((d,i)=>`<option value="${i}" ${i===selected?'selected':''}>Day ${i+1} · ${dateText(i)}</option>`).join('')}
function welcome(){
  trip=null;$('#welcome').hidden=false;$('#workspace').hidden=true;$('#export').hidden=true;$('#saveStatus').textContent='';
  const active=db.trips.filter(t=>!t.deletedAt),deleted=db.trips.filter(t=>t.deletedAt);
  $('#recent').innerHTML='<h3>작성 중인 여행</h3>'+(active.length?active.slice().reverse().map(t=>`<div class="recent-row"><button class="recent-trip" data-open="${esc(t.id)}"><span>${esc(t.name)}<br><small>${destinations[t.city].name} · ${t.days.length}일 · 이 기기에 저장됨</small></span><span>↗</span></button><button class="trip-delete" data-remove-trip="${esc(t.id)}" aria-label="${esc(t.name)} 여행 삭제">삭제</button></div>`).join(''):'<p class="hint">작성 중인 여행이 없어요. 새 여행을 만들어 보세요.</p>')+(deleted.length?`<details class="deleted-trips"><summary>삭제한 여행 ${deleted.length}개</summary><p class="hint">삭제한 여행은 이 브라우저에 보관됩니다. 복원하면 일정과 숙소 메모를 다시 볼 수 있어요.</p>${deleted.slice().reverse().map(t=>`<div class="recent-row"><span class="deleted-name">${esc(t.name)}<small>${destinations[t.city].name} · ${t.days.length}일</small></span><button data-restore-trip="${esc(t.id)}" aria-label="${esc(t.name)} 여행 복원">복원</button></div>`).join('')}</details>`:'');
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

function openTrip(id){trip=db.trips.find(t=>t.id===id&&!t.deletedAt);if(!trip)return;db.active=id;dayIndex=0;view='plan';query='';filter='전체';undoState=null;$('#toast').classList.remove('show');$('#welcome').hidden=true;$('#workspace').hidden=false;$('#export').hidden=false;$('#workspace').classList.remove('mobile-map');$('#mobileView').textContent='지도 보기';persist();render();initMap();}
$('#createForm').onsubmit=e=>{e.preventDefault();const id=crypto.randomUUID?crypto.randomUUID():'trip-'+Date.now();const cityId=$('#tripCity').value,n=tripDateCount($('#tripDate').value,$('#tripEndDate').value);const t={id,city:cityId,name:$('#tripName').value.trim()||`${destinations[cityId].name} ${n-1}박 ${n}일`,date:$('#tripDate').value,days:Array.from({length:n},newDay),hotel:null};db.trips.push(t);openTrip(id);toast('새 여행을 만들었어요. 첫 장소를 담아 보세요.');};
$('#tripCity').onchange=()=>{$('#tripName').placeholder=`${destinations[$('#tripCity').value].name} 3박 4일`};
function render(){if(!trip)return;$('#tripTitle').textContent=trip.name;$('#tripMeta').textContent=`${trip.days.length-1}박 ${trip.days.length}일 · ${trip.date?trip.date+' ~ '+tripEndDate(trip.date,trip.days.length):'날짜 미정'} · 현지 시간 기준`;$('#cityLabel').textContent=`${city().en} / ${city().country}`;$('#mapCity').textContent=`${city().name}, ${city().country}`;$('#days').innerHTML=trip.days.map((d,i)=>`<button data-day="${i}" class="${i===dayIndex?'active':''}" aria-current="${i===dayIndex?'date':'false'}">Day ${i+1}<small>${dateText(i)}</small></button>`).join('');$('.tabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.panel===view)));renderPanel();updateMap();}
function locationNote(p){return p.custom?'<p class="location-note">직접 추가 · 위치 미등록<br>'+esc(p.address||'위치 메모 없음')+'</p>':''}
function visitNote(v){return typeof v.note==='string'&&v.note?`<p class="visit-note">${esc(v.note)}</p>`:''}
function hotelCard(){return `<div class="hotel-card"><span aria-hidden="true">⌂</span><div><b>${esc(trip.hotel?.name||'머물 곳을 정해볼까요?')}</b><p>${esc(trip.hotel?.address||'숙소 이름과 주소를 메모해 두세요.')}</p></div><button data-hotel>${trip.hotel?'수정':'등록'}</button></div>`}
function renderPanel(){const el=$('#panelContent');if(view==='today'){renderDayView();return}if(view==='search'){renderSearch();return}const tl=buildTimeline(day());if(view==='timeline'){renderTimeline(tl);return}el.innerHTML=hotelCard()+unassignedCard()+`<div class="panel-heading"><h2>Day ${dayIndex+1}의 발자국</h2><span>${day().visits.length}개의 장소</span></div>`+(day().visits.length?tl.rows.map((v,i)=>{const p=place(v.place);return `${i?`<div class="leg ${v.leg==null?'bad':''}">${v.leg==null?'이동시간 미확인 · 실패 예시':`${day().mode==='walk'?'도보':'대중교통'} ${v.leg}분 · 시안 예시`}</div>`:''}<article class="stop"><span class="number">${i+1}</span><div class="stop-body"><button class="stop-name" data-detail="${p.id}">${esc(p.name)}</button><p>${esc(p.area)} · 체류 ${v.duration}분${v.fixed?' · '+esc(v.fixed)+' 고정':''}</p>${locationNote(place(v.place))}${visitNote(v)}<div class="stop-tools"><button data-reorder="${v.uid}" data-delta="-1" aria-label="${esc(p.name)} 위로" ${i===0?'disabled':''}>↑</button><button data-reorder="${v.uid}" data-delta="1" aria-label="${esc(p.name)} 아래로" ${i===tl.rows.length-1?'disabled':''}>↓</button><button data-edit="${v.uid}" aria-label="${esc(p.name)} 날짜·시간·메모 편집">날짜·시간·메모</button><button class="delete" data-delete="${v.uid}" aria-label="${esc(p.name)} 삭제">삭제</button></div></div></article>`}).join(''):`<div class="empty"><h3>아직 비어 있는 하루</h3><p>가고 싶은 곳을 하나씩 담아보세요.<br>나만의 여행이 여기서 시작됩니다.</p><button class="primary" data-panel="search">＋ 첫 장소 찾기</button></div>`)+`<div class="summary"><span>체류 ${tl.totalStay}분</span><span>${tl.complete?'예시 이동 '+tl.totalMove+'분':'이동시간 미확인'}</span></div><button class="wide" data-panel="search">＋ 장소 추가 <span>→</span></button><div class="notice">이동시간은 화면 검토용 예시입니다. 실제 거리·교통편을 조회하지 않았습니다.</div>${day().visits.length?'<button class="primary wide" data-panel="timeline">하루 시간표 확인 <span>→</span></button>':''}`;}
function renderSearch(resultsOnly=false){const q=query.trim().toLowerCase();const list=catalog().filter(p=>(filter==='전체'||p.cat===filter)&&`${p.name} ${p.area} ${p.en}`.toLowerCase().includes(q));const results=list.map(p=>`<article class="place-card"><button class="place-art" data-detail="${p.id}" style="--art:${p.color}" aria-label="${esc(p.name)} 상세"><span>${p.en}</span><b aria-hidden="true">${p.glyph}</b></button><div class="place-info"><div><h3>${esc(p.name)}</h3><small>${esc(p.area)} · ${p.cat}</small></div><button data-add="${p.id}" aria-label="${esc(p.name)} Day ${dayIndex+1}에 추가">＋</button></div></article>`).join('')||'<div class="empty"><h3>일치하는 예시 장소가 없어요.</h3><p>찾는 장소를 직접 입력해 일정에 담아보세요.</p><button data-clear-search>검색 초기화</button></div>';if(resultsOnly){$('#searchResults').innerHTML=results;return;}$('#panelContent').innerHTML=`<div class="panel-heading"><h2>어디에 가볼까요?</h2><span>Day ${dayIndex+1}에 담기</span></div><div class="searchbox"><input id="searchInput" type="search" aria-label="예시 장소 검색" placeholder="예시 장소 이름으로 검색" value="${esc(query)}"></div><div class="filters">${['전체','문화','산책','쇼핑'].map(f=>`<button data-filter="${f}" class="${f===filter?'active':''}">${f}</button>`).join('')}</div><div class="hint">${city().name}의 예시 장소 ${catalog().length}곳 · 전체 장소 검색은 추후 연결됩니다.</div><button class="wide manual-add" data-custom>＋ 검색에 없는 장소 직접 추가</button><div id="searchResults">${results}</div>`;const input=$('#searchInput');let composing=false;
input.oncompositionstart=()=>{composing=true;};
input.oncompositionend=()=>{composing=false;query=input.value;renderSearch(true);};
input.oninput=e=>{query=input.value;if(composing||e.isComposing)return;renderSearch(true);};}

function renderTimeline(tl){$('#panelContent').innerHTML=`<div class="panel-heading"><h2>하루를 한눈에</h2><span>Day ${dayIndex+1}</span></div><div class="time-settings"><label>하루 시작<input id="startTime" type="time" value="${day().start}" required></label><label>이동수단<select id="travelMode"><option value="transit" ${day().mode==='transit'?'selected':''}>대중교통 예시</option><option value="walk" ${day().mode==='walk'?'selected':''}>도보 예시</option></select></label></div><label>시안에서 확인할 상황<select id="scenario"><option value="normal" ${day().scenario==='normal'?'selected':''}>정상 조회 예시</option><option value="failure" ${day().scenario==='failure'?'selected':''}>첫 이동 구간 조회 실패 예시</option></select></label><div class="notice">모든 이동시간은 고정된 예시값입니다. 실제 경로·영업시간·예약 가능 여부는 확인하지 않습니다.</div>`+(tl.rows.length?tl.rows.map((v,i)=>{const p=place(v.place);return `${i?`<div class="leg ${v.leg==null?'bad':''}">${v.leg==null?'이동시간을 확인할 수 없어요 · 예시 실패':`${v.leg}분 이동 · 시안 예시`}</div>`:''}<div class="timeline-item"><span class="clock">${clockText(v.start)}</span><div><h3>${esc(p.name)}</h3><p>체류 ${v.duration}분${v.fixed?' · '+esc(v.fixed)+' 고정':''}</p>${locationNote(place(v.place))}${visitNote(v)}${v.late?`<p class="conflict">예상 도착이 고정 시각보다 ${v.late}분 늦어요.</p>`:''}${v.anchored?'<p class="conflict">앞 구간이 미확인이므로 도착 가능 여부를 확인해 주세요.</p>':''}<button data-edit="${v.uid}" aria-label="${esc(p.name)} 시간·메모 편집">시간·메모</button></div></div>`}).join('')+`<div class="timeline-total"><span>${tl.complete?'예시 종료 시각':'종료 시각 미확인'}</span><br><b>${tl.complete?clockText(tl.end):'—'}</b><p>체류 ${tl.totalStay}분 · ${tl.complete?'예시 이동 '+tl.totalMove+'분':'이동정보 확인 필요'}<br>숙소 출발·복귀 이동은 포함하지 않았습니다.</p></div>`:'<div class="empty"><h3>시간표에 담을 장소가 없어요.</h3><button data-panel="search">장소 찾기</button></div>')+'<button class="wide" style="margin-top:16px" data-panel="plan">← 일정 편집으로</button>';$('#startTime').onchange=e=>{if(minutes(e.target.value)==null){e.target.value=day().start;return}day().start=e.target.value;persist();renderPanel()};$('#travelMode').onchange=e=>{day().mode=e.target.value;persist();renderPanel()};$('#scenario').onchange=e=>{day().scenario=e.target.value;persist();renderPanel()};}
function addPlace(id,index=dayIndex){if(!place(id)||!trip.days[index])return;trip.days[index].visits.push({uid:crypto.randomUUID?crypto.randomUUID():'v-'+Date.now(),place:id,duration:60,fixed:''});persist();render();toast(`Day ${index+1}에 ${place(id).name}을 담았어요.`);}
function detail(id){const p=place(id);if(!p)return;if(p.custom){customDetail(id);return;}detailId=id;$('#detailContent').innerHTML=`<span class="eyebrow">${p.en} / PLACE PREVIEW</span><h2>${esc(p.name)}</h2><div class="detail-meta"><span>${esc(p.area)}</span><span>${p.cat}</span><span>예시 장소</span></div><div class="detail-art" style="--art:${p.color}" aria-hidden="true">${p.glyph}</div><p>${esc(p.desc)}</p><p>운영시간 · 확인 필요<br>주소·사진·입구 정보는 아직 연결하지 않았습니다.</p><a href="https://www.google.com/maps/search/?api=1&query=${p.coord[1]},${p.coord[0]}" target="_blank" rel="noopener noreferrer">외부 지도에서 위치 확인 ↗</a><div class="detail-controls"><select id="detailDay" aria-label="장소를 추가할 날짜">${dayOptions()}</select><button class="primary" id="detailAdd">선택한 날짜에 추가</button></div><p class="hint">같은 장소를 다시 담으면 별도의 방문으로 추가됩니다.</p>`;$('#detailAdd').onclick=()=>{addPlace(detailId,Number($('#detailDay').value));$('#detail').close()};$('#detail').showModal();if(map)map.flyTo({center:p.coord,zoom:15.5,pitch:db.three?50:0,duration:motion()});}
function editVisit(uid){const v=day().visits.find(v=>v.uid===uid);if(!v)return;$('#editId').value=uid;$('#editTitle').textContent=place(v.place).name;$('#editDay').innerHTML=dayOptions();$('#editDuration').value=v.duration;$('#editFixed').value=v.fixed;$('#editNote').value=v.note||'';$('#editError').textContent='';$('#edit').showModal();}
$('#editForm').onsubmit=e=>{
  e.preventDefault();const uid=$('#editId').value,index=day().visits.findIndex(v=>v.uid===uid);if(index<0)return;
  const target=Number($('#editDay').value),duration=Number($('#editDuration').value),fixed=$('#editFixed').value,note=$('#editNote').value.trim();
  if(!trip.days[target]||!Number.isInteger(duration)||duration<5||duration>720||(fixed&&minutes(fixed)===null)||note.length>1000){$('#editError').textContent='날짜·시간을 확인하고 메모는 1,000자 이내로 입력해 주세요.';return;}
  const previous=structuredClone(trip.days),v=day().visits[index];v.duration=duration;v.fixed=fixed;v.note=note;
  if(target!==dayIndex){day().visits.splice(index,1);trip.days[target].visits.push(v);}
  if(!persist()){trip.days=previous;$('#editError').textContent='저장하지 못했어요. 입력한 메모는 창에 남아 있으니 다시 시도해 주세요.';return;}
  $('#edit').close();render();toast(target!==dayIndex?`Day ${target+1}로 메모와 함께 옮겼어요.`:'방문 정보와 메모를 저장했어요.');
};
$('#hotelForm').onsubmit=e=>{e.preventDefault();if(!$('#hotelName').value.trim())return;trip.hotel={name:$('#hotelName').value.trim(),address:$('#hotelAddress').value.trim()};persist();$('#hotel').close();render();toast('숙소 메모를 저장했어요.');};
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.close){$('#'+b.dataset.close).close();return}if(b.dataset.removeTrip){requestTripDelete(b.dataset.removeTrip);return}if(b.dataset.restoreTrip){restoreTrip(b.dataset.restoreTrip);return}if(b.dataset.open){openTrip(b.dataset.open);return}if(!trip)return;if(b.dataset.panel){if(b.dataset.panel==='today'&&view!=='today'){const info=travelDayInfo(trip);if(info.index!==null)dayIndex=info.index;}view=b.dataset.panel;render();$('#panelContent').scrollTop=0}if(b.dataset.day!==undefined){dayIndex=Number(b.dataset.day);render()}if(b.dataset.filter){filter=b.dataset.filter;renderSearch()}if(b.hasAttribute('data-clear-search')){query='';filter='전체';renderSearch()}if(b.hasAttribute('data-custom'))openCustom();if(b.dataset.add)addPlace(b.dataset.add);if(b.dataset.detail)detail(b.dataset.detail);if(b.dataset.edit)editVisit(b.dataset.edit);if(b.dataset.assign)assignVisit(b.dataset.assign);if(b.dataset.reorder){const a=day().visits,i=a.findIndex(v=>v.uid===b.dataset.reorder),j=i+Number(b.dataset.delta);if(i>=0&&j>=0&&j<a.length){[a[i],a[j]]=[a[j],a[i]];persist();render()}}if(b.dataset.delete){undoState={tripId:trip.id,day:dayIndex,index:day().visits.findIndex(v=>v.uid===b.dataset.delete),visit:structuredClone(day().visits.find(v=>v.uid===b.dataset.delete))};day().visits=day().visits.filter(v=>v.uid!==b.dataset.delete);persist();render();toast('일정에서 삭제했어요.',true)}if(b.hasAttribute('data-hotel')){$('#hotelName').value=trip.hotel?.name||'';$('#hotelAddress').value=trip.hotel?.address||'';$('#hotel').showModal()}});
$('#undo').onclick=()=>{if(!undoState||trip?.id!==undoState.tripId)return;const targetDay=trip.days[undoState.day];if(!targetDay){undoState=null;toast('여행 기간이 바뀌어 실행 취소할 수 없어요.');return}const now=targetDay.visits;if(!trip.days.some(d=>d.visits.some(v=>v.uid===undoState.visit.uid)))now.splice(Math.min(undoState.index,now.length),0,undoState.visit);undoState=null;persist();render();toast('삭제한 방문을 복원했어요.');};
$('#home').onclick=welcome;$('#newTrip').onclick=welcome;$('#mobileView').onclick=()=>{const on=$('#workspace').classList.toggle('mobile-map');$('#mobileView').textContent=on?'일정 보기':'지도 보기';if(on)requestAnimationFrame(()=>map?.resize());};
$('#export').onclick=()=>{if(!trip)return;const text=[trip.name,`${city().name} · ${trip.date||'날짜 미정'} · ${trip.days.length}일`,'시안 예시 일정 — 이동시간은 실제 조회 결과가 아닙니다.',trip.hotel?`숙소: ${trip.hotel.name} / ${trip.hotel.address}`:'',...trip.days.map((d,i)=>`\nDay ${i+1}\n`+buildTimeline(d).rows.map(v=>`${clockText(v.start)} ${place(v.place).name}${place(v.place).custom?" [직접 추가 · 위치 미등록]\n주소/위치 메모: "+place(v.place).address:""} (체류 ${v.duration}분)${v.note?"\n메모: "+v.note:""}`).join('\n')),...(trip.unassigned?.length?['\n미배정 장소',...trip.unassigned.map(v=>`${place(v.place).name} (체류 ${v.duration}분${v.fixed?' · '+v.fixed+' 고정':''})${v.note?'\n메모: '+v.note:''}`)]:[])].join('\n');const u=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='ORBIT-시안-여행일정.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
function unassignedCard(){
  const visits=trip.unassigned||[];if(!visits.length)return '';
  return `<details class="unassigned" open><summary>미배정 장소 ${visits.length}곳</summary><p class="hint">기간을 줄이며 보관한 장소입니다. 날짜를 선택해 다시 담으세요.</p>${visits.map(v=>`<div class="held-visit"><b>${esc(place(v.place).name)}</b><p>이전 Day ${v.originalDay} · 체류 ${v.duration}분${v.fixed?' · '+esc(v.fixed)+' 고정':''}</p>${locationNote(place(v.place))}${visitNote(v)}<div class="held-actions"><select id="assign-${esc(v.uid)}" aria-label="${esc(place(v.place).name)} 배정 날짜">${dayOptions()}</select><button data-assign="${esc(v.uid)}" aria-label="${esc(place(v.place).name)} 일정에 다시 담기">다시 담기</button></div></div>`).join('')}</details>`;
}
function assignVisit(uid){
  const index=(trip.unassigned||[]).findIndex(v=>v.uid===uid);if(index<0)return;
  const target=Number(document.getElementById('assign-'+uid).value);if(!trip.days[target])return;
  const {originalDay,...visit}=trip.unassigned[index];trip.unassigned.splice(index,1);trip.days[target].visits.push(visit);
  const saved=persist();render();toast(saved?`Day ${target+1}에 다시 담았어요. 고정 시각을 확인해 주세요.`:'변경은 적용됐지만 저장하지 못했어요. 일정을 내보내 주세요.');
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
    db.trips[db.trips.findIndex(t=>t.id===trip.id)]=next;trip=next;dayIndex=Math.min(dayIndex,trip.days.length-1);undoState=null;pinSignature='';
    const saved=persist();$('#settings').close();render();toast(saved?'여행 정보를 변경했어요.':'변경은 적용됐지만 저장하지 못했어요. 일정을 내보내 주세요.');
  }catch(error){$('#settingsError').textContent=error.message;}
};
function motion(){return matchMedia('(prefers-reduced-motion: reduce)').matches?0:650}
function initMap(){if(map){map.resize();updateMap();return}try{if(!window.maplibregl)throw Error();map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/bright',center:city().center,zoom:city().zoom,pitch:db.three?50:0,bearing:0});map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');map.on('load',()=>{const style=map.getStyle(),source=Object.keys(style.sources).find(k=>style.sources[k].type==='vector');if(source&&!style.layers.some(l=>l.type==='fill-extrusion'))map.addLayer({id:'orbit-buildings',source,'source-layer':'building',type:'fill-extrusion',minzoom:14.5,layout:{visibility:db.three?'visible':'none'},paint:{'fill-extrusion-color':'#bfccb4','fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':0.9}},style.layers.find(l=>l.type==='symbol')?.id);map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'visit-line',source:'route',type:'line',paint:{'line-color':'#cc8a5d','line-width':3,'line-dasharray':[2,2]}});mapReady=true;$('#mapStatus').hidden=true;applyDimension();updateMap()});map.on('error',()=>{if(!mapReady){$('#mapStatus').hidden=false;$('#mapStatus').textContent='지도 연결을 기다리고 있어요. 일정 편집은 계속할 수 있습니다.'}});setTimeout(()=>{if(!mapReady){$('#mapStatus').hidden=false;$('#mapStatus').textContent='지도 연결이 지연되고 있습니다. 인터넷 연결을 확인해 주세요.'}},15000)}catch{$('#mapStatus').hidden=false;$('#mapStatus').textContent='지도를 열 수 없습니다. 일정 편집과 시간표는 계속 사용할 수 있어요.'}}
function applyDimension(){if(!mapReady)return;map.getStyle().layers.filter(l=>l.type==='fill-extrusion').forEach(l=>map.setLayoutProperty(l.id,'visibility',db.three?'visible':'none'));map.easeTo({pitch:db.three?50:0,duration:motion()});$('#dimension').textContent=db.three?'2D로 보기':'3D 켜기';$('#dimension').setAttribute('aria-pressed',String(db.three));}
$('#dimension').onclick=()=>{db.three=!db.three;persist();applyDimension();if(db.three&&map?.getZoom()<14.5)map.easeTo({zoom:14.7,duration:motion()});};
function updateMap(){if(!trip)return;const missing=day().visits.filter(v=>!place(v.place)?.coord).length;$('#mapMissing').textContent=missing?'위치 미등록 '+missing+'곳 · 지도 표시와 연결선에서 제외됩니다.':'';$('#mapMissing').hidden=!missing;if(!mapReady)return;if(mapCity!==trip.city){mapCity=trip.city;pins.forEach(m=>m.remove());pins.clear();pinSignature='';map.jumpTo({center:city().center,zoom:city().zoom,pitch:db.three?50:0});}const signature=trip.city+':'+day().visits.map(v=>v.place).join(',');if(signature===pinSignature)return;pinSignature=signature;catalog().forEach(p=>{let marker=pins.get(p.id);if(!marker){const el=document.createElement('button');el.className='pin';el.setAttribute('aria-label',p.name+' 지도 상세');el.onclick=()=>detail(p.id);marker=new maplibregl.Marker({element:el}).setLngLat(p.coord).addTo(map);pins.set(p.id,marker)}const nums=day().visits.map((v,i)=>v.place===p.id?i+1:null).filter(Boolean),el=marker.getElement();el.textContent=(nums.length?nums.join('·')+' ':'')+p.name;el.classList.toggle('chosen',nums.length>0)});map.getSource('route').setData({type:'FeatureCollection',features:routeFeatures(day().visits,place)});}
$('#fit').onclick=()=>{if(!mapReady)return;const coords=day().visits.map(v=>place(v.place).coord).filter(Boolean);if(!coords.length){map.flyTo({center:city().center,zoom:city().zoom,pitch:db.three?50:0,duration:motion()});return}const bounds=new maplibregl.LngLatBounds(coords[0],coords[0]);coords.forEach(c=>bounds.extend(c));map.fitBounds(bounds,{padding:{top:90,bottom:140,left:60,right:60},maxZoom:16,duration:motion()})};
welcome();




function openCustom(){
  $('#customForm').reset();$('#customName').value=query.trim().slice(0,80);$('#customDay').innerHTML=dayOptions();$('#customError').textContent='';$('#custom').showModal();
}
$('#customForm').onsubmit=e=>{
  e.preventDefault();const name=$('#customName').value.trim(),address=$('#customAddress').value.trim(),index=Number($('#customDay').value);
  const id='custom-'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),p={id,name,address};
  if(!validCustomPlace(p)||!trip.days[index]){$('#customError').textContent='장소 이름은 1~80자, 주소 또는 위치 메모는 300자 이내로 입력해 주세요.';return;}
  const previous=trip.customPlaces;trip.customPlaces=[...(previous||[]),p];trip.days[index].visits.push({uid:id+'-visit',place:id,duration:60,fixed:'',note:''});
  if(!persist()){trip.days[index].visits.pop();if(previous===undefined)delete trip.customPlaces;else trip.customPlaces=previous;$('#customError').textContent='저장하지 못했어요. 입력 내용은 남아 있으니 다시 시도해 주세요.';return;}
  $('#custom').close();dayIndex=index;view='plan';render();toast('선택한 날짜에 장소를 담았어요. 지도 위치는 미등록 상태입니다.');
};
function customDetail(id){
  const p=place(id);$('#detailContent').innerHTML='<span class="eyebrow">MY PLACE</span><h2>'+esc(p.name)+'</h2>'+locationNote(p)+'<p>입력한 주소나 메모를 좌표로 변환하지 않습니다. 지도 핀과 연결선에는 표시되지 않습니다.</p><div class="detail-controls"><select id="detailDay" aria-label="장소를 추가할 날짜">'+dayOptions()+'</select><button class="primary" id="detailAdd">선택한 날짜에 추가</button></div><p class="hint">같은 장소를 별도의 방문으로 다시 담습니다.</p>';
  $('#detailAdd').onclick=()=>{addPlace(id,Number($('#detailDay').value));$('#detail').close();};$('#detail').showModal();
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
$('#backup').addEventListener('close',()=>{backupReadId++;pendingBackup=null;});
$('#backupDownload').onclick=()=>{
  try{
    const text=createBackup(db.trips,destinations),url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='ORBIT-여행백업-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('#backupMessage').textContent='백업 다운로드를 요청했어요. 브라우저의 다운로드 목록에서 파일을 확인해 주세요.';
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
