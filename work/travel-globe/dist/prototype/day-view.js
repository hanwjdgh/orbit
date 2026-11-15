// Read-only views: the trip remains the single source of itinerary data.
function travelDayInfo(t,now=new Date()){
  const zone=({fukuoka:'Asia/Tokyo',tokyo:'Asia/Tokyo',osaka:'Asia/Tokyo',paris:'Europe/Paris',london:'Europe/London',newyork:'America/New_York'})[t.city]||'UTC';
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=type=>parts.find(p=>p.type===type).value;
  const date=`${part('year')}-${part('month')}-${part('day')}`;
  const offset=t.date?(Date.parse(date+'T00:00:00Z')-Date.parse(t.date+'T00:00:00Z'))/86400000:null;
  return {zone,date,index:offset!==null&&offset>=0&&offset<t.days.length?offset:null};
}
function dayLocation(p){
  return p.custom?`<p class="location-note">직접 추가 · ${p.coord?'위치 등록됨':'위치 미등록'}<br>${esc(p.address||'주소 또는 위치 메모 없음')}</p>`:`<p class="day-address">${esc(p.area)} · 상세 주소 미등록</p>`;
}
function dayWarnings(v){return (v.late?`<p class="conflict">고정 시각보다 ${v.late}분 늦어요.</p>`:'')+(v.anchored?'<p class="conflict">앞 구간이 미확인입니다. 고정 시각에 도착 가능한지 확인해 주세요.</p>':'');}
function dailyCards(d,{notes=true,interactive=false}={}){
  const tl=buildTimeline(d);
  return tl.rows.map((v,i)=>{const p=place(v.place);return `<article class="day-card"><div class="day-card-heading"><span class="day-number">${i+1}</span><div><p class="day-time">${clockText(v.start)} ~ ${clockText(v.end)} <small>예상</small></p><h3>${esc(p.name)}</h3></div></div><p>체류 ${v.duration}분${v.fixed?' · '+esc(v.fixed)+' 고정':''}${i?' · 앞 장소에서 '+legLabel(v):''}</p>${dayLocation(p)}${notes?visitNote(v):''}${dayWarnings(v)}${interactive?`<div class="day-actions"><button data-edit="${esc(v.uid)}" aria-label="${esc(p.name)} 방문 정보 수정">방문 정보 수정</button>${p.coord?`<a href="https://www.google.com/maps/search/?api=1&query=${p.coord[1]},${p.coord[0]}" target="_blank" rel="noopener noreferrer">외부 지도에서 위치 확인 ↗</a>`:''}</div>`:''}</article>`;}).join('')||'<p class="empty">이 날짜에 등록한 장소가 없습니다.</p>';
}
function renderDayView(now=new Date()){
  const info=travelDayInfo(trip,now),tl=buildTimeline(day());
  const status=!trip.date?'출발일이 없어 오늘 날짜를 연결할 수 없어요. 아래에서 날짜를 골라 보세요.':info.index===null?'현지 오늘은 여행 기간 밖입니다. 선택한 날짜의 일정을 보여드립니다.':info.index===dayIndex?'현지 오늘의 일정입니다.':`현지 오늘은 Day ${info.index+1}입니다. 현재는 Day ${dayIndex+1} 일정을 보고 있어요.`;
  $('#panelContent').innerHTML=`<div class="day-view"><div class="panel-heading"><h2>여행 당일 보기</h2><span>Day ${dayIndex+1} · ${dateText(dayIndex)}</span></div><p class="hint">${esc(city().name)} 현지 오늘 ${info.date}</p><p role="status">${status}</p><div class="day-navigation"><button id="dayPrevious" ${dayIndex===0?'disabled':''}>← 이전 날</button><button id="dayToday" ${info.index===null?'disabled':''}>현지 오늘</button><button id="dayNext" ${dayIndex===trip.days.length-1?'disabled':''}>다음 날 →</button></div><label>확인할 날짜<select id="dayReadSelect">${dayOptions()}</select></label><div class="notice">이동시간은 직접 입력한 값만 반영하고, 입력하지 않은 구간은 미확인으로 둡니다. 영업시간은 확인하지 않습니다. 숙소 출발·복귀 이동은 포함하지 않습니다.</div>${trip.hotel?`<section class="day-hotel"><h3>숙소 메모</h3><b>${esc(trip.hotel.name)}</b><p>${esc(trip.hotel.address)}</p></section>`:''}${dailyCards(day(),{interactive:true})}${day().visits.length?`<p class="day-summary">장소 ${day().visits.length}곳 · 체류 ${tl.totalStay}분<br>${tl.complete?'예상 종료 '+clockText(tl.end):'이동시간 미확인 · 종료 시각 미확인'}</p>`:''}<button class="wide" data-panel="plan">일정 편집으로 돌아가기</button></div>`;
  const select=index=>{dayIndex=index;render();};
  $('#dayPrevious').onclick=()=>{if(dayIndex>0)select(dayIndex-1);};
  $('#dayNext').onclick=()=>{if(dayIndex<trip.days.length-1)select(dayIndex+1);};
  $('#dayToday').onclick=()=>{const current=travelDayInfo(trip);if(current.index!==null)select(current.index);else render();};
  $('#dayReadSelect').onchange=e=>{const index=Number(e.target.value);if(Number.isInteger(index)&&trip.days[index])select(index);};
}
function printableItinerary(scope='all',notes=true){
  if(!trip)return '';
  const indices=scope==='day'?[dayIndex]:trip.days.map((_,i)=>i);
  const hotel=notes&&trip.hotel?`<section class="day-hotel"><h2>숙소 메모</h2><b>${esc(trip.hotel.name)}</b><p>${esc(trip.hotel.address)}</p></section>`:'';
  const held=scope==='all'&&trip.unassigned?.length?`<section class="print-day"><h2>미배정 장소</h2><p>날짜가 정해지지 않은 보관 장소입니다.</p>${trip.unassigned.map(v=>`<article class="day-card"><h3>${esc(place(v.place).name)}</h3><p>이전 Day ${v.originalDay} · 체류 ${v.duration}분${v.fixed?' · '+esc(v.fixed)+' 고정':''}</p>${dayLocation(place(v.place))}${notes?visitNote(v):''}</article>`).join('')}</section>`:'';
  return `<div class="print-document"><h1>${esc(trip.name)}</h1><p>${esc(city().name)} · ${trip.date?esc(trip.date)+' ~ '+tripEndDate(trip.date,trip.days.length):'날짜 미정'} · ${scope==='day'?'선택한 하루':'전체 여행'}</p><p class="print-warning">이동시간은 직접 입력한 값이며, 입력하지 않은 구간은 미확인입니다. 숙소 출발·복귀 이동은 포함하지 않았습니다. 시간은 여행 도시 현지 기준입니다.</p>${hotel}${indices.map(i=>{const d=trip.days[i],tl=buildTimeline(d);return `<section class="print-day"><h2>Day ${i+1} · ${dateText(i)}</h2>${dailyCards(d,{notes})}${d.visits.length?`<p>체류 ${tl.totalStay}분 · ${tl.complete?'예상 종료 '+clockText(tl.end):'종료 시각 미확인'}</p>`:''}</section>`;}).join('')}${held}</div>`;
}
function updatePrintPreview(){
  const html=printableItinerary($('#printScope').value,$('#printNotes').checked);
  $('#printPreview').innerHTML=html;$('#printSheet').innerHTML=html;
}
function openPrint(){
  if(!trip)return;$('#printScope').value='all';$('#printNotes').checked=true;updatePrintPreview();$('#printDialog').showModal();
}
