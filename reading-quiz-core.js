(function(root) {
  'use strict';
  const SCHEMA = 'civil-law-ox-v1';
  const owns = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
  function bank(quick, data, groups) {
    const result = new Map();
    for (const g of groups) {
      const item = quick[g.id];
      if (!item) throw new Error('OX 연결 문답 없음: '+g.id);
      [item,...(item.followups || [])].forEach((q,index) => {
        const id = `${g.id}:${index+1}`, ox = data.items[id];
        if (!ox || typeof ox.answer !== 'boolean' || typeof ox.statement !== 'string' || !ox.statement.trim() || !ox.answer && (typeof ox.correction!=='string' || !ox.correction.trim())) throw new Error('OX 자료 오류: '+id);
        result.set(id,{id,groupId:g.id,unit:g.unit,...q,statement:ox.statement,correct:ox.answer,answer:ox.correction || q.answer});
      });
    }
    if (result.size !== Object.keys(data.items).length) throw new Error('OX 문항 범위 불일치');
    return result;
  }
  function create(ids, title, bankVersion, random = Math.random) {
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error('시험 범위가 비었거나 중복됩니다.');
    const order = [...ids];
    for (let i=order.length-1;i>0;i--) {
      const j = Math.floor(random()*(i+1));
      [order[i],order[j]] = [order[j],order[i]];
    }
    return {schema:SCHEMA,bankVersion,title,ids:order,answers:{},cursor:0};
  }
  function validate(value, items, bankVersion) {
    if (!value || value.schema !== SCHEMA || value.bankVersion !== bankVersion) throw new Error('OX 기록 버전이 다릅니다.');
    if (!Array.isArray(value.ids) || !value.ids.length || value.ids.length > items.size || new Set(value.ids).size !== value.ids.length || value.ids.some(id=>!items.has(id))) throw new Error('OX 기록의 문항 범위가 잘못되었습니다.');
    if (!Number.isInteger(value.cursor) || value.cursor<0 || value.cursor>value.ids.length) throw new Error('OX 기록의 위치가 잘못되었습니다.');
    if (!value.answers || Array.isArray(value.answers) || typeof value.answers!=='object') throw new Error('OX 응답 기록이 잘못되었습니다.');
    const answers = {};
    for (const id of Object.keys(value.answers)) {
      if (!value.ids.includes(id) || typeof value.answers[id]!=='boolean') throw new Error('OX 응답이 잘못되었습니다.');
      answers[id] = value.answers[id];
    }
    // Only a completed prefix, optionally including the current question, is valid.
    for (const [i,id] of value.ids.entries()) {
      if (i<value.cursor && !owns(answers,id) || i>value.cursor && owns(answers,id)) throw new Error('OX 응답 순서가 잘못되었습니다.');
    }
    return {schema:SCHEMA,bankVersion,title:typeof value.title==='string'?value.title.slice(0,200):'저장된 시험',ids:[...value.ids],answers,cursor:value.cursor};
  }
  function answer(session, choice, items) {
    if (typeof choice!=='boolean') throw new Error('O 또는 X를 선택하세요.');
    const id=session.ids[session.cursor];
    if (!items.has(id) || owns(session.answers,id)) return session;
    return {...session,answers:{...session.answers,[id]:choice}};
  }
  function next(session) {
    return owns(session.answers,session.ids[session.cursor]) ? {...session,cursor:session.cursor+1} : session;
  }
  function score(session,items) {
    const attempted=session.ids.filter(id=>owns(session.answers,id));
    const wrong=attempted.filter(id=>session.answers[id]!==items.get(id).correct);
    return {total:session.ids.length,answered:attempted.length,correct:attempted.length-wrong.length,wrong,complete:session.cursor===session.ids.length};
  }
  function sameScope(session,ids) {
    const selected=new Set(ids);
    return !!session && session.ids.length===selected.size && session.ids.every(id=>selected.has(id));
  }
  const api={SCHEMA,bank,create,validate,answer,next,score,sameScope,owns};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  root.LawQuizCore=api;
})(typeof window!=='undefined'?window:globalThis);
