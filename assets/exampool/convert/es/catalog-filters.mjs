import {matchesPaper} from './paper-profile.mjs';
import { subjectGroup } from './search.mjs?v=library-release-20261011-3';
export function curriculumOptions(catalog, filters = {}) {
  const from = Number(filters.yearFrom || filters.year) || 0, to = Number(filters.yearTo || filters.year) || Infinity;
  const rows=catalog.facets.filter(f=>(!filters.group||subjectGroup(f.subject).value===filters.group)
    &&(!filters.subject||f.subject===filters.subject)&&f.year>=from&&f.year<=to
    &&(!filters.month||f.month===Number(filters.month))&&matchesPaper(f,filters));
  const frameworks=[...new Set(rows.map(f=>f.framework).filter(Boolean))].sort();
  const applicable=rows.filter(f=>!filters.framework||f.framework===filters.framework);
  const units=[...new Set(applicable.flatMap(f=>[...f.unit.split(/\s*·\s*/u),...f.standards.map(s=>s.unit)]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  if (filters.preserveUnit && applicable.some(f=>f.unit===filters.preserveUnit) && !units.includes(filters.preserveUnit)) units.push(filters.preserveUnit);
  const codes=new Set(applicable.flatMap(f=>f.standards.filter(s=>!filters.unit||s.unit===filters.unit||f.unit===filters.unit).map(s=>s.value)));
  return {frameworks,units,standards:catalog.status.standards.filter(s=>codes.has(s.value))};
}

export function listFiles(catalog,filters={}) {
 const from=Number(filters.yearFrom)||0,to=Number(filters.yearTo)||Infinity,month=Number(filters.month)||0;
 return catalog.files.filter(f=>(!filters.group||subjectGroup(f.subject).value===filters.group)&&(!filters.subject||f.subject===filters.subject)
  &&f.year>=from&&f.year<=to&&(!month||f.month===month)).flatMap(file=>{
   const {profiles,...value}=file;
   const eligible=(profiles||[]).filter(p=>matchesPaper({...p,subject:file.subject},filters));
   if(file.questionCount&&!eligible.length)return [];
   const questionCount=eligible.reduce((n,p)=>n+p.questionCount,0);
   return [{...value,questionCount,matchedCount:questionCount,...(eligible.length?{firstMatchPage:Math.min(...eligible.map(p=>p.firstMatchPage))}:{})}];
 });
}
