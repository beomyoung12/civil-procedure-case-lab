(function (root) {
  'use strict';
  const SCHEMA = 'civil-reading-v1';
  function blank() { return { schema: SCHEMA, drafts: {}, studied: {}, lawStudied: {}, lastCase: null, unit: 'all' }; }
  function validate(value, ids, groups) {
    if (!value || value.schema !== SCHEMA) throw new Error('이 화면에서 내보낸 기록 파일이 아닙니다.');
    const clean = blank();
    for (const [id, draft] of Object.entries(value.drafts || {})) {
      if (!ids.has(id)) continue;
      if (typeof draft.text !== 'string' || draft.text.length > 200000) throw new Error('답안 기록의 형식 또는 길이를 확인하세요.');
      clean.drafts[id] = { text: draft.text, updated: typeof draft.updated === 'string' ? draft.updated : '', viewed: !!draft.viewed };
    }
    for (const [id, time] of Object.entries(value.studied || {})) if (ids.has(id) && typeof time === 'string') clean.studied[id] = time;
    for (const [id, time] of Object.entries(value.lawStudied || {})) if (groups.has(id) && typeof time === 'string') clean.lawStudied[id] = time;
    clean.lastCase = ids.has(value.lastCase) ? value.lastCase : null;
    clean.unit = /^u\d\d$/.test(value.unit) ? value.unit : 'all';
    return clean;
  }
  function primaryCases(cases) { return cases.filter(c => !c.id.startsWith('n')); }
  function groupCount(group, cases) { const ids = new Set(primaryCases(cases).map(c => c.id)); return group.members.filter(id => ids.has(id)).length; }
  function imagePath(source, page) {
    if (!/^s[0-9a-f]+$/.test(source) || !Number.isInteger(page) || page < 1) throw new Error('잘못된 원문 위치');
    return `source-pages/${source}/page-${String(page).padStart(3, '0')}.jpg`;
  }
  const api = { SCHEMA, blank, validate, primaryCases, groupCount, imagePath };
  root.ReadingCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
