(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.StudyText=api;
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const names={민사소송법:'민사소송법',민소법:'민사소송법',민법:'민법',상법:'상법',국제사법:'국제사법',민사조정법:'민사조정법',민사집행법:'민사집행법',비송사건절차법:'비송사건절차법',약관규제법:'약관의 규제에 관한 법률',민사소송등인지규칙:'민사소송 등 인지규칙',인지규칙:'민사소송 등 인지규칙'};
  const lawPattern=Object.keys(names).sort((a,b)=>b.length-a.length).join('|');
  function citations(value){
    const text=String(value||''),out=[];
    const re=new RegExp(`(?:(?<law>${lawPattern})\\s*)?(?:제\\s*)?(?:(?<from>\\d+)\\s*[~∼～]\\s*)?(?<article>\\d+\\s*조(?:\\s*의\\s*\\d+)?)(?<parts>(?:\\s*(?:제\\s*)?\\d+\\s*[항호])*)`,'gu');
    const quoted=[...text.matchAll(/[‘“][^’”]*[’”]/gu)].map(m=>[m.index,m.index+m[0].length]);
    for(const m of text.matchAll(re)){
      const previous=out.at(-1),gap=previous?text.slice(previous.end,m.index):'';
      const chained=previous&&/^\s*(?:[·ㆍ,~∼～]|및|내지|와|과|부터|까지|또는)+\s*$/u.test(gap);
      const law=m.groups.law?names[m.groups.law]:chained?previous.law:'민사소송법';
      out.push({start:m.index,end:m.index+m[0].length,law,article:m.groups.article.replace(/\s/gu,''),from:m.groups.from?m.groups.from+'조':null,label:m[0],quoted:quoted.some(([a,b])=>m.index>=a&&m.index<b)});
    }
    return out;
  }
  function titles(value,catalog){
    const text=String(value||'');let out='',offset=0;
    for(const ref of citations(text)){
      let title=catalog?.laws?.[ref.law]?.titles?.[ref.article];
      if(ref.from){const from=catalog?.laws?.[ref.law]?.titles?.[ref.from];title=from&&title?from+'~'+title:null;}
      const label=ref.quoted?ref.label:ref.label.replace(/^(?:민사소송법|민소법)\s*/u,'').replace(/제(?=\s*\d)/gu,'');
      out+=text.slice(offset,ref.start)+label;
      // Quoted original mistakes stay quoted; do not legitimize them with a title.
      const after=text.slice(ref.end);
      if(title&&!ref.quoted&&!/^(?:\s*=|\(=)/u.test(after)){
        // Keep particles attached to the article, not to a different title noun:
        // "67조의" becomes "67조(=...규정)의", while "(233조)" uses "=".
        out+=/^(?:의|에|은|는|이|가|을|를|과|와|으로|로|상)/u.test(after)?'(='+title+')':'='+title;
      }
      offset=ref.end;
    }
    return out+text.slice(offset);
  }
  function lines(value){
    const text=String(value||'').replace(/\r\n?/gu,'\n');
    let out='',depth=0;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if('([（［'.includes(ch))depth++;
      if(')]）］'.includes(ch))depth=Math.max(0,depth-1);
      if(ch==='→'&&depth===0){out=out.trimEnd()+'\n→';continue;}
      out+=ch;
      if(depth)continue;
      const tail=text.slice(i+1),next=tail.match(/^\s+([^\s])/u)?.[1];
      const heading=/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX]/u.test(text[i-1]||'');
      if(/[.!?]/u.test(ch)&&next&&/[가-힣A-Za-zⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ①-⑳]/u.test(next)&&!heading&&!/\d/u.test(text[i-1]||'')){
        out+='\n';while(/\s/u.test(text[i+1]||'')&&i+1<text.length)i++;
      }else if(ch===','&&text[i-1]===')'&&/^\s+(?:대리인|그러나|다만|따라서|반면|법원|판례|당사자|피고|원고)/u.test(tail)){
        out+='\n';while(/\s/u.test(text[i+1]||'')&&i+1<text.length)i++;
      }
    }
    return out.trim();
  }
  return {citations,titles,lines,format:(text,catalog)=>lines(titles(text,catalog))};
});
