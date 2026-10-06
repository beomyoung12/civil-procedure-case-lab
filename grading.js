(function (root) {
  'use strict';
  const SCHEMA_VERSION = 1;
  const DAY = 86400000;
  function normalize(value) {
    return String(value == null ? '' : value).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]/gu, '');
  }
  function accepted(keyword) {
    return [...new Set([keyword.label, ...(keyword.accept || [])].filter(Boolean).map(normalize))];
  }
  function exactMatch(value, keyword) {
    const answer = normalize(value);
    return answer.length > 0 && accepted(keyword).includes(answer);
  }
  // This is a conservative recall check, not a judgment about legal accuracy.
  function proseMatch(value, keyword, allowNegation) {
    const raw = String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR');
    const clauses = raw.replace(/(?<=\d)\.(?=\s*\d)/gu, '').split(/[.!?\n;。]|(?:그러나|반면|다만)/u).filter(Boolean);
    return clauses.some(clause => {
      const text = normalize(clause);
      return accepted(keyword).some(term => {
        if (!term) return false;
        let index = text.indexOf(term);
        while (index !== -1) {
          const before = text.slice(Math.max(0, index - 4), index);
          const after = text.slice(index + term.length, index + term.length + 14);
          const denied = !allowNegation && (/^(?:은|는|이|가|을|를|에|의|으로|로|이라고|라는|이다|이라|이란|에해당|이성립|가성립|성립|인정|발생|허용|가능|적용|효력|요건|해당|하지|되지|할수|될수|미치지|인정되지|발생하지|성립하지|적용되지|허용되지|있지){0,4}(?:없|않|아니|아님|안함|안한다|안됨|안된다|불성립|부정|배제)/u.test(after) || /(?:아닌|없는|부정하는|배제한)$/u.test(before));
          const misleadingPrefix = /(?:불|무)$/u.test(before) && !/(?:불|무)/u.test(term[0] || '');
          if (!denied && !misleadingPrefix) return true;
          index = text.indexOf(term, index + 1);
        }
        return false;
      });
    });
  }
  function blanks(item) {
    const output = [];
    item.outline.forEach((heading, hi) => {
      [...heading.body.matchAll(/\{\{([^{}]+)\}\}/g)].forEach((match, bi) => {
        const keyword = heading.keywords.find(k => accepted(k).includes(normalize(match[1]))) || { label: match[1], accept: [match[1]] };
        output.push({ key: hi + ':' + bi, headingIndex: hi, blankIndex: bi, label: match[1], keyword });
      });
    });
    return output;
  }
  function gradeCloze(item, values) {
    const details = blanks(item).map(blank => ({ ...blank, value: values[blank.key] || '', hit: exactMatch(values[blank.key], blank.keyword) }));
    return result(details);
  }
  function result(details) {
    const hits = details.filter(d => d.hit).length;
    return { hits, total: details.length, score: details.length ? Math.round(hits / details.length * 100) : 0, details, missing: details.filter(d => !d.hit) };
  }
  function gradeKeywords(item, values, integrated) {
    const details = item.outline.flatMap((heading, hi) => heading.keywords.map(keyword => {
      const expected = heading.body.replace(/\{\{([^{}]+)\}\}/g, '$1');
      const expectedIncludes = accepted(keyword).some(term => normalize(expected).includes(term));
      // A negative conclusion in the supplied study answer must not be rejected merely for being negative.
      const expectedNegative = expectedIncludes && !proseMatch(expected, keyword);
      return { headingIndex: hi, label: keyword.label, keyword, hit: proseMatch(integrated ? values : values[hi], keyword, expectedNegative) };
    }));
    return result(details);
  }
  function gradeOutline(item, selected) {
    const required = item.outline.map((_, index) => 'h' + index);
    const unique = [...new Set(selected)];
    const hits = unique.filter(id => required.includes(id)).length;
    const wrong = unique.filter(id => !required.includes(id)).length;
    return { hits, total: required.length, score: Math.round(hits / (required.length + wrong) * 100), missing: required.filter(id => !unique.includes(id)), wrong, orderMatches: unique.filter(id => required.includes(id)).join(',') === required.join(',') };
  }
  function emptyState(dataVersion) {
    return { schemaVersion: SCHEMA_VERSION, dataVersion: String(dataVersion), updatedAt: new Date().toISOString(), cases: {} };
  }
  function schedule(previous, score, assisted, now) {
    const timestamp = now == null ? Date.now() : now;
    const oldStreak = previous && previous.streak || 0;
    const sameDaySuccess = oldStreak > 0 && previous.lastStudied && timestamp - Date.parse(previous.lastStudied) < DAY;
    const streak = !assisted && score >= 80 ? Math.min(7, oldStreak + (sameDaySuccess ? 0 : 1)) : 0;
    const days = assisted || score < 60 ? 1 : score < 80 ? 2 : [1, 3, 7, 14, 30, 60, 90, 120][streak];
    return { streak, due: new Date(timestamp + days * DAY).toISOString(), intervalDays: days };
  }
  function recordAttempt(state, id, stage, grade, assisted, now) {
    const timestamp = now == null ? Date.now() : now;
    const previous = state.cases[id] || { bookmark: false, attempts: [], stages: {} };
    const plan = schedule(previous, grade.score, assisted, timestamp);
    const attempt = { stage, score: grade.score, assisted: Boolean(assisted), date: new Date(timestamp).toISOString() };
    const stages = { ...(previous.stages || {}) };
    const oldStage = stages[stage] || {};
    stages[stage] = { ...oldStage, latest: attempt, best: Math.max(oldStage.best || 0, assisted ? 0 : grade.score), completed: oldStage.completed || !assisted && grade.score >= 80 };
    state.cases[id] = { ...previous, ...plan, stages, attempts: [...(previous.attempts || []), attempt].slice(-100), lastScore: grade.score, lastAssisted: Boolean(assisted), lastStudied: attempt.date };
    state.updatedAt = attempt.date;
    return state.cases[id];
  }
  function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
  function validAttempt(attempt) {
    if (!attempt || !Number.isInteger(attempt.stage) || attempt.stage < 0 || attempt.stage > 3 || !Number.isFinite(attempt.score) || attempt.score < 0 || attempt.score > 100 || typeof attempt.assisted !== 'boolean' || !validDate(attempt.date)) throw new Error('채점 기록이 올바르지 않습니다.');
    return { stage: attempt.stage, score: attempt.score, assisted: attempt.assisted, date: attempt.date };
  }
  function validateState(value, ids, dataVersion) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== SCHEMA_VERSION || typeof value.cases !== 'object' || value.cases === null || Array.isArray(value.cases)) throw new Error('학습기록 파일의 형식 또는 버전이 맞지 않습니다.');
    if (String(value.dataVersion) !== String(dataVersion)) throw new Error('다른 자료 버전의 기록입니다. 현재 자료 버전과 일치하는 기록을 선택해 주세요.');
    const clean = emptyState(dataVersion);
    if (validDate(value.updatedAt)) clean.updatedAt = value.updatedAt;
    for (const [id, item] of Object.entries(value.cases)) {
      if (!ids.includes(id)) throw new Error('현재 자료에 없는 사례가 포함되어 있습니다: ' + id);
      if (!item || typeof item !== 'object' || !Array.isArray(item.attempts) || item.attempts.length > 100 || typeof item.bookmark !== 'boolean') throw new Error('학습기록 항목이 손상되어 있습니다.');
      if (item.due != null && !validDate(item.due)) throw new Error('복습 날짜가 올바르지 않습니다.');
      if (item.streak != null && (!Number.isInteger(item.streak) || item.streak < 0 || item.streak > 7)) throw new Error('복습 간격 정보가 올바르지 않습니다.');
      if (item.intervalDays != null && ![1, 2, 3, 7, 14, 30, 60, 90, 120].includes(item.intervalDays)) throw new Error('복습 간격 정보가 올바르지 않습니다.');
      const attempts = item.attempts.map(validAttempt);
      const stages = {};
      if (item.stages != null) {
        if (typeof item.stages !== 'object' || Array.isArray(item.stages)) throw new Error('단계별 성적 정보가 올바르지 않습니다.');
        // Keep lifetime achievements even when the detailed history has been capped at 100 entries.
        for (const [key, summary] of Object.entries(item.stages)) {
          const stage = Number(key);
          if (!/^[0-3]$/.test(key) || !summary || !Number.isFinite(summary.best) || summary.best < 0 || summary.best > 100 || typeof summary.completed !== 'boolean' || summary.completed !== (summary.best >= 80)) throw new Error('단계별 성적 정보가 올바르지 않습니다.');
          const latest = validAttempt(summary.latest);
          if (latest.stage !== stage || !latest.assisted && summary.best < latest.score) throw new Error('단계별 성적 정보가 올바르지 않습니다.');
          stages[stage] = { latest, best: summary.best, completed: summary.completed };
        }
      }
      for (const attempt of attempts) {
        const prior = stages[attempt.stage] || {};
        stages[attempt.stage] = { latest: attempt, best: Math.max(prior.best || 0, attempt.assisted ? 0 : attempt.score), completed: prior.completed || !attempt.assisted && attempt.score >= 80 };
      }
      clean.cases[id] = { bookmark: item.bookmark, attempts, stages, streak: item.streak || 0, ...(item.due ? { due: item.due } : {}), ...(item.intervalDays ? { intervalDays: item.intervalDays } : {}), ...(attempts.length ? { lastScore: attempts.at(-1).score, lastAssisted: attempts.at(-1).assisted, lastStudied: attempts.at(-1).date } : {}) };
    }
    return clean;
  }
  function validateDrafts(value, cases, dataVersion) {
    if (!value || value.schemaVersion !== 1 || String(value.dataVersion) !== String(dataVersion) || !value.drafts || typeof value.drafts !== 'object' || Array.isArray(value.drafts)) throw new Error('작성 중 답안의 자료 버전 또는 형식이 맞지 않습니다.');
    const clean = {};
    for (const [key, storedDraft] of Object.entries(value.drafts)) {
      let draft = storedDraft;
      const split = key.lastIndexOf(':');
      const caseId = key.slice(0, split); const stage = Number(key.slice(split + 1));
      const item = cases.find(c => c.id === caseId);
      if (!item || !/^[0-3]$/.test(key.slice(split + 1)) || !draft || typeof draft !== 'object' || typeof draft.hintUsed !== 'boolean' || typeof draft.modelShown !== 'boolean' || !draft.values || typeof draft.values !== 'object' || Array.isArray(draft.values) || !Array.isArray(draft.selected) || typeof draft.integrated !== 'string' || draft.integrated.length > 200000) throw new Error('작성 중 답안이 손상되어 있습니다.');
      const revision = item.draftRevision || 1;
      const storedRevision = draft.revision === undefined ? 1 : draft.revision;
      if (!Number.isInteger(storedRevision) || storedRevision < 1) throw new Error('작성 중 답안의 수정 버전이 올바르지 않습니다.');
      if (storedRevision !== revision) {
        const map = item.draftPreviousHeadingMap;
        if (storedRevision !== 1 || revision !== 2 || !Array.isArray(map)) throw new Error('작성 중 답안의 수정 버전이 맞지 않습니다.');
        const values = {};
        for (const [field, text] of Object.entries(draft.values)) {
          const match = (stage === 0 ? /^(\d+):(\d+)$/ : /^(\d+)$/).exec(field);
          if (!match || map[Number(match[1])] === undefined) throw new Error('작성 중 답안의 이전 입력값이 올바르지 않습니다.');
          values[stage === 0 ? map[Number(match[1])] + ':' + match[2] : String(map[Number(match[1])])] = text;
        }
        draft = { ...draft, values, selected: draft.selected.filter(id => /^h\d+$/.test(id)).map(id => 'h' + map[Number(id.slice(1))]) };
      }
      const allowed = stage === 0 ? blanks(item).map(b => b.key) : item.outline.map((_, i) => String(i));
      const values = {};
      for (const [field, text] of Object.entries(draft.values)) {
        if (!allowed.includes(field) || typeof text !== 'string' || text.length > 100000) throw new Error('작성 중 답안의 입력값이 올바르지 않습니다.');
        values[field] = text;
      }
      if (draft.selected.length > item.outline.length + 3 || draft.selected.some(id => typeof id !== 'string' || !/^(?:h\d+|d[0-2])$/.test(id) || id.startsWith('h') && Number(id.slice(1)) >= item.outline.length)) throw new Error('작성 중 목차 선택이 올바르지 않습니다.');
      clean[key] = { values, selected: [...new Set(draft.selected)], integrated: draft.integrated, hintUsed: draft.hintUsed || draft.modelShown, modelShown: draft.modelShown, revision };
    }
    return clean;
  }
  const api = { SCHEMA_VERSION, normalize, exactMatch, proseMatch, blanks, gradeCloze, gradeKeywords, gradeOutline, emptyState, schedule, recordAttempt, validateState, validateDrafts };
  root.CivilCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
