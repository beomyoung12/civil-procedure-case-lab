(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.ReadableCore=factory();
})(typeof window==='object'?window:this,function(){
  'use strict';
  // This layer handles typography, not legal reasoning or unreviewed OCR repair.
  function spacing(value){
    return value.replace(/\s+/g,' ').trim()
      .replace(/제\s*(\d+)\s*(조|항|호)/g,'제$1$2')
      .replace(/(\d+)\s+(심|점|세|개월|주|년|월|일|억원|만원|천만|억|만)(?=[\s),.·]|[가-힣])/g,'$1$2')
      .replace(/\(\s+/g,'(').replace(/\s+\)/g,')')
      .replace(/([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]|\d+)\s+\.(?=\s)/g,'$1.');
  }
  // Only join line-wrap splits in these explicit terms; never invent missing text.
  const terms=['관할합의','관할권','관련재판적','소송요건','소송능력','당사자적격','당사자능력','판례','제소','소송물','청구기각','소각하','직권조사','피보전채권','피대위권리','증명책임','기판력','표현대리','무권대리','유추적용','소멸시효','추완항소','처분문서','진정성립','통상공동소송','필수적공동소송','여부'];
  function joinLines(lines){
    let result='';
    for(const line of lines){
      const clean=line.trim();if(!clean)continue;
      if(!result){result=clean;continue;}
      let join=false;
      for(const word of terms)for(let i=1;i<word.length;i++)if(result.endsWith(word.slice(0,i))&&clean.startsWith(word.slice(i)))join=true;
      result+=(join?'':' ')+clean;
    }
    return spacing(result);
  }
  function lineKind(line){
    const t=spacing(line);
    if(/^\d{1,2}\.\s*\d{1,2}\./.test(t))return 'paragraph'; // a wrapped month/day is not an outline heading
    if(/^\[(?:설문|문제|문항)[^\]]+\]$/.test(t)||/^(?:<|〈|＜)공통(?:의)?\s*사실관계(?:>|〉|＞)/.test(t))return 'question';
    if(/^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+|[IVX]{1,5})\s*[.．)]\s*\S/.test(t)&&t.length<=120)return 'major';
    if(/^(?:\d{1,2}\s*[.．)]|\(\d{1,2}\)|[가나다라마바사아자차카타파하]\s*[.)]|[①-⑳])\s*\S/.test(t)){
      const prose=/[?？:：]|[.!?]$|(?:다|요|므로|거나|하면|이면|이며|이고|것은|에서는|없는|있는|있을|대해|관하여|위하여|통하여|[은는이가을를에와과])$/.test(t)
        ||(/의$/.test(t)&&!t.endsWith('의의'))
        ||/(?:갑|을|병|甲|乙|丙|丁|X|Y|Z|원고|피고|법원)(?:은|는|이|가|을|를)/.test(t);
      return t.length<=50&&!prose?'minor':'item';
    }
    if(/^\*\s*(?:원고|피고|공통)/.test(t))return 'minor';
    return 'paragraph';
  }
  function editsFor(raw,edits,offset=0){
    const end=offset+raw.length;
    return (edits||[]).filter(e=>e.start>=offset&&e.end<=end&&raw.slice(e.start-offset,e.end-offset)===e.before);
  }
  function apply(raw,edits,offset=0){
    let result='',cursor=0;const used=[];
    for(const e of editsFor(raw,edits,offset).sort((a,b)=>a.start-b.start)){
      const start=e.start-offset,end=e.end-offset;
      if(start<cursor)continue;
      result+=raw.slice(cursor,start)+e.after;cursor=end;used.push(e);
    }
    return {text:result+raw.slice(cursor),edits:used};
  }
  function blocks(raw,options={}){
    const {offset=0,edits=[],ranges=[]}=options;
    const output=[],lines=[];let start=0,end=0,kind='paragraph',cursor=0;
    function flush(){
      if(!lines.length)return;
      const original=raw.slice(start,end),fixed=apply(original,edits,offset+start);
      const text=joinLines(fixed.text.split(/\r?\n/));
      output.push({kind,text,start:offset+start,end:offset+end,edits:fixed.edits,highlight:ranges.some(([a,b])=>offset+start<b&&offset+end>a)});
      lines.length=0;kind='paragraph';
    }
    for(const match of raw.matchAll(/[^\n]*(?:\n|$)/g)){
      const value=match[0];if(!value)continue;
      const line=value.replace(/\r?\n$/,'');cursor=match.index;
      if(!line.trim()){flush();continue;}
      const next=lineKind(line);
      const prev=lines[lines.length-1]||'';
      const indent=(line.match(/^\s*/)?.[0].length||0),prevIndent=(prev.match(/^\s*/)?.[0].length||0);
      // A newly indented sentence after a complete sentence is a paragraph cue.
      // Do not split a wrapped condition or a sentence merely because it is long.
      if(next==='paragraph'&&indent>=2&&indent>prevIndent&&/[.!?。]$/.test(prev.trim()))flush();
      // Headings stay separate; numbered prose keeps its following continuation.
      if(next!=='paragraph'||['major','minor','question','folio'].includes(kind))flush();
      if(!lines.length){start=cursor;kind=next;}
      // An isolated page numeral is retained, but visually secondary.
      if(lines.length===0&&/^\s*\d+\s*$/.test(line)&&Number(line)===options.page&&(cursor<12||raw.length-cursor<15))kind='folio';
      lines.push(line);end=cursor+line.length;
    }
    flush();return output;
  }
  return {spacing,joinLines,lineKind,editsFor,apply,blocks};
});
