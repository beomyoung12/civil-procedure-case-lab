(() => {
  'use strict';
  const D = window.CIVIL_DATA, R = window.READING_DATA, C = window.ReadingCore, F = window.READING_FOCUS, FC = window.FocusCore, RC = window.ReadableCore;
  const T = window.READING_TRANSCRIPTS, TC = window.TranscriptCore;
  const key = 'civil-case-reading-v1', main = document.getElementById('main');
  const byId = new Map(D.cases.map(c => [c.id, c])), bySource = new Map(D.sources.map(s => [s.id, s]));
  const byGroup = new Map(R.groups.map(g => [g.id, g]));
  const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let records = C.blank(), persistError = false, filter = { unit: 'all', query: '', sort: 'unit', scope: 'all', supplements: false };
  let modelOpen = false, originalOpen = false, mobilePane = 'problem', toastTimer, activeCase = null, lastView = 'library';
  let pageViews = {}, importPending = false;
  try { const old = localStorage.getItem(key); if (old) records = C.validate(JSON.parse(old), new Set(byId.keys()), new Set(byGroup.keys())); }
  catch { persistError = true; try { const damaged = localStorage.getItem(key); if(damaged) localStorage.setItem(key+'-backup-'+Date.now(),damaged); } catch {} }
  filter.unit = records.unit;
  function toast(message) { const box = document.getElementById('toast'); box.textContent = message; box.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => box.style.display = 'none', 3500); }
  function persist() {
    try { localStorage.setItem(key, JSON.stringify(records)); persistError = false; }
    catch { persistError = true; toast('브라우저 저장에 실패했습니다. 기록 내보내기로 답안을 보관하세요.'); }
  }
  function saveDraft() {
    const area = document.getElementById('answer-input');
    if (area && activeCase) {
      records.drafts[activeCase] = { ...(records.drafts[activeCase] || {}), text: area.value, updated: new Date().toISOString() };
      persist();
      const status = document.getElementById('save-status');
      if (status) status.textContent = persistError ? '저장 실패 · 내보내기 필요' : '자동 저장됨';
      const count = document.getElementById('char-count'); if (count) count.textContent = `${area.value.length.toLocaleString()}자`;
    }
  }
  function go(hash) { saveDraft(); if (location.hash === hash) render(); else location.hash = hash; }
  function unitName(id) { return D.units.find(u => u.id === id)?.title || '전체 단원'; }
  function unitCode(id) { return String(Number(id.slice(1))).padStart(2, '0'); }
  function visible(c) { return filter.supplements || !R.cases[c.id].supplement; }
  function tags(c) {
    return `<span class="tag">${esc(c.year || '정리자료')}</span><span class="tag ${R.cases[c.id].hasPrimaryModelAnswer ? '' : 'warn'}">${R.cases[c.id].hasModelAnswer ? (R.cases[c.id].hasPrimaryModelAnswer ? '원문 답안 수록' : '관련 법리 대조답안') : R.cases[c.id].supplement ? '보충 연습' : '문제만 수록'}</span>${c.caution ? '<span class="tag warn">주의사항 있음</span>' : ''}`;
  }
  function sidebar(laws) {
    const count = id => laws ? R.groups.filter(g => g.unit === id).length : D.cases.filter(c => visible(c) && c.unit === id).length;
    return `<aside class="sidebar" aria-label="진도별 단원"><h2>진도 순서</h2><button class="unit ${filter.unit === 'all' ? 'active' : ''}" data-unit="all">전체 단원<span class="number">${laws ? R.groups.length : D.cases.filter(visible).length}</span></button>${D.units.map(u => `<button class="unit ${filter.unit === u.id ? 'active' : ''}" data-unit="${u.id}"><span><span class="number">${unitCode(u.id)}</span> ${esc(u.title)}</span><span class="number">${count(u.id)}</span></button>`).join('')}</aside>`;
  }
  function filters(laws) {
    return `<div class="filters"><input id="search" type="search" aria-label="문제·법리 검색" placeholder="${laws ? '공통법리·관련 문제 검색' : '문제 제목·내용·출처 검색'}" value="${esc(filter.query)}"><select id="sort" aria-label="정렬"><option value="unit" ${filter.sort === 'unit' ? 'selected' : ''}>진도 순서</option><option value="repeat" ${filter.sort === 'repeat' ? 'selected' : ''}>${laws ? '연결 사례 많은 순' : '최신 출제연도 순'}</option></select><select id="scope" aria-label="학습 여부"><option value="all">전체</option><option value="new" ${filter.scope === 'new' ? 'selected' : ''}>공부 전</option><option value="studied" ${filter.scope === 'studied' ? 'selected' : ''}>공부한 것</option><option value="draft" ${filter.scope === 'draft' ? 'selected' : ''}>작성한 답안 있음</option></select>${laws ? '' : `<label><input type="checkbox" id="supplements" ${filter.supplements ? 'checked' : ''}>정리자료 보충 8개 포함</label>`}</div>`;
  }
  function matches(text) { return !filter.query || text.toLowerCase().includes(filter.query.toLowerCase()); }
  function allowedStudy(done, draft = false) { return filter.scope === 'all' || filter.scope === 'new' && !done || filter.scope === 'studied' && done || filter.scope === 'draft' && draft; }
  function library(laws) {
    const title = laws ? '한 번 익히고, 여러 사례에 적용하기' : '단원별 사례 문제';
    main.innerHTML = `<section class="hero"><div><p class="eyebrow">${laws ? 'COMMON RULES' : 'CASE PRACTICE'}</p><h1>${title}</h1><p>${laws ? '반복되는 법리를 묶고, 조건이 달라지는 사례를 함께 연결했습니다. 연결 수는 이 자료 안의 학습사례 수이며 실제 출제 횟수는 아닙니다.' : '문제를 골라 왼쪽에서 읽고 오른쪽에 답안을 작성하세요. 모범답안 버튼을 누르면 오른쪽이 교수님 자료 원문으로 바뀝니다.'}</p></div><div class="stats"><div><strong>18</strong><span>단원</span></div><div><strong>107</strong><span>사례분류</span></div><div><strong>${R.groups.length}</strong><span>법리 묶음</span></div></div></section>${records.lastCase ? `<p class="continuation"><button class="quiet" data-case="${esc(records.lastCase)}">이어서 쓰기 · ${esc(byId.get(records.lastCase).title)}</button></p>` : ''}<div class="workspace">${sidebar(laws)}<section>${filters(laws)}<div id="results"></div></section></div>`;
    bindLibrary(laws); updateResults(laws);
  }
  function updateResults(laws) {
    const container = document.getElementById('results'); if (!container) return;
    if (laws) {
      const groups = R.groups.filter(g => (filter.unit === 'all' || g.unit === filter.unit) && matches([g.title,g.focus,g.guide?.issue,g.guide?.rule,g.guide?.limits,...(g.guide?.checks||[]),...(g.guide?.articles||[]).map(a=>`제${a}조`),...g.members.map(id => byId.get(id).title)].join(' ')) && allowedStudy(!!records.lawStudied[g.id], g.members.some(id => !!records.drafts[id]?.text)));
      if (filter.sort === 'repeat') groups.sort((a,b) => b.caseCount - a.caseCount);
      else groups.sort((a,b) => a.unit.localeCompare(b.unit));
      container.innerHTML = `<div class="section-title"><h2>${esc(unitName(filter.unit))}</h2><small>${groups.length}개 묶음</small></div><div class="cards">${groups.map(g => `<article class="card"><div class="tags"><span class="tag">${esc(unitName(g.unit))}</span><span class="tag">관련 사례 ${g.caseCount}개</span>${records.lawStudied[g.id] ? '<span class="tag">공부함</span>' : ''}</div><h3>${esc(g.title)}</h3><p>${esc(g.guide?.issue || g.focus)}</p><div class="card-footer"><small>판단 기준·요건·예외 · 원문 대조</small><button data-law="${g.id}">모아 공부</button></div></article>`).join('')}</div>`;
      if (!groups.length) container.innerHTML += '<p class="empty">조건에 맞는 법리 묶음이 없습니다.</p>';
    } else {
      const cases = D.cases.filter(c => visible(c) && (filter.unit === 'all' || c.unit === filter.unit) && matches([c.title,c.facts,c.prompt,c.year,bySource.get(c.sourceId).name].join(' ')) && allowedStudy(!!records.studied[c.id],!!records.drafts[c.id]?.text));
      if (filter.sort === 'repeat') cases.sort((a,b) => Number((b.year||'').match(/20\d{2}/)?.[0]||0)-Number((a.year||'').match(/20\d{2}/)?.[0]||0));
      container.innerHTML = `<div class="section-title"><h2>${esc(unitName(filter.unit))}</h2><small>${cases.length}개 사례분류</small></div><div class="case-list">${cases.map(c => `<article class="case-row"><span class="case-number">${esc(c.id.toUpperCase())}</span><div><h3>${esc(c.title)}</h3><div class="tags"><span class="tag">${esc(unitName(c.unit))}</span>${tags(c)}</div></div><span class="small row-status">${records.studied[c.id] ? '공부함' : records.drafts[c.id]?.text ? '답안 작성 중' : '아직 쓰지 않음'}</span><button data-case="${c.id}">${records.drafts[c.id]?.text ? '이어서 쓰기' : '문제 풀기'}</button></article>`).join('')}</div>`;
      if (!cases.length) container.innerHTML += '<p class="empty">조건에 맞는 문제가 없습니다.</p>';
    }
  }
  function bindLibrary(laws) {
    document.getElementById('search').addEventListener('input', e => { filter.query = e.target.value; updateResults(laws); });
    for (const type of ['sort','scope']) document.getElementById(type).addEventListener('change', e => { filter[type] = e.target.value; updateResults(laws); });
    document.getElementById('supplements')?.addEventListener('change', e => { filter.supplements = e.target.checked; library(false); });
  }
  function refsFor(c) {
    let refs = [R.cases[c.id].primary,...R.cases[c.id].related].filter(r => bySource.has(r.sourceId));
    for (const role of ['question','answer']) refs = FC.references(refs,F,c.id,role);
    return refs;
  }
  function viewerItems(c, slot, sourceId, custom) {
    return custom?.items || FC.selections(F,c.id,slot === 'problem' ? 'question' : 'answer',sourceId);
  }
  function visiblePages(ref, items, choice) {
    return choice.focus && items.length ? [...new Set(items.map(s => s.page))].sort((a,b)=>a-b) : ref.pages;
  }
  function markedText(text, items) {
    let result = '', offset = 0;
    for (const [start,end] of FC.ranges(text,items)) { result += esc(text.slice(offset,start))+`<mark class="source-mark">${esc(text.slice(start,end))}</mark>`; offset=end; }
    return result+esc(text.slice(offset));
  }
  function readableText(text,items,focused,sourceId,page) {
    const corrections=window.READING_EDITS?.[`${sourceId}:${page}`] || [], ranges=FC.ranges(text,items), used=new Map();
    const parts=focused ? items.map(s=>({text:s.text,offset:s.start})) : [{text,offset:0}];
    const body=parts.map(part=>{
      const blocks=RC.blocks(part.text,{offset:part.offset,page,edits:corrections,ranges:focused?[]:ranges});
      return `<article class="readable-text">${blocks.map(b=>{
        for(const edit of b.edits)used.set(edit.id,edit);
        const tag=b.kind==='major'?'h3':b.kind==='minor'?'h4':'p';
        return `<${tag} class="readable-block readable-${b.kind}${b.highlight?' readable-highlight':''}">${esc(b.text)}</${tag}>`;
      }).join('')}</article>`;
    }).join('<div class="section-divider">같은 페이지의 다음 답안 구간</div>');
    const notes=used.size ? `<details class="reading-edits"><summary>이 구간의 오타·조문 표기 교정 ${used.size}곳</summary><ul>${[...used.values()].map(e=>`<li><span class="edit-before">${esc(RC.spacing(e.before))}</span> → <strong>${esc(e.after)}</strong><p>${esc(e.reason)}</p>${e.authority?`<a href="${esc(e.authority.url)}" target="_blank" rel="noopener">${esc(e.authority.title)} ↗</a>`:''}</li>`).join('')}</ul></details>` : '';
    return `<p class="text-notice">문단·띄어쓰기 정돈${used.size?` · 확인한 오타 ${used.size}곳 교정`:''} · 추출문·원본 이미지로 비교 가능</p>${body}${notes}`;
  }
  function pageImage(sourceId, page, items, slot) {
    return `<div class="source-image-wrap"><img class="source-image" data-zoom="${slot}" src="${C.imagePath(sourceId,page)}" alt="PDF ${page}쪽 원문"><div class="source-highlights" aria-hidden="true">${FC.rectangles(items).map(r=>`<span style="left:${r[0]*100}%;top:${r[1]*100}%;width:${r[2]*100}%;height:${r[3]*100}%"></span>`).join('')}</div></div>`;
  }
  function focusedImage(sourceId, page, item, slot) {
    return item.rects.map((r,i) => `<svg class="source-crop" ${slot ? `data-zoom="${slot}"` : ''} role="img" aria-label="${esc(item.label)} · PDF ${page}쪽 · 부분 ${i+1}" viewBox="${r.join(' ')}" preserveAspectRatio="none" style="aspect-ratio:${(item.imageRatio || .7071)*r[2]/r[3]}"><image href="${C.imagePath(sourceId,page)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none"/></svg>`).join('');
  }
  function transcriptText(text, quote) {
    const hit=quote ? FC.locate(text,quote.text) : null;
    return `<article class="readable-text transcript-text">${RC.blocks(text,{ranges:hit?[[hit.start,hit.end]]:[]}).map(b=>{
      const folio=/^〔PDF [\d, ]+쪽〕$/.test(b.text);
      const tag=b.kind==='major'?'h3':b.kind==='minor'?'h4':'p';
      return `<${tag} class="readable-block readable-${folio?'folio':b.kind}${b.highlight?' readable-highlight':''}">${esc(b.text)}</${tag}>`;
    }).join('')}</article>`;
  }
  function transcriptViewer(c,slot) {
    const role=slot==='problem'?'question':'answer',row=TC.role(T,c.id,role);
    const choice=pageViews[slot] ||= {},refs=TC.sources(row),ref=TC.choice(row,choice.transcriptSource);
    const quote=T.quotes[choice.transcriptQuote];
    const comparison=role==='answer'&&R.cases[c.id].hasModelAnswer&&!R.cases[c.id].hasPrimaryModelAnswer
      ? '<p class="notice">출제문제 자체에는 답안이 없습니다. 같은 법리의 다른 출제문제 답안을 대조용으로 연결했습니다.</p>' : '';
    const caution=role==='answer'&&c.caution ? `<details class="notice"><summary>학습용 주의사항 · 법리 변경 등</summary><p>${esc(c.caution)}</p></details>` : '';
    const controls=`<div class="source-tools">${refs.length>1?`<select data-transcript-source="${slot}" aria-label="교정 TXT 자료">${refs.map((r,i)=>`<option value="${i}" ${r===ref?'selected':''}>${esc(bySource.get(r.sourceId).name)}</option>`).join('')}</select>`:ref?`<span class="small">${esc(bySource.get(ref.sourceId).name)}</span>`:''}<button data-transcript-original="${slot}">원본·쪽별 대조</button>${ref?`<a href="${esc(bySource.get(ref.sourceId).url)}#page=${ref.pages[0]}" target="_blank" rel="noopener">전체 PDF ↗</a>`:''}</div>`;
    if(!ref)return `${controls}<div class="panel-body"><p class="notice">${esc(row.notice||'이 구간의 교정 TXT가 없습니다.')}</p></div>`;
    return `${comparison}${caution}${controls}<div class="model-body"><p class="focus-caption">${role==='question'?'문제 본문':'자료 수록 답안'} · 교정 TXT<span>PDF ${ref.pages.join(', ')}쪽</span></p><p class="text-notice">문맥상 오타·한자 표기·줄바꿈을 정리한 TXT 기준입니다. 원본 이미지 대조 확정본은 아닙니다.${row.contextIncluded?' 설문 경계 미지정 부분은 공통 문맥·인접 설문을 포함합니다.':''}</p>${ref.segments.map(s=>transcriptText(s.text,quote)).join('<div class="section-divider">같은 자료의 다음 연결 구간</div>')}</div>`;
  }
  function sourceViewer(c, slot, startAnswer = false, custom) {
    const transcript=TC.role(T,c.id,slot==='problem'?'question':'answer');
    if(!custom&&transcript&&!pageViews[slot]?.original)return transcriptViewer(c,slot);
    const refs = custom ? [custom] : refsFor(c);
    if (!pageViews[slot] || pageViews[slot].ref == null) {
      const chosen=TC.choice(transcript,pageViews[slot]?.transcriptSource),preferred=refs.findIndex(r=>r.sourceId===chosen?.sourceId);
      const refIndex = !custom&&preferred>=0 ? preferred : (startAnswer||slot!=='problem')&&!custom ? R.cases[c.id].answerRefIndex : 0;
      const items = viewerItems(c,slot,refs[refIndex].sourceId,custom);
      pageViews[slot] = { ...pageViews[slot], ref: refIndex, focus: !!items.length, page: items[0]?.page || (startAnswer && refs[refIndex].pages.includes(R.cases[c.id].answerStart) ? R.cases[c.id].answerStart : refs[refIndex].pages[0]) };
    }
    const choice = pageViews[slot]; if (!refs[choice.ref]) choice.ref = 0;
    const ref = refs[choice.ref], source = bySource.get(ref.sourceId);
    if (source.kind !== 'pdf') return `<div class="panel-body"><a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.name)} 열기</a><p class="small">이 자료에는 이 보충 연습문제의 원문 모범답안이 없습니다.</p></div>`;
    const allItems = viewerItems(c,slot,ref.sourceId,custom), pages = visiblePages(ref,allItems,choice);
    if (!pages.includes(choice.page)) choice.page = pages[0];
    const items = allItems.filter(s => s.page === choice.page), index = pages.indexOf(choice.page);
    const text = window.READING_SOURCE_TEXT[`${ref.sourceId}:${choice.page}`];
    const imageRegion = items.some(s=>s.kind === 'region');
    const textMode = !!text && !imageRegion && choice.format !== 'image';
    const changedLaw = /2025|판례변경|현행 규정|국제사법 개정|오기|잘못 적|차용증서/.test(c.caution||'');
    const warning = (slot !== 'problem' && changedLaw) ? `<div class="notice"><strong>학습용 주의사항</strong><br>${esc(c.caution)}<br><span class="small">판례변경·법적 결론의 교정은 이 메모와 구별합니다. 읽기용 표시에는 확인한 오타·조문 표기만 교정하며, 원본 이미지와 추출문은 보존합니다.</span></div>` : '';
    const comparison = slot !== 'problem' && R.cases[c.id].hasModelAnswer && !R.cases[c.id].hasPrimaryModelAnswer ? '<p class="notice">선택한 출제문제 자체에는 모범답안이 없습니다. <strong>같은 법리를 다룬 다른 출제문제의 원문 답안</strong>을 대조용으로 연결했습니다.</p>' : '';
    const missing = slot !== 'problem' && (!R.cases[c.id].hasModelAnswer || ['s22b12e23','sf73ab0cc','s152f384f','sd70e679a'].includes(source.id)) ? '<p class="notice">현재 선택한 자료에는 이 사례의 모범답안이 없습니다. 문제·정리자료 원문을 보여줍니다.</p>' : '';
    const focused = choice.focus && !!items.length;
    const label = focused ? (items.every(s=>s.kind === 'excerpt') ? '검수된 답안 발췌 · 전체 답안은 페이지 전체에서 확인' : !textMode && !imageRegion ? '원문 이미지 · 해당 구간을 노란색으로 표시' : slot === 'problem' ? '해당 설문 원문 · 공통 사실관계 포함' : '해당 답안 원문') : items.length ? '페이지 전체 · 노란 표시가 선택한 문제의 구간' : '페이지 전체 · 이 자료의 세부 위치는 미지정';
    const sectionLabel = focused && items.some(s=>s.kind!=='excerpt') ? [...new Set(items.map(s=>s.label))].filter(t=>!['해당 답안의 원문','해당 설문의 원문'].includes(t)).map(t=>`<p class="source-caption">${esc(t)}</p>`).join('') : '';
    const content = textMode
      ? choice.raw ? `<p class="text-notice">PDF 추출문 그대로 · 오타·줄바꿈 수정 없음.</p>${focused ? items.map(s=>`<pre class="original-text">${esc(s.text)}</pre>`).join('<div class="section-divider">같은 페이지의 다음 답안 구간</div>') : `<pre class="original-text">${markedText(text,items)}</pre>`}` : readableText(text,items,focused,ref.sourceId,choice.page)
      : focused && items.every(s=>s.kind==='region') ? items.map(s=>focusedImage(ref.sourceId,choice.page,s,slot)).join('') : pageImage(ref.sourceId,choice.page,items,slot);
    return `${warning}${comparison}${missing}<div class="source-tools" data-viewer="${slot}">${transcript?`<button data-transcript-original="${slot}" class="primary">교정 TXT로 돌아가기</button>`:''}<select data-source-select="${slot}" aria-label="원문 자료">${refs.map((r,i) => `<option value="${i}" ${i === choice.ref ? 'selected' : ''}>${esc(bySource.get(r.sourceId).name)}</option>`).join('')}</select><select data-page-select="${slot}" aria-label="원문 페이지">${pages.map(page => `<option value="${page}" ${page === choice.page ? 'selected' : ''}>PDF ${page}쪽</option>`).join('')}</select><button data-page-prev="${slot}" ${index === 0 ? 'disabled' : ''}>이전 쪽</button><button data-page-next="${slot}" ${index === pages.length-1 ? 'disabled' : ''}>다음 쪽</button>${allItems.length ? `<button data-focus="${slot}" class="focus-toggle">${choice.focus ? '페이지 전체 보기' : slot === 'problem' ? '해당 설문만 보기' : '해당 답안만 보기'}</button>` : ''}${text && !imageRegion ? `<button data-format="${slot}">${textMode ? '원본 이미지' : '텍스트로 읽기'}</button>${textMode?`<button data-raw="${slot}" class="quiet">${choice.raw?'정돈해서 읽기':'추출문 그대로'}</button>`:''}` : ''}<button data-zoom="${slot}">원문 확대</button><a href="${esc(source.url)}#page=${choice.page}" target="_blank" rel="noopener">전체 PDF ↗</a></div><div class="model-body"><p class="focus-caption">${label}${textMode&&!choice.raw?' · 교정 전 추출문 읽기용 정리':''} · PDF ${choice.page}쪽 <span>${index+1}/${pages.length}쪽</span></p>${sectionLabel}${content}<p class="image-note">원본 파일은 수정하지 않았습니다.${focused ? ' 페이지 전체 보기로 주변 문맥을 확인할 수 있습니다.' : textMode&&!choice.raw?' 노란 표시는 해당 구간이 포함된 문단입니다.':' 노란 표시는 위치 안내입니다.'}</p></div>`;
  }
  function reading(c) {
    activeCase = c.id; records.lastCase = c.id; persist();
    const related = R.groups.filter(g => g.members.includes(c.id));
    main.innerHTML = `<button class="back quiet" data-back="${lastView}">← ${lastView === 'laws' ? '반복 법리 목록' : '단원별 문제 목록'}</button><div class="reading-heading"><div><p class="eyebrow">${unitCode(c.unit)} · ${esc(unitName(c.unit))}</p><h1>${esc(c.title)}</h1><p class="small">${esc(c.year || '정리자료')} · ${esc(bySource.get(c.sourceId).name)}${c.sourcePages.length ? ` · PDF ${c.sourcePages.join(', ')}쪽` : ''}</p></div><label class="studied"><input type="checkbox" id="case-studied" ${records.studied[c.id] ? 'checked' : ''}>공부한 문제로 표시</label></div><div class="mobile-switch"><button id="mobile-problem" class="${mobilePane === 'problem' ? 'active' : ''}">문제</button><button id="mobile-answer" class="${mobilePane === 'answer' ? 'active' : ''}">답안 작성·모범답안</button></div><div class="reading-grid"><section class="panel problem ${mobilePane !== 'problem' ? 'mobile-hidden' : ''}" id="problem-panel"><div class="panel-head"><h2>${originalOpen ? '문제 원문 자료' : '문제'}</h2><button id="problem-source" class="quiet">${originalOpen ? '문제 요지로 돌아가기' : '원문 문제 보기'}</button></div><div id="problem-content">${originalOpen ? sourceViewer(c,'problem') : `<div class="panel-body"><p class="small">학습용 문제 요지입니다. 교수님이 쓴 정확한 문제 문장은 ‘원문 문제 보기’에서 확인할 수 있습니다.</p><p>${esc(c.facts).replace(/\n/g,'<br>')}</p><p class="question">${esc(c.prompt).replace(/\n/g,'<br>')}</p></div>`}</div></section><section class="panel ${mobilePane !== 'answer' ? 'mobile-hidden' : ''}" id="answer-panel"><div class="panel-head"><h2 id="answer-title">${modelOpen ? (R.cases[c.id].hasModelAnswer ? '모범답안 · 원문' : '원문 자료 · 답안 미수록') : '내 답안'}</h2><div class="tools"><button id="toggle-answer" class="primary">${modelOpen ? '내 답안으로 돌아가기' : R.cases[c.id].hasModelAnswer ? '모범답안 보기' : '원문 자료 보기'}</button></div></div><div id="answer-content">${modelOpen ? modelMarkup(c) : editor(c)}</div></section></div>${c.caution ? `<details class="notice"><summary>이 사례의 주의사항 · 원문과 현재 법리의 차이 확인</summary><p>${esc(c.caution)}</p>${(c.references||[]).map(ref => `<a href="${esc(ref.url)}" target="_blank" rel="noopener">${esc(ref.title)}</a>`).join(' · ')}</details>` : ''}<div class="related-links"><small>같이 익힐 반복 법리</small>${related.map(g => `<button data-law="${g.id}" class="quiet">${esc(g.title)} · 관련 ${g.caseCount}개 사례 →</button>`).join('')}</div><div class="tools" style="margin-top:22px">${neighborButtons(c)}</div>`;
    bindReading(c);
  }
  function neighborButtons(c) {
    const same = D.cases.filter(x => x.unit === c.unit && !R.cases[x.id].supplement), index = same.findIndex(x => x.id === c.id);
    return `${index > 0 ? `<button data-case="${same[index-1].id}">← 같은 단원 이전 문제</button>` : ''}${index >= 0 && index < same.length-1 ? `<button data-case="${same[index+1].id}">같은 단원 다음 문제 →</button>` : ''}`;
  }
  function editor(c) { const draft = records.drafts[c.id] || {}; return `<textarea class="draft" id="answer-input" aria-label="내 답안 입력" placeholder="여기에 답안을 써보세요.\n\n문제의 소재 → 법리 → 사안의 적용 → 결론\n\n모범답안을 열어도 작성 내용은 사라지지 않습니다.">${esc(draft.text || '')}</textarea><div class="save-line"><span id="save-status">${persistError ? '저장 실패 · 내보내기 필요' : '자동 저장 준비됨'}${draft.viewed ? ' · 원문 열람한 답안' : ''}</span><span id="char-count">${(draft.text||'').length.toLocaleString()}자</span></div>`; }
  function modelMarkup(c) {
    const available = R.cases[c.id].hasModelAnswer;
    return `${!available ? '<div class="notice">이 문제에는 교수님 모범답안이 수록되어 있지 않습니다. 아래에는 문제 원문만 보여줍니다. 이전 사이트의 생성·요약 답안을 교수님 답안으로 대신 표시하지 않습니다.</div>' : ''}${sourceViewer(c,'answer',true)}`;
  }
  function lawQuoteMarkup(q,i) {
    const c=byId.get(q.caseId),fixed=TC.quote(T,q);
    return `<article class="quote-context"><h3>${esc(c.title)}</h3><p class="small">사안의 요지 · ${esc(c.facts)}</p><p class="small">${fixed?'교정 TXT의 해당 문구':'교정 전 검수 발췌 · 원본 대조 필요'}</p><blockquote class="quote">${esc(fixed?.text||q.text)}</blockquote><div class="quote-source">${esc(bySource.get(q.sourceId).name)} · PDF ${q.sourcePages.join(', ')}쪽 · <button class="quiet" data-quote="${q.caseId}" data-qindex="${i}" data-qsource="${q.sourceId}" data-qpage="${q.sourcePages[0]}">본문 대조</button></div></article>`;
  }
  function bindReading(c) {
    document.getElementById('answer-input')?.addEventListener('input', saveDraft);
    document.getElementById('case-studied').addEventListener('change', e => { if (e.target.checked) records.studied[c.id] = new Date().toISOString(); else delete records.studied[c.id]; persist(); });
    document.getElementById('toggle-answer').addEventListener('click', () => {
      saveDraft(); modelOpen = !modelOpen;
      if (modelOpen) { records.drafts[c.id] = { ...(records.drafts[c.id] || {text:''}), viewed: true }; persist(); }
      // Only replace the right pane, never the question or a composing input mid-typing.
      document.getElementById('answer-content').innerHTML = modelOpen ? modelMarkup(c) : editor(c);
      document.getElementById('answer-title').textContent = modelOpen ? (R.cases[c.id].hasModelAnswer ? '모범답안 · 원문' : '원문 자료 · 답안 미수록') : '내 답안';
      document.getElementById('toggle-answer').textContent = modelOpen ? '내 답안으로 돌아가기' : R.cases[c.id].hasModelAnswer ? '모범답안 보기' : '원문 자료 보기';
      document.getElementById('answer-input')?.addEventListener('input', saveDraft);
      bindImages();
    });
    document.getElementById('problem-source').addEventListener('click', () => { saveDraft(); originalOpen = !originalOpen; reading(c); });
    for (const pane of ['problem','answer']) document.getElementById('mobile-'+pane).addEventListener('click', () => {
      mobilePane = pane;
      document.getElementById('problem-panel').classList.toggle('mobile-hidden', pane !== 'problem');
      document.getElementById('answer-panel').classList.toggle('mobile-hidden', pane !== 'answer');
      document.getElementById('mobile-problem').classList.toggle('active', pane === 'problem');
      document.getElementById('mobile-answer').classList.toggle('active', pane === 'answer');
    });
    bindImages();
  }
  function law(g) {
    const members = g.members.map(id => byId.get(id)), originals = members.filter(c => R.cases[c.id].hasModelAnswer);
    const selected = pageViews.lawCase && members.find(c => c.id === pageViews.lawCase) || originals[0] || members[0];
    pageViews.lawCase = selected.id;
    main.innerHTML = `<button class="back quiet" data-back="laws">← 반복 법리 목록</button>
      <div class="reading-heading"><div><p class="eyebrow">${unitCode(g.unit)} · ${esc(unitName(g.unit))}</p><h1>${esc(g.title)}</h1><p class="small">관련 사례 ${g.caseCount}개 · 법리 → 사례 적용 → 원문 대조</p></div><label class="studied"><input id="law-studied" type="checkbox" ${records.lawStudied[g.id] ? 'checked' : ''}>이 묶음 공부함</label></div>
      <div class="law-layout"><section class="panel"><div class="panel-head"><h2>쟁점과 판단 기준</h2><small>보충한 학습용 정리 · 원문 아님</small></div><div class="panel-body">
      ${guideMarkup(g)}
      <details class="law-evidence"><summary>사례 속 자료 발췌 ${g.quotes.length}개 · 문맥과 함께 확인</summary>${g.quotes.length ? g.quotes.map(lawQuoteMarkup).join('') : '<p>별도로 검수된 텍스트 발췌가 없습니다. 오른쪽 관련 사례 본문에서 확인하세요.</p>'}</details>
      <details class="comparison-point"><summary>이 묶음에서 사례별로 달라지는 조건</summary><p>${esc(g.focus)}</p></details>
      <h3>함께 적용해 볼 문제들</h3>${members.map(c => `<div class="member"><button data-case="${c.id}"><strong>${esc(c.title)} →</strong><small>${esc(unitName(c.unit))} · ${esc(c.year || '정리자료')}</small></button><div class="tags">${tags(c)}</div><details class="member-summary"><summary>사실관계와 물음 비교 · 학습용 문제 요지</summary><p>${esc(c.facts)}</p><p>${esc(c.prompt)}</p></details></div>`).join('')}</div></section>
      <section class="panel law-original"><div class="panel-head"><h2>관련 사례 모범답안 원문</h2></div><div class="panel-body" style="padding-bottom:0"><select id="law-case" class="law-original-select" aria-label="비교할 사례">${members.map(c => `<option value="${c.id}" ${c.id === selected.id ? 'selected' : ''}>${esc(c.title)}${R.cases[c.id].hasModelAnswer ? '' : ' [답안 미수록]'}</option>`).join('')}</select></div><div id="law-source">${!R.cases[selected.id].hasModelAnswer ? '<div class="notice">이 사례는 원문 답안이 없습니다. 문제·정리자료 원문을 표시합니다.</div>' : ''}${sourceViewer(selected,'law',true)}</div></section></div>`;
    document.getElementById('law-studied').addEventListener('change', e => { if(e.target.checked) records.lawStudied[g.id] = new Date().toISOString(); else delete records.lawStudied[g.id]; persist(); });
    document.getElementById('law-case').addEventListener('change', e => { pageViews.lawCase = e.target.value; delete pageViews.law; law(g); });
    bindImages();
  }
  function guideMarkup(g) {
    const guide = g.guide;
    if (!guide) return '<p class="notice">법리 보충 정리를 불러오지 못했습니다. 원문 자료를 확인하세요.</p>';
    return `<div class="rule-guide">
      <section><h3>어떤 때 쟁점이 되는가</h3><p>${esc(guide.issue)}</p></section>
      <section class="rule-main"><h3>판단의 기준</h3><p>${esc(guide.rule)}</p></section>
      <section><h3>확인할 요건·판단 순서</h3><ol>${guide.checks.map(t=>`<li>${esc(t)}</li>`).join('')}</ol></section>
      <section class="rule-limits"><h3>예외·혼동 주의</h3><p>${esc(guide.limits)}</p></section>
      ${guide.corrections?.length ? `<section class="rule-corrections"><h3>원문 확인·교정 메모</h3>${guide.corrections.map(t=>`<p>${esc(t)}</p>`).join('')}</section>` : ''}
      <p class="rule-flow">${esc(guide.flow)}</p>
      <div class="rule-sources"><span>관련 조문·확인 근거</span>${(guide.articles||[]).map(a=>`<a href="https://www.law.go.kr/법령/민사소송법/제${a}조" target="_blank" rel="noopener">민사소송법 제${a}조 ↗</a>`).join('')}${(guide.extraSources||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a>`).join('')}</div>
      ${guide.application ? `<div class="rule-application"><h3>법리를 이 사례에 적용하면</h3><p>${esc(guide.application.text)}</p><button class="quiet" data-case="${guide.application.caseId}">해당 사례에서 연습 →</button></div>` : ''}
      <p class="guide-provenance">교수님 자료를 바탕으로 일반 법리를 보충한 학습용 정리입니다. 원문 인용은 아래 발췌·오른쪽 원문과 구별하며, 확인한 판례변경은 별도로 표시합니다.</p>
    </div>`;
  }
  function currentViewer(slot) {
    const c = byId.get(slot === 'law' ? pageViews.lawCase : activeCase);
    const custom = pageViews[slot]?.custom;
    const refs = custom ? [custom] : refsFor(c), ref=refs[pageViews[slot]?.ref || 0];
    const items = viewerItems(c,slot,ref.sourceId,custom);
    return {c,refs,ref:{...ref,pages:visiblePages(ref,items,pageViews[slot])},items};
  }
  function refreshViewer(slot) {
    const state = currentViewer(slot);
    const target = document.getElementById(slot === 'law' ? 'law-source' : slot === 'answer' ? 'answer-content' : 'problem-content');
    if (target) target.innerHTML = sourceViewer(state.c,slot,false,pageViews[slot]?.custom);
    bindImages();
  }
  function bindImages() {
    main.querySelectorAll('[data-transcript-source]').forEach(el=>{el.onchange=()=>{const slot=el.dataset.transcriptSource;pageViews[slot].transcriptSource=+el.value;delete pageViews[slot].transcriptQuote;refreshViewer(slot);};});
    main.querySelectorAll('[data-source-select]').forEach(el => { el.onchange = () => { const slot = el.dataset.sourceSelect; pageViews[slot].ref = +el.value; pageViews[slot].page = undefined; refreshViewer(slot); }; });
    main.querySelectorAll('[data-page-select]').forEach(el => { el.onchange = () => { const slot = el.dataset.pageSelect; pageViews[slot].page = +el.value; refreshViewer(slot); }; });
    main.querySelectorAll('img.source-image').forEach(img => { img.onerror = () => { img.alt = '원문 이미지가 없습니다. 위의 전체 PDF 링크로 확인하세요.'; toast('원문 이미지가 없어 전체 PDF로 확인해야 합니다.'); }; });
  }
  main.addEventListener('click', e => {
    const el = e.target.closest('button,[data-zoom]'); if (!el) return;
    if (el.dataset.case) { modelOpen = false; originalOpen = false; mobilePane = 'problem'; pageViews = {}; go('#case/'+el.dataset.case); }
    if (el.dataset.law) { pageViews = {}; go('#law/'+el.dataset.law); }
    if (el.dataset.back) go('#'+el.dataset.back);
    if (el.dataset.unit) { filter.unit = el.dataset.unit; records.unit = filter.unit; persist(); library(location.hash === '#laws'); }
    const slot = el.dataset.pagePrev || el.dataset.pageNext;
    if (slot && !el.disabled) { const state = currentViewer(slot), index = state.ref.pages.indexOf(pageViews[slot].page); pageViews[slot].page = state.ref.pages[index + (el.dataset.pageNext ? 1 : -1)]; refreshViewer(slot); }
    if(el.dataset.format) { const slot = el.dataset.format; pageViews[slot].format = pageViews[slot].format === 'image' ? 'text' : 'image'; refreshViewer(slot); }
    if(el.dataset.raw) { const slot=el.dataset.raw; pageViews[slot].raw=!pageViews[slot].raw; refreshViewer(slot); }
    if(el.dataset.focus) { const slot=el.dataset.focus; pageViews[slot].focus=!pageViews[slot].focus; refreshViewer(slot); }
    if(el.dataset.transcriptOriginal){const slot=el.dataset.transcriptOriginal;pageViews[slot] ||= {};pageViews[slot].original=!pageViews[slot].original;if(pageViews[slot].original)pageViews[slot].format='image';delete pageViews[slot].custom;refreshViewer(slot);}
    if (el.dataset.zoom) {
      const {ref,items} = currentViewer(el.dataset.zoom), page = pageViews[el.dataset.zoom].page;
      document.getElementById('zoom-title').textContent = `${bySource.get(ref.sourceId).name} · ${page}쪽`;
      const selected = items.filter(s=>s.page===page);
      document.getElementById('zoom-content').innerHTML = pageViews[el.dataset.zoom].focus && selected.length && selected.every(s=>s.kind==='region')
        ? `<div class="source-focus-zoom">${selected.map(s=>focusedImage(ref.sourceId,page,s)).join('')}</div>`
        : pageImage(ref.sourceId,page,selected);
      document.getElementById('zoom').showModal();
    }
    if (el.dataset.quote) {
      const g = byGroup.get(location.hash.split('/')[1]);
      pageViews.lawCase = el.dataset.quote; delete pageViews.law; law(g);
      const q=g.quotes[+el.dataset.qindex], page=+el.dataset.qpage, text=window.READING_SOURCE_TEXT[`${q.sourceId}:${page}`];
      if(TC.quote(T,q)&&TC.role(T,el.dataset.quote,'answer')){
        const refs=TC.sources(TC.role(T,el.dataset.quote,'answer'));
        pageViews.law={transcriptSource:Math.max(0,refs.findIndex(r=>r.sourceId===q.sourceId)),transcriptQuote:q.sha256};
        refreshViewer('law');document.querySelector('#law-source .readable-highlight')?.scrollIntoView({block:'center'});return;
      }
      const selected=FC.locate(text||'',q.text);
      const item=selected ? [{sourceId:q.sourceId,page,...selected,kind:'excerpt',rects:[]}]:[];
      pageViews.law = {ref:0,page,focus:!!item.length,custom:{sourceId:el.dataset.qsource,pages:q.sourcePages,items:item}};
      refreshViewer('law');
    }
  });
  function render() {
    const [route, id] = location.hash.slice(1).split('/');
    // Direct case links and browser history must not reuse another case's PDF/page choice.
    if(route==='case'&&activeCase!==id){pageViews={};modelOpen=false;originalOpen=false;mobilePane='problem';}
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === (route === 'law' ? 'laws' : route === 'case' ? 'library' : route || 'library')));
    if (route === 'case' && byId.has(id)) reading(byId.get(id));
    else if (route === 'law' && byGroup.has(id)) { activeCase = null; law(byGroup.get(id)); }
    else { activeCase = null; lastView = route === 'laws' ? 'laws' : 'library'; library(route === 'laws'); }
    window.scrollTo(0,0);
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('pagehide', saveDraft);
  document.addEventListener('visibilitychange', () => { if(document.hidden) saveDraft(); });
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => go('#'+b.dataset.view)));
  document.getElementById('records-open').addEventListener('click', () => { saveDraft(); document.getElementById('record-summary').textContent = `작성한 답안 ${Object.values(records.drafts).filter(d=>d.text).length}개 · 공부한 문제 ${Object.keys(records.studied).length}개 · 공부한 묶음 ${Object.keys(records.lawStudied).length}개`; document.getElementById('records').showModal(); });
  document.getElementById('zoom-close').addEventListener('click', () => document.getElementById('zoom').close());
  document.getElementById('export').addEventListener('click', () => { saveDraft(); const url = URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:'application/json'})); const a=document.createElement('a'); a.href=url; a.download=`민소-사례답안-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); });
  document.getElementById('import').addEventListener('change', async e => {
    const file = e.target.files[0]; if(!file || importPending) return; importPending=true;
    try { if(file.size > 10*1024*1024) throw new Error('기록 파일이 너무 큽니다.'); const incoming = C.validate(JSON.parse(await file.text()),new Set(byId.keys()),new Set(byGroup.keys())); if(!confirm('현재 새 화면의 답안과 공부기록을 가져온 파일로 교체할까요? 기존 기록을 먼저 내보내는 것을 권장합니다.')) return; records=incoming; filter.unit=records.unit; persist(); document.getElementById('records').close(); render(); toast('답안과 공부기록을 가져왔습니다.'); }
    catch(error) { toast(error.message); }
    finally { importPending=false; e.target.value=''; }
  });
  document.getElementById('reset').addEventListener('click', () => { if(!confirm('새 화면에서 작성한 모든 답안과 공부기록을 지울까요? 이전 연습실의 기록은 지우지 않습니다.')) return; records=C.blank(); persist(); filter.unit='all'; document.getElementById('records').close(); render(); toast('새 화면의 기록을 초기화했습니다.'); });
  render();
  if(persistError) toast('저장 기록을 읽지 못했습니다. 가능한 경우 기존 저장값을 백업해 두었습니다.');
})();
