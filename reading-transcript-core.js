(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.TranscriptCore=factory();
})(typeof window==='object'?window:this,function(){
  'use strict';
  function role(data,id,name){return data?.cases?.[id]?.[name]||null;}
  function sources(row){
    const result=[];
    for(const segment of row?.segments||[]){
      let source=result.find(s=>s.sourceId===segment.sourceId);
      if(!source){source={sourceId:segment.sourceId,sourceFile:segment.sourceFile,pages:[],segments:[]};result.push(source);}
      source.segments.push(segment);source.pages.push(...segment.pages);
    }
    for(const source of result)source.pages=[...new Set(source.pages)].sort((a,b)=>a-b);
    return result;
  }
  function choice(row,index=0){const refs=sources(row);return refs[Number.isInteger(index)&&index>=0&&index<refs.length?index:0]||null;}
  function quote(data,original){return data?.quotes?.[original.sha256]||null;}
  return {role,sources,choice,quote};
});
