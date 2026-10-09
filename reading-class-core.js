(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.ClassCore=factory();
})(typeof window==='object'?window:this,function(){
  'use strict';
  function merge(base,reading,transcripts,extension){
    if(!extension)return {data:base,reading,transcripts};
    const known=new Set(base.cases.map(c=>c.id));
    for(const c of extension.cases){if(known.has(c.id))throw new Error('수업 문제 ID 중복');known.add(c.id);}
    const data={...base,cases:[...base.cases,...extension.cases],sources:[...base.sources,...extension.sources]};
    const groups=[...reading.groups,...extension.newGroups.map(g=>({...g,members:[],quotes:[]}))].map(g=>{
      const added=extension.cases.filter(c=>extension.links[c.id].includes(g.id)).map(c=>c.id);
      const members=[...new Set([...g.members,...added])];
      return {...g,members,quotes:[...g.quotes,...extension.quotes.filter(q=>added.includes(q.caseId)&&q.groupId===g.id)],
        classCount:added.length,important:added.length>0,
        caseCount:members.filter(id=>!reading.cases[id]?.supplement).length};
    });
    for(const ids of Object.values(extension.links))for(const id of ids){
      if(!groups.some(g=>g.id===id))throw new Error('수업 법리 연결 없음: '+id);
    }
    return {data,reading:{...reading,groups,cases:{...reading.cases,...extension.meta}},
      transcripts:{...transcripts,cases:{...transcripts.cases,...extension.transcripts},quotes:{...transcripts.quotes,...extension.quoteTexts}}};
  }
  function isClass(c){return c?.classMaterial===true;}
  function inView(c,view){return view!=='classes'||isClass(c);}
  function routeId(id){try{return decodeURIComponent(id||'');}catch{return '';}}
  function sourceRefIndex(refs,chosen){
    return refs.findIndex(r=>r.sourceId===chosen?.sourceId && chosen.pages.every(p=>r.pages.includes(p)));
  }
  function weekRange(cases){
    const weeks=[...new Set(cases.filter(isClass).map(c=>Number(c.year.match(/^(\d+)주차/)?.[1])).filter(Number.isFinite))].sort((a,b)=>a-b);
    return weeks.length?weeks.length===1?String(weeks[0]):`${weeks[0]}~${weeks.at(-1)}`:'—';
  }
  return {merge,isClass,inView,routeId,sourceRefIndex,weekRange};
});
