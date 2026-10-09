(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FocusCore = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  function selections(focus, id, role, sourceId, page) {
    return (focus[id]?.[role] || []).filter(s => s.sourceId === sourceId && (page == null || s.page === page));
  }
  function references(refs, focus, id, role) {
    return refs.map(r => ({...r, pages: [...new Set([...r.pages, ...selections(focus,id,role,r.sourceId).map(s => s.page)])].sort((a,b) => a-b)}));
  }
  function ranges(text, items) {
    const ordered = items.filter(s => typeof s.start === 'number' && text.slice(s.start,s.end) === s.text)
      .map(s => [s.start,s.end]).sort((a,b) => a[0]-b[0]);
    const result = [];
    for (const interval of ordered) {
      const prev = result[result.length-1];
      if (prev && interval[0] <= prev[1]) prev[1] = Math.max(prev[1],interval[1]);
      else result.push([...interval]);
    }
    return result;
  }
  function rectangles(items) {
    return items.flatMap(s => s.rects || []).filter(r => r.length === 4 && r.every(Number.isFinite) && r[0]>=0 && r[1]>=0 && r[2]>0 && r[3]>0 && r[0]+r[2]<=1.001 && r[1]+r[3]<=1.001);
  }
  function locate(text, quote) {
    const chars=[],positions=[];
    for(let i=0;i<text.length;i++) if(!/\s/.test(text[i])) {chars.push(text[i]);positions.push(i);}
    const needle=quote.replace(/\s+/g,''), found=chars.join('').indexOf(needle);
    if(found<0 || !needle.length) return null;
    const start=positions[found],end=positions[found+needle.length-1]+1;
    return {start,end,text:text.slice(start,end)};
  }
  return {selections, references, ranges, rectangles, locate};
});
