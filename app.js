(function () {
  'use strict';
  const data = window.CIVIL_DATA;
  const core = window.CivilCore;
  const view = document.getElementById('view');
  if (!data || !Array.isArray(data.units) || !Array.isArray(data.cases) || !Array.isArray(data.sources) || !core) {
    view.innerHTML = '<div class="empty-state"><h1>자료를 불러오지 못했습니다</h1><p>index.html과 data.js, grading.js, app.js가 같은 폴더에 있는지 확인해 주세요.</p></div>';
    return;
  }
  const STORAGE_KEY = 'civil-case-lab.records.v1';
  const DRAFT_KEY = 'civil-case-lab.drafts.v1.' + encodeURIComponent(String(data.version));
  const labels = ['답안 빈칸', '쟁점·목차', '키워드 회상', '통합 답안'];
  const sourceMap = new Map(data.sources.map(s => [s.id, s]));
  const unitMap = new Map(data.units.map(u => [u.id, u]));
  const caseMap = new Map(data.cases.map(c => [c.id, c]));
  const ids = data.cases.map(c => c.id);
  const ui = { view: 'library', unit: '', search: '', year: '', relation: 'primary', status: 'all', page: 1, caseId: null, stage: 0, focus: false };
  const drafts = new Map();
  let pendingDrafts = {};
  let draftStorageAvailable = true;
  let draftSaveTimer = null;
  try {
    const rawDrafts = localStorage.getItem(DRAFT_KEY);
    if (rawDrafts) pendingDrafts = core.validateDrafts(JSON.parse(rawDrafts), data.cases, data.version);
  } catch (_) { draftStorageAvailable = false; }
  let storageAvailable = true;
  let storageMessage = '';
  let state = core.emptyState(data.version);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = core.validateState(JSON.parse(raw), ids, data.version);
  } catch (error) {
    storageMessage = '저장된 기록을 읽지 못했습니다: ' + error.message + ' 원래 기록은 자동으로 삭제하지 않습니다. 기록관리에서 초기화하거나 올바른 백업을 가져와 주세요.';
    storageAvailable = false;
  }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function safeUrl(value) {
    if (typeof value !== 'string' || !value.trim() || /^(?:javascript|data|vbscript):/i.test(value.trim())) return '';
    if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^(?:https?|file):/i.test(value)) return '';
    return value;
  }
  function announce(message) { document.getElementById('live-status').textContent = message; }
  function save() {
    if (!storageAvailable) { announce('기록을 저장할 수 없어 이번 방문에서만 유지합니다. 기록 내보내기를 이용해 주세요.'); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { storageAvailable = false; storageMessage = '브라우저 저장공간을 사용할 수 없습니다. 이번 방문 중 기록은 유지되지만 창을 닫기 전에 내보내세요.'; announce(storageMessage); }
  }
  function saveDrafts() {
    if (draftSaveTimer) { clearTimeout(draftSaveTimer); draftSaveTimer = null; }
    if (!draftStorageAvailable) return;
    const serialized = { ...pendingDrafts };
    for (const [key, p] of drafts) serialized[key] = { values: p.values, selected: p.selected, integrated: p.integrated, hintUsed: Boolean(p.hintUsed || p.modelShown || p.feedbackShown), modelShown: Boolean(p.modelShown) };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ schemaVersion: 1, dataVersion: String(data.version), drafts: serialized })); }
    catch (_) { draftStorageAvailable = false; announce('작성 중 답안을 자동보관하지 못했습니다. 이 창을 닫기 전에 필요한 답안을 복사해 주세요.'); }
  }
  function queueDraftSave() {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(saveDrafts, 200);
  }
  function clearDrafts() { drafts.clear(); pendingDrafts = {}; draftStorageAvailable = true; saveDrafts(); }
  function flushDrafts() { captureDraft(); saveDrafts(); }
  function record(id) { return state.cases[id] || { bookmark: false, attempts: [], stages: {} }; }
  function due(item) { return Boolean(item.due && Date.parse(item.due) <= Date.now()); }
  function dateText(value) { return value ? new Date(value).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '미학습'; }
  function completed(id) { return Object.values(record(id).stages || {}).filter(s => s.completed).length; }
  function unitCases(unit) { return data.cases.filter(c => c.unit === unit); }
  function isPdf(source) { return Boolean(source && source.kind !== 'text' && source.format !== 'text' && (/\.pdf(?:[?#]|$)/i.test(source.url || '') || /\.pdf$/i.test(source.name || '') || source.format === 'pdf')); }
  function sourceText(item) {
    const source = sourceMap.get(item.sourceId);
    return (source ? source.name : '원문 자료') + (isPdf(source) ? ' · PDF ' + (item.sourcePages || []).join(', ') + '쪽' : ' · 원문 정리본');
  }
  function sourceLink(item) {
    const source = sourceMap.get(item.sourceId);
    const url = source && safeUrl(source.url);
    const pdf = isPdf(source);
    const label = pdf ? '원문 PDF ' + (item.sourcePages || []).join(', ') + '쪽' : '원문 정리본';
    const target = pdf && url ? url.split('#')[0] + '#page=' + (item.sourcePages?.[0] || 1) : url;
    return target ? '<a href="' + esc(target) + '" target="_blank" rel="noopener">' + esc(label) + ' ↗</a>' : '<span>' + esc(label) + ' · 링크 미첨부</span>';
  }
  function unitNotes(unit) {
    if (!unit?.notes?.length) return '';
    return '<details class="unit-notes"><summary>진도 핵심·연결 <span class="small">' + unit.notes.length + '개 압축 메모</span></summary><div class="unit-note-grid">' + unit.notes.map(note => '<article><h3>' + esc(note.title) + '</h3><p>' + esc(note.text) + '</p>' + (note.sourceId ? '<div class="small">' + sourceLink(note) + '</div>' : '') + '</article>').join('') + '</div><p class="small">메모는 쟁점 연결을 돕는 학습용 요약입니다. 사례별 사실관계에 따라 적용 여부를 검토하세요.</p></details>';
  }
  function evidence(item) {
    return '<details class="source-evidence"><summary>근거 자료·답안 작성 범위 보기</summary><p>' + esc(item.sourceNote || '') + '</p><ul>' + [item, ...(item.relatedSources || [])].map(ref => '<li>' + esc(sourceMap.get(ref.sourceId)?.name || '원문 자료') + ' · ' + sourceLink(ref) + '</li>').join('') + '</ul></details>';
  }
  function references(item) {
    if (!item.references?.length) return '';
    const official = item.references.filter(ref => typeof ref.url === 'string' && /^https?:\/\//i.test(ref.url));
    if (!official.length) return '';
    return '<div class="reference-links"><span>공식 확인 자료</span>' + official.map(ref => '<a href="' + esc(ref.url) + '" target="_blank" rel="noopener">' + esc(ref.title) + ' ↗</a>').join('') + '</div>';
  }
  function kindBadge(item) { return '<span class="tag ' + (item.answerKind === 'supplied' ? 'supplied' : 'constructed') + '">' + (item.answerKind === 'supplied' ? '자료 기반 답안' : '학습용 구성답안') + '</span>'; }
  function stageDots(item) {
    return '<div class="stage-dots" aria-label="단계별 독립 회상 달성">' + labels.map((label, index) => '<span class="stage-dot ' + (record(item.id).stages[index]?.completed ? 'done' : '') + '" title="' + esc(label + (record(item.id).stages[index]?.completed ? ': 독립회상 80% 이상 달성' : ': 미달성')) + '">' + index + '</span>').join('') + '</div>';
  }
  function bookmarkButton(id) { return '<button type="button" class="bookmark-button ' + (record(id).bookmark ? 'saved' : '') + '" data-bookmark="' + esc(id) + '" aria-label="' + (record(id).bookmark ? '보관함에서 해제' : '보관함에 추가') + '" aria-pressed="' + Boolean(record(id).bookmark) + '">' + (record(id).bookmark ? '★' : '☆') + '</button>'; }
  function stats() {
    const attempted = ids.filter(id => record(id).attempts.length).length;
    const finished = ids.filter(id => completed(id) === 4).length;
    const dues = ids.filter(id => due(record(id))).length;
    return { attempted, finished, dues, bookmarks: ids.filter(id => record(id).bookmark).length };
  }
  function renderNav() {
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === ui.view));
    document.getElementById('due-count').textContent = stats().dues;
    document.getElementById('unit-list').innerHTML = '<button type="button" class="unit-button ' + (!ui.unit ? 'active' : '') + '" data-unit=""><span class="unit-number">ALL</span><span class="unit-name">전체 진도 한눈에</span><span class="unit-amount">' + data.cases.length + '</span></button>' + data.units.map((unit, index) => '<button type="button" class="unit-button ' + (ui.unit === unit.id ? 'active' : '') + '" data-unit="' + esc(unit.id) + '"><span class="unit-number">' + String(index + 1).padStart(2, '0') + '</span><span class="unit-name">' + esc(unit.title) + '</span><span class="unit-amount">' + unitCases(unit.id).length + '</span></button>').join('');
    document.getElementById('unit-select').innerHTML = '<option value="">전체 진도 한눈에</option>' + data.units.map((unit, index) => '<option value="' + esc(unit.id) + '" ' + (ui.unit === unit.id ? 'selected' : '') + '>' + String(index + 1).padStart(2, '0') + ' · ' + esc(unit.title) + ' (' + unitCases(unit.id).length + ')</option>').join('');
    document.body.classList.toggle('focus-mode', Boolean(ui.caseId && ui.focus));
  }
  function renderSources() {
    return '<details class="source-files"><summary>원문 자료 목록 · ' + data.sources.length + '개 파일</summary><p class="small">쪽수는 PDF 파일의 실제 페이지 순서(1부터)입니다. 원문 파일은 별도로 허가받은 범위에서만 보관·공유하세요.</p><ul>' + data.sources.map(source => {
      const url = safeUrl(source.url);
      return '<li>' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(source.name) + ' ↗</a>' : esc(source.name) + ' · 링크 미첨부') + (isPdf(source) && source.pages ? ' <span>(PDF ' + esc(source.pages) + '쪽)</span>' : !isPdf(source) ? ' <span>· 원문 정리본</span>' : '') + '</li>';
    }).join('') + '</ul></details>';
  }
  function filteredCases() {
    return data.cases.filter(item => {
      if (ui.view === 'review' && !due(record(item.id))) return false;
      if (ui.view === 'bookmarks' && !record(item.id).bookmark) return false;
      if (ui.status === 'wrong' && (!record(item.id).attempts.length || !(record(item.id).lastScore < 80 || record(item.id).lastAssisted))) return false;
      if (ui.status === 'new' && record(item.id).attempts.length) return false;
      if (ui.status === 'complete' && completed(item.id) !== 4) return false;
      if (ui.unit && item.unit !== ui.unit && !(ui.relation === 'related' && (item.relatedUnits || []).includes(ui.unit))) return false;
      if (ui.year && String(item.year || '미상') !== ui.year) return false;
      const haystack = [item.title, item.facts, item.prompt, ...item.outline.map(h => h.title), sourceMap.get(item.sourceId)?.name, unitMap.get(item.unit)?.title].join(' ');
      return !ui.search || core.normalize(haystack).includes(core.normalize(ui.search));
    }).sort((a, b) => ui.view === 'review' ? Date.parse(record(a.id).due) - Date.parse(record(b.id).due) : data.units.findIndex(u => u.id === a.unit) - data.units.findIndex(u => u.id === b.unit));
  }
  function card(item) {
    const rec = record(item.id);
    const stage = labels.findIndex((_, index) => !rec.stages[index]?.completed);
    const location = isPdf(sourceMap.get(item.sourceId)) ? 'PDF ' + (item.sourcePages || []).join(', ') + '쪽' : '원문 정리본';
    return '<article class="case-card"><div><div class="card-meta"><span>' + esc(unitMap.get(item.unit)?.title || '') + '</span>' + (item.year ? '<span>· ' + esc(item.year) + '</span>' : '') + kindBadge(item) + '</div><h3>' + esc(item.title) + '</h3><p class="card-preview">' + esc(item.facts) + '</p><div class="card-footer">' + stageDots(item) + '<span>' + (rec.attempts.length ? '최근 ' + rec.lastScore + '% ' + (rec.lastAssisted ? '· 도움 회상' : '· 독립 회상') : '아직 시작하지 않음') + '</span>' + (rec.due ? '<span>' + (due(rec) ? '복습할 때' : '다음 복습 ' + dateText(rec.due)) + '</span>' : '') + '<span>' + esc(location) + '</span></div></div><div class="card-actions">' + bookmarkButton(item.id) + '<button type="button" class="primary" data-open-case="' + esc(item.id) + '" data-start-stage="' + Math.max(0, stage) + '">' + (rec.attempts.length ? '이어서 학습' : '사례 시작') + ' →</button></div></article>';
  }
  function statusFilters() {
    return '<div class="status-filters" aria-label="학습 상태별 필터">' + [['all', '전체'], ['wrong', '오답·도움 회상'], ['new', '미학습'], ['complete', '네 단계 달성']].map(([id, title]) => '<button type="button" data-status="' + id + '" class="' + (ui.status === id ? 'active' : '') + '" aria-pressed="' + (ui.status === id) + '">' + title + '</button>').join('') + '</div>';
  }
  function renderLibrary() {
    const stat = stats();
    const unit = unitMap.get(ui.unit);
    const title = ui.view === 'review' ? '지금 다시 떠올릴 사례' : ui.view === 'bookmarks' ? '다시 보고 싶은 사례' : unit ? unit.title : '사례로 쌓는 민사소송법';
    const description = ui.view === 'review' ? '힌트 없이 먼저 회상해 보세요. 독립 회상 성적에 따라 다음 복습 간격이 늘어납니다.' : ui.view === 'bookmarks' ? '별표로 저장해 둔 사례를 진도별로 다시 연습합니다.' : unit ? unit.description || '이 진도에 해당하는 사례를 하나씩 풀며 쟁점의 연결을 익힙니다.' : '진도를 고르고, 답안의 빈칸부터 통합 서술까지. 읽는 공부를 넘어 스스로 꺼내 쓰는 연습을 합니다.';
    const list = filteredCases();
    const years = [...new Set(data.cases.map(c => String(c.year || '미상')))].sort((a, b) => b.localeCompare(a, 'ko'));
    const content = '<div class="view-heading"><div><span class="eyebrow">' + (ui.view === 'library' ? 'BUILD YOUR LEGAL REASONING' : ui.view === 'review' ? 'SPACED RECALL' : 'YOUR CASE COLLECTION') + '</span><h1>' + esc(title) + '</h1><p>' + esc(description) + '</p></div><div class="hero-note">작은 회상 한 번이<br>답안의 구조를 만듭니다.</div></div>' +
      (storageMessage ? '<div class="notice warning">' + esc(storageMessage) + '</div>' : '') +
      '<div class="metrics"><div class="metric"><span>수록 사례</span><strong>' + data.cases.length + '<small>개</small></strong></div><div class="metric"><span>학습 시작</span><strong>' + stat.attempted + '<small>개</small></strong></div><div class="metric"><span>네 단계 달성</span><strong>' + stat.finished + '<small>개</small></strong></div><div class="metric"><span>오늘 복습</span><strong>' + stat.dues + '<small>개</small></strong></div></div>' + unitNotes(unit) +
      (!ui.unit && ui.view === 'library' && !ui.search && !ui.year ? '<div class="section-title"><h2>18개 진도, 하나의 논증 흐름</h2><span class="small">주된 쟁점 기준 분류</span></div><div class="unit-grid">' + data.units.map((u, index) => {
        const cases = unitCases(u.id);
        const finishedStages = cases.reduce((sum, c) => sum + completed(c.id), 0);
        const ratio = cases.length ? Math.round(finishedStages / (cases.length * 4) * 100) : 0;
        return '<button type="button" class="unit-tile" data-unit="' + esc(u.id) + '"><span class="tile-number">UNIT ' + String(index + 1).padStart(2, '0') + '</span><h3>' + esc(u.title) + '</h3><span class="tile-bottom"><span>' + cases.length + '개 사례</span><span>' + (cases.length ? '독립 회상 ' + ratio + '%' : '수록 사례 준비 중') + ' →</span></span><span class="progress-track"><span class="progress-fill" style="display:block;width:' + ratio + '%"></span></span></button>';
      }).join('') + '</div>' : '') +
      '<section aria-labelledby="case-list-title"><div class="section-title"><h2 id="case-list-title">' + (ui.unit ? '이 진도의 사례' : '사례 탐색') + '</h2><span class="small">' + list.length + '개 사례</span></div><div class="toolbar"><div class="search-field"><label class="field-label" for="case-search">자료·쟁점 검색</label><input id="case-search" type="search" placeholder="예: 기판력, 일부청구, 당사자" value="' + esc(ui.search) + '"></div><div><label class="field-label" for="case-year">연도 · 보조 필터</label><select id="case-year"><option value="">모든 연도</option>' + years.map(y => '<option ' + (ui.year === y ? 'selected' : '') + '>' + esc(y) + '</option>').join('') + '</select></div><div><label class="field-label" for="case-relation">진도 연결</label><select id="case-relation"><option value="primary" ' + (ui.relation === 'primary' ? 'selected' : '') + '>주된 진도만</option><option value="related" ' + (ui.relation === 'related' ? 'selected' : '') + '>관련 진도 포함</option></select></div><p class="filter-note"><span>연도보다 쟁점·진도를 먼저 고르세요. 관련 진도 포함은 선택한 진도에 연결되는 다른 사례도 표시합니다.</span>' + (ui.search || ui.year ? '<button type="button" class="text-button" data-clear-filters>검색 초기화</button>' : '') + '</p></div><div class="case-list">' + (list.length ? list.slice(0, ui.page * 12).map(card).join('') : '<div class="empty-state"><h3>' + (ui.view === 'review' ? '오늘 예정된 복습이 없습니다' : ui.view === 'bookmarks' ? '아직 저장된 사례가 없습니다' : '조건에 맞는 사례가 없습니다') + '</h3><p>' + (ui.view === 'review' ? '새 사례를 공부하거나 학습한 사례를 자유롭게 다시 풀어보세요.' : ui.view === 'bookmarks' ? '사례 카드의 별표를 누르면 이곳에 모입니다.' : '다른 진도나 검색어로 찾아보세요. 사례가 없는 진도에는 이후 자료를 추가할 수 있습니다.') + '</p></div>') + '</div>' + (list.length > ui.page * 12 ? '<button type="button" data-load-more style="width:100%;margin-top:18px">사례 더 보기 (' + (list.length - ui.page * 12) + '개 남음)</button>' : '') + '</section>' + renderSources() + '<p class="disclaimer">학습용 회상 도구입니다. 자동 점수는 설정된 핵심어의 회상 정도만 표시하며, 법적 타당성이나 실제 시험의 점수를 판정하지 않습니다. 구성답안 및 자료와 현행 법률의 차이는 별도 확인이 필요합니다.</p>';
    view.innerHTML = content.replace('<div class="case-list">', statusFilters() + '<div class="case-list">');
  }
  function shuffle(values, seed) {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function practice() {
    const key = ui.caseId + ':' + ui.stage;
    if (!drafts.has(key)) {
      const item = caseMap.get(ui.caseId);
      const correct = item.outline.map((h, index) => ({ id: 'h' + index, title: h.title }));
      const titles = new Set(correct.map(o => core.normalize(o.title)));
      const extras = data.cases.filter(c => c.id !== item.id).sort((a, b) => Number(b.unit === item.unit) - Number(a.unit === item.unit)).flatMap(c => c.outline).filter(h => {
        const text = core.normalize(h.title);
        if (titles.has(text) || item.outline.some(o => core.normalize(o.title).includes(text) || text.includes(core.normalize(o.title)))) return false;
        titles.add(text); return true;
      }).slice(0, 3).map((h, i) => ({ id: 'd' + i, title: h.title }));
      const seed = [...item.id].reduce((n, c) => n + c.charCodeAt(0), 7);
      const restored = pendingDrafts[key] || {};
      const options = shuffle([...correct, ...extras], seed);
      drafts.set(key, { values: {}, selected: [], integrated: '', hintUsed: false, modelShown: false, ...restored, selected: (restored.selected || []).filter(id => options.some(o => o.id === id)), grade: null, options });
      delete pendingDrafts[key];
    }
    return drafts.get(key);
  }
  function renderBody(heading, hi, p) {
    let bi = 0;
    const tokens = heading.body.split(/(\{\{[^{}]+\}\})/g);
    return tokens.map(token => {
      if (!/^\{\{/.test(token)) return esc(token);
      const label = token.slice(2, -2);
      const key = hi + ':' + bi++;
      const hit = p.grade && p.grade.details.find(d => d.key === key)?.hit;
      return '<input type="text" autocomplete="off" spellcheck="false" data-blank="' + key + '" class="blank-input ' + (p.grade ? hit ? 'correct' : 'incorrect' : '') + '" style="width:' + Math.min(32, Math.max(8, label.length + 3)) + 'ch" aria-label="' + esc(heading.title + ' 빈칸 ' + bi) + '" value="' + esc(p.values[key] || '') + '">';
    }).join('');
  }
  function task(item, p) {
    if (ui.stage === 0) return '<div class="task-intro"><h3>답안의 핵심을 채워보세요</h3><p>논증의 흐름을 읽으며 빈칸에 법률 개념·요건을 적습니다. 띄어쓰기와 등록된 동의어를 허용합니다.</p></div>' + item.outline.map((h, hi) => '<section class="heading-block" id="heading-' + hi + '"><h3><span class="heading-index">' + String(hi + 1).padStart(2, '0') + '</span>' + esc(h.title) + '</h3><div class="cloze-body">' + renderBody(h, hi, p) + '</div></section>').join('');
    if (ui.stage === 1) return '<div class="task-intro"><h3>필요한 쟁점만 고르세요</h3><p>이 설문의 학습답안에서 다루는 핵심 목차를 선택한 뒤, 아래에서 위·아래 버튼으로 자신의 논증 순서를 만드세요. 선택 순서는 섞여 있습니다.</p></div><div class="outline-pool">' + p.options.map(o => '<label class="outline-option"><input type="checkbox" data-outline-option="' + o.id + '" ' + (p.selected.includes(o.id) ? 'checked' : '') + '><span>' + esc(o.title) + '</span></label>').join('') + '</div><h3 class="outline-subtitle">내가 구성한 목차 <span class="small">' + p.selected.length + '개</span></h3><ol class="selected-headings">' + (p.selected.length ? p.selected.map((id, index) => '<li class="selected-heading"><b class="heading-index">' + (index + 1) + '</b><span>' + esc(p.options.find(o => o.id === id)?.title || '') + '</span><div class="move-buttons"><button type="button" data-move="' + index + '" data-direction="-1" aria-label="' + esc(p.options.find(o => o.id === id)?.title + ' 위로 이동') + '" ' + (!index ? 'disabled' : '') + '>↑</button><button type="button" data-move="' + index + '" data-direction="1" aria-label="' + esc(p.options.find(o => o.id === id)?.title + ' 아래로 이동') + '" ' + (index === p.selected.length - 1 ? 'disabled' : '') + '>↓</button><button type="button" data-remove-heading="' + id + '" aria-label="목차에서 제거">×</button></div></li>').join('') : '<li class="small">위에서 목차를 선택하면 이곳에 놓입니다.</li>') + '</ol><p class="notice">목차의 세부 순서는 유일한 법적 정답이 아닙니다. 점수는 수록 학습답안의 쟁점 목록과 일치하는 정도만 표시합니다. 채점 후 자료의 학습용 순서와 흐름을 대조하세요.</p>';
    if (ui.stage === 2) return '<div class="task-intro"><h3>목차별로 핵심어를 꺼내 쓰세요</h3><p>각 목차의 법리·요건·사안 적용을 자유롭게 적습니다. 문장 또는 키워드 나열 모두 가능하며, 떠올린 핵심어만큼 부분 점수가 부여됩니다.</p></div>' + item.outline.map((h, hi) => '<section class="heading-block" id="heading-' + hi + '"><h3><span class="heading-index">' + String(hi + 1).padStart(2, '0') + '</span>' + esc(h.title) + '</h3><label class="sr-only" for="keyword-' + hi + '">' + esc(h.title) + ' 핵심어 회상</label><textarea id="keyword-' + hi + '" class="keyword-textarea" data-keywords="' + hi + '" placeholder="이 목차에서 설명할 개념과 요건, 사실관계 연결을 적어보세요." spellcheck="false">' + esc(p.values[hi] || '') + '</textarea><p class="input-note">설정된 핵심어 ' + h.keywords.length + '개 · 문장 완성도는 직접 대조합니다.</p></section>').join('');
    return '<div class="task-intro"><h3>하나의 답안으로 통합하세요</h3><p>목차를 보지 않고 쟁점, 법리, 사안 적용, 결론을 연결해 적어보세요. 핵심어 회상 점수와 별도로 답안의 구조를 스스로 검토합니다.</p></div><label class="sr-only" for="integrated-answer">통합 회상 답안</label><textarea id="integrated-answer" class="integrated-textarea" spellcheck="false" placeholder="Ⅰ. 쟁점\nⅡ. 법리와 요건\nⅢ. 사안 적용\nⅣ. 결론\n\n자신의 언어로 논증을 완성해 보세요.">' + esc(p.integrated) + '</textarea><p class="input-note">핵심어 자동 검사는 법적 결론의 정확성이나 논리적 모순을 판정하지 못합니다.</p>';
  }
  function flows(item) {
    return (item.flow || []).map(line => '<div class="flow-row">' + String(line).split(/\s*→\s*/).map((node, i) => (i ? '<span class="flow-arrow" aria-hidden="true">→</span>' : '') + '<span class="flow-node">' + esc(node) + '</span>').join('') + '</div>').join('');
  }
  function model(item) {
    return '<div class="model-answer"><h3>학습용 답안과 대조</h3><p class="small">' + (item.answerKind === 'supplied' ? '원문에 수록된 답안·기준을 압축하고 재구성했습니다.' : '원문 질문을 바탕으로 학습을 위해 작성한 구성답안입니다. 교수님 답안으로 확인된 자료가 아닙니다.') + '</p>' + item.outline.map(h => '<h4>' + esc(h.title) + '</h4><p>' + h.body.split(/(\{\{[^{}]+\}\})/g).map(t => /^\{\{/.test(t) ? '<mark>' + esc(t.slice(2, -2)) + '</mark>' : esc(t)).join('') + '</p>').join('') + '</div>';
  }
  function feedback(item, p) {
    if (!p.grade) return '';
    const grade = p.grade;
    const rec = record(item.id);
    const assist = p.gradedAssisted;
    const detail = ui.stage === 1 ? '<p>필수 쟁점 ' + grade.hits + '/' + grade.total + '개 · 추가 선택 ' + grade.wrong + '개</p><div class="keyword-results">' + item.outline.map((h, i) => '<span class="keyword-result ' + (grade.missing.includes('h' + i) ? 'miss' : '') + '">' + (grade.missing.includes('h' + i) ? '누락 · ' : '회상 · ') + esc(h.title) + '</span>').join('') + '</div><p>자료의 권장 순서: ' + item.outline.map(h => esc(h.title)).join(' → ') + '</p><p class="small">순서는 점수에 반영하지 않습니다. 쟁점과 전제·결론의 연결을 직접 점검하세요.</p>' : '<p>회상한 핵심어 ' + grade.hits + '/' + grade.total + '개. ' + (grade.missing.length ? '빠진 핵심어를 중심으로 다시 회상해 보세요.' : '핵심어를 모두 확인했습니다. 사안 적용과 결론도 직접 대조하세요.') + '</p><div class="keyword-results">' + grade.details.map(d => '<span class="keyword-result ' + (d.hit ? '' : 'miss') + '">' + (d.hit ? '✓ ' : '다시 · ') + esc(d.label) + '</span>').join('') + '</div>';
    return '<section id="feedback" class="feedback" aria-label="채점 피드백"><div class="score-line"><div><h3>' + (assist ? '도움을 받아 회상했어요' : '독립 회상 결과') + '</h3><span class="small">' + (assist ? '힌트·답안 사용 · 단계 달성에는 미반영' : '80% 이상이면 이 단계 달성') + '</span></div><div class="score-number">' + grade.score + '<small>%</small></div></div>' + detail + '<p class="small">자동 채점은 등록된 표현만 확인합니다. 올바른 다른 표현이 누락되거나 단어만으로 정답 처리될 수 있으므로, 아래 논증 흐름·답안과 대조하세요.</p><h4 style="font-size:12px;margin:20px 0 8px">논증 흐름</h4>' + flows(item) + (item.traps?.length ? '<h4 style="font-size:12px;margin:18px 0 6px">혼동 주의</h4><ul class="trap-list">' + item.traps.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') + (ui.stage === 3 ? '<h4 style="font-size:12px;margin:22px 0 8px">답안의 핵심 구조 · 자기 점검</h4><div class="self-check">' + ['설문의 요구에 맞는 쟁점을 빠짐없이 골랐다', '법리·요건을 제시한 뒤 구체적 사실에 연결했다', '전제와 결론이 모순되지 않게 연결했다', '각 쟁점에 대해 설문에 답하는 결론을 썼다'].map((text, i) => '<label><input type="checkbox" data-self-check="' + i + '" ' + (p.selfChecks?.[i] ? 'checked' : '') + '><span>' + esc(text) + '</span></label>').join('') + '</div><p class="small">자기 점검은 자동 점수와 별개입니다.</p>' : '') + '<p class="small">다음 복습: ' + dateText(rec.due) + (assist ? ' · 도움 회상은 하루 뒤 다시 연습합니다.' : ' · 낮은 성적은 짧게, 독립 회상 성공은 간격을 늘립니다.') + '</p>' + (p.modelShown ? model(item) : '<button type="button" data-reveal-model>학습용 답안 펼쳐서 대조</button>') + '</section>';
  }
  function renderStudy() {
    const item = caseMap.get(ui.caseId);
    if (!item) { ui.caseId = null; renderLibrary(); return; }
    const p = practice();
    const list = filteredCases();
    const index = list.findIndex(c => c.id === item.id);
    const header = '<div class="study-topbar"><button type="button" class="text-button" data-return>← 사례 목록으로</button><div class="right-actions"><button type="button" class="text-button focus-switch" data-focus aria-pressed="' + ui.focus + '">' + (ui.focus ? '진도 메뉴 표시' : '집중 화면') + '</button>' + bookmarkButton(item.id) + '</div></div>' +
      '<header class="study-header"><span class="eyebrow">' + esc(unitMap.get(item.unit)?.title || '') + '</span><h1>' + esc(item.title) + '</h1><div class="case-meta">' + (item.year ? '<span>' + esc(item.year) + '</span>' : '') + kindBadge(item) + (item.relatedUnits || []).map(id => '<button type="button" class="text-button" data-unit="' + esc(id) + '">관련: ' + esc(unitMap.get(id)?.title || id) + '</button>').join('') + '</div><div class="source-line"><div>' + esc(sourceText(item)) + ' · ' + sourceLink(item) + '</div>' + evidence(item) + (item.answerKind === 'constructed' ? '<p class="source-badge">구성답안: 원문에 수록된 교수님 답안·공식 채점기준이 아닙니다.</p>' : '') + '</div></header>' + (item.caution ? '<div class="notice warning">주의 · ' + esc(item.caution) + '</div>' : '') + references(item);
    const stages = '<nav class="stage-tabs" aria-label="회상 단계">' + labels.map((label, i) => '<button type="button" class="stage-tab ' + (ui.stage === i ? 'active ' : '') + (record(item.id).stages[i]?.completed ? 'done' : '') + '" data-stage="' + i + '" aria-current="' + (ui.stage === i ? 'step' : 'false') + '"><span class="stage-no">' + i + '</span><span>' + label + '</span></button>').join('') + '</nav><div class="jump-links"><a href="#facts">사실관계</a><a href="#practice">답안 작성</a>' + (p.grade ? '<a href="#feedback">피드백</a>' : '') + '</div>';
    const facts = '<section id="facts" class="facts-panel"><div class="panel-header"><h2>사실관계와 설문</h2><span class="small">CASE FILE</span></div><div class="panel-content"><div class="facts-text">' + esc(item.facts) + '</div><div class="question-box"><h3>설문</h3><p style="white-space:pre-wrap;margin-bottom:0">' + esc(item.prompt) + '</p></div></div></section>';
    const answer = '<section id="practice" class="answer-panel"><div class="panel-header"><h2>' + labels[ui.stage] + '</h2><button type="button" class="text-button" data-new-attempt>빈 답안으로 새 회상</button></div><div class="panel-content"><p class="input-note">' + (draftStorageAvailable ? '작성 중 답안은 이 브라우저에 자동보관합니다. 채점기록 파일에는 작성 중 답안을 포함하지 않습니다.' : '작성 중 답안을 자동보관할 수 없습니다. 필요한 내용은 창을 닫기 전에 복사하세요.') + '</p>' + task(item, p) + (p.hintUsed && !p.grade ? '<div class="hint-box"><h4>힌트·피드백 이력 · 이 회상은 도움 사용으로 기록됩니다</h4><p>' + (ui.stage === 1 ? '자료의 쟁점은 ' + item.outline.length + '개입니다. ' + esc(item.outline[0].title) + '에서 출발해 보세요.' : '각 목차의 첫 핵심어: ' + item.outline.map(h => esc(h.keywords[0]?.label || '')).join(' · ')) + '</p></div>' : '') + '<div class="practice-actions"><button type="button" class="primary" data-grade ' + (p.grade ? 'disabled' : '') + '>' + (p.grade ? '채점 완료 · 수정 후 재채점 가능' : '회상 채점하기') + '</button><button type="button" class="hint-button" data-hint ' + (p.grade ? 'disabled' : '') + '>힌트</button><button type="button" data-reveal-model>' + (p.grade ? '답안 대조' : '모르겠어요 · 답안') + '</button></div><p class="input-note">힌트·답안·채점 피드백을 본 뒤 수정하는 회상은 도움 사용으로 기록됩니다. 새 독립 회상은 빈 답안으로 시작하세요.</p>' + feedback(item, p) + '</div></section>';
    const footer = '<div class="study-footer"><button type="button" data-return>목록으로</button><div style="display:flex;gap:8px">' + (ui.stage < 3 ? '<button type="button" class="primary" data-stage="' + (ui.stage + 1) + '">다음 단계 →</button>' : '') + (list[index + 1] ? '<button type="button" data-open-case="' + esc(list[index + 1].id) + '" data-start-stage="0">다음 사례 →</button>' : '') + '</div></div>';
    view.innerHTML = header + stages + '<div class="study-layout">' + facts + answer + '</div>' + footer + renderSources();
  }
  function render() { renderNav(); ui.caseId ? renderStudy() : renderLibrary(); }
  function topFocus() { document.getElementById('main').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function captureDraft() {
    if (!ui.caseId) return;
    const p = practice();
    // Read the current controls before switching screens; this also retains an in-progress IME/autofill value.
    view.querySelectorAll('[data-blank]').forEach(input => { p.values[input.dataset.blank] = input.value; });
    view.querySelectorAll('[data-keywords]').forEach(input => { p.values[input.dataset.keywords] = input.value; });
    const integrated = view.querySelector('#integrated-answer');
    if (integrated?.id === 'integrated-answer') p.integrated = integrated.value;
    queueDraftSave();
  }
  function updateDraft(event) {
    if (!ui.caseId) return;
    const p = practice();
    const element = event.target;
    if (element.dataset.blank != null) p.values[element.dataset.blank] = element.value;
    else if (element.dataset.keywords != null) p.values[element.dataset.keywords] = element.value;
    else if (element.id === 'integrated-answer') p.integrated = element.value;
    else return;
    if (p.grade) {
      p.grade = null;
      p.hintUsed = true;
      const button = view.querySelector('[data-grade]');
      button.disabled = false; button.textContent = '수정한 답안 재채점';
      view.querySelector('[data-hint]').disabled = false;
      view.querySelector('#feedback')?.remove();
      view.querySelectorAll('.blank-input').forEach(input => input.classList.remove('correct', 'incorrect'));
    }
    queueDraftSave();
  }
  function calculate(item, p) {
    return ui.stage === 0 ? core.gradeCloze(item, p.values) : ui.stage === 1 ? core.gradeOutline(item, p.selected) : core.gradeKeywords(item, ui.stage === 3 ? p.integrated : p.values, ui.stage === 3);
  }
  function grade(reveal) {
    const item = caseMap.get(ui.caseId);
    const p = practice();
    if (p.feedbackShown && !p.grade) p.hintUsed = true;
    if (reveal && !p.grade) p.hintUsed = true;
    if (!p.grade) { p.grade = calculate(item, p); p.gradedAssisted = p.hintUsed; core.recordAttempt(state, item.id, ui.stage, p.grade, p.gradedAssisted); save(); }
    p.feedbackShown = true;
    if (reveal) { p.modelShown = true; p.hintUsed = true; }
    saveDrafts();
    render();
    view.querySelector('#feedback').scrollIntoView({ block: 'start', behavior: 'smooth' });
    announce(p.grade.score + '퍼센트. ' + (p.gradedAssisted ? '도움 회상으로 기록했습니다.' : '독립 회상으로 기록했습니다.'));
  }
  document.addEventListener('input', function (event) {
    if (event.target.id === 'case-search') {
      ui.search = event.target.value; ui.page = 1;
      if (event.isComposing) return;
      const start = event.target.selectionStart; const end = event.target.selectionEnd;
      renderLibrary();
      const input = document.getElementById('case-search'); input.focus(); input.setSelectionRange(start, end);
    } else updateDraft(event);
  });
  document.addEventListener('compositionend', function (event) {
    if (event.target.id !== 'case-search') return;
    ui.search = event.target.value; ui.page = 1; renderLibrary();
    const input = document.getElementById('case-search'); input.focus(); input.setSelectionRange(ui.search.length, ui.search.length);
  });
  document.addEventListener('change', function (event) {
    const element = event.target;
    captureDraft();
    if (element.id === 'unit-select') { ui.unit = element.value; ui.caseId = null; ui.page = 1; render(); }
    else if (element.id === 'case-year') { ui.year = element.value; ui.page = 1; renderLibrary(); }
    else if (element.id === 'case-relation') { ui.relation = element.value; ui.page = 1; renderLibrary(); }
    else if (element.dataset.outlineOption) {
      const p = practice(); const id = element.dataset.outlineOption;
      p.selected = element.checked ? [...p.selected.filter(x => x !== id), id] : p.selected.filter(x => x !== id);
      p.grade = null; renderStudy();
      view.querySelector('[data-outline-option="' + id + '"]').focus();
    } else if (element.dataset.selfCheck != null) {
      const p = practice(); p.selfChecks = p.selfChecks || {}; p.selfChecks[element.dataset.selfCheck] = element.checked;
    }
  });
  document.addEventListener('click', function (event) {
    const element = event.target.closest('button, a.brand');
    if (!element) return;
    captureDraft();
    if (element.matches('a.brand')) { event.preventDefault(); ui.caseId = null; ui.unit = ''; ui.view = 'library'; render(); topFocus(); }
    else if (element.dataset.view) { ui.view = element.dataset.view; ui.caseId = null; ui.unit = ''; ui.search = ''; ui.year = ''; ui.status = 'all'; ui.page = 1; render(); topFocus(); }
    else if (element.dataset.unit != null) { ui.unit = element.dataset.unit; ui.view = 'library'; ui.caseId = null; ui.page = 1; render(); topFocus(); }
    else if (element.dataset.openCase) { ui.caseId = element.dataset.openCase; ui.stage = Number(element.dataset.startStage || 0); render(); topFocus(); }
    else if (element.dataset.bookmark) {
      const id = element.dataset.bookmark; const prior = record(id);
      state.cases[id] = { ...prior, bookmark: !prior.bookmark }; save();
      announce(state.cases[id].bookmark ? '보관함에 추가했습니다.' : '보관함에서 해제했습니다.'); render();
    } else if (element.dataset.status) { ui.status = element.dataset.status; ui.page = 1; renderLibrary(); view.querySelector('[data-status="' + ui.status + '"]')?.focus(); }
    else if (element.dataset.stage != null) { ui.stage = Number(element.dataset.stage); renderStudy(); view.querySelector('#practice').scrollIntoView({ block: 'start' }); view.querySelector('[data-stage="' + ui.stage + '"]').focus({ preventScroll: true }); }
    else if (element.hasAttribute('data-return')) { ui.caseId = null; render(); topFocus(); }
    else if (element.hasAttribute('data-focus')) { ui.focus = !ui.focus; render(); }
    else if (element.hasAttribute('data-clear-filters')) { ui.search = ''; ui.year = ''; ui.page = 1; renderLibrary(); }
    else if (element.hasAttribute('data-load-more')) { ui.page++; renderLibrary(); }
    else if (element.hasAttribute('data-grade')) grade(false);
    else if (element.hasAttribute('data-new-attempt')) {
      if (!window.confirm('이 단계의 작성 중 답안을 비우고 새 회상을 시작할까요? 기존 채점기록과 복습 일정은 유지됩니다.')) return;
      const key = ui.caseId + ':' + ui.stage; drafts.delete(key); delete pendingDrafts[key]; practice(); saveDrafts(); renderStudy(); announce('빈 답안으로 새 회상을 시작했습니다.');
    }
    else if (element.hasAttribute('data-reveal-model')) grade(true);
    else if (element.hasAttribute('data-hint')) { practice().hintUsed = true; renderStudy(); announce('힌트를 사용했습니다. 이번 회상은 도움 사용으로 기록됩니다.'); }
    else if (element.dataset.move != null) {
      const p = practice(); const from = Number(element.dataset.move); const to = from + Number(element.dataset.direction);
      if (to >= 0 && to < p.selected.length) [p.selected[from], p.selected[to]] = [p.selected[to], p.selected[from]];
      p.grade = null; renderStudy();
      let focusButton = view.querySelector('[data-move="' + to + '"][data-direction="' + element.dataset.direction + '"]');
      if (focusButton?.disabled) focusButton = view.querySelector('[data-move="' + to + '"][data-direction="' + -Number(element.dataset.direction) + '"]');
      focusButton?.focus(); announce((to + 1) + '번째 목차로 이동했습니다.');
    } else if (element.dataset.removeHeading) { const p = practice(); p.selected = p.selected.filter(id => id !== element.dataset.removeHeading); p.grade = null; renderStudy(); }
  });
  const dialog = document.getElementById('records-dialog');
  function renderRecords() {
    document.getElementById('storage-status').textContent = storageAvailable ? '이 브라우저에 기록을 저장하고 있습니다. 자료 버전: ' + data.version : storageMessage || '영구 저장을 사용할 수 없습니다. 기록을 내보내 주세요.';
    const stat = stats();
    document.getElementById('records-summary').innerHTML = '<p class="small">학습 시작 ' + stat.attempted + '개 · 네 단계 달성 ' + stat.finished + '개 · 보관함 ' + stat.bookmarks + '개</p><table class="history-table"><thead><tr><th>단계</th><th>독립 최고점 평균</th><th>회상 횟수</th></tr></thead><tbody>' + labels.map((label, index) => {
      const scores = ids.map(id => record(id).stages[index]?.best).filter(value => value != null);
      const count = ids.reduce((sum, id) => sum + record(id).attempts.filter(a => a.stage === index).length, 0);
      return '<tr><td>' + index + ' · ' + label + '</td><td>' + (scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) + '%' : '—') + '</td><td>' + count + '회</td></tr>';
    }).join('') + '</tbody></table>';
  }
  document.getElementById('records-button').addEventListener('click', function () { renderRecords(); dialog.showModal(); });
  document.getElementById('import-trigger').addEventListener('click', function () { document.getElementById('import-records').click(); });
  document.querySelector('[data-close-dialog]').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  document.getElementById('export-records').addEventListener('click', function () {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = '민사논증-학습기록-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); announce('학습기록 파일을 내보냈습니다.');
  });
  document.getElementById('import-records').addEventListener('change', async function (event) {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('파일이 너무 큽니다. 4MB 이하의 학습기록을 선택해 주세요.');
      const imported = core.validateState(JSON.parse(await file.text()), ids, data.version);
      if (!window.confirm('가져온 기록으로 현재 학습기록을 대체하고 작성 중 답안을 비울까요? 기록은 먼저 내보내고, 필요한 작성 내용은 따로 복사해 두세요.')) return;
      state = imported; storageAvailable = true; storageMessage = ''; save(); clearDrafts(); render(); renderRecords(); announce('기록을 가져왔습니다. 작성 중 답안은 초기화했습니다.');
    } catch (error) { window.alert('기록을 가져오지 못했습니다. ' + error.message); }
    finally { event.target.value = ''; }
  });
  document.getElementById('reset-records').addEventListener('click', function () {
    if (!window.confirm('모든 단계 점수, 복습 일정, 보관함과 현재 자료의 작성 중 답안을 초기화할까요? 기록은 백업이 없으면 복구할 수 없으며, 작성 중 답안은 따로 복사해 두어야 합니다.')) return;
    state = core.emptyState(data.version); storageAvailable = true; storageMessage = ''; clearDrafts(); save(); render(); renderRecords(); announce('학습기록과 작성 중 답안을 초기화했습니다.');
  });
  window.addEventListener('storage', function (event) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { state = core.validateState(JSON.parse(event.newValue), ids, data.version); renderNav(); if (!ui.caseId) renderLibrary(); announce('다른 창의 학습기록 변경을 반영했습니다.'); } catch (_) { /* A bad external record must not overwrite this tab. */ }
  });
  window.addEventListener('pagehide', flushDrafts);
  window.addEventListener('beforeunload', flushDrafts);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushDrafts(); });
  render();
})();
