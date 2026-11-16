import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shapePreservingHandles, sampleShapeSegment } from '../js/function-graph/shape-preserving.js';
const scenarios = [
  { name: 'plateau-extrema', points: [[0,0],[1,1],[2,1],[3,1],[4,0],[5,-1],[6,0]] },
  { name: 'descending-x', points: [[7,0],[5,1],[4,1],[3,-1],[0,0]] },
  { name: 'uneven-x', points: [[0,0],[0.01,1],[3,2],[3.001,3],[8,0]] },
  { name: 'mixed-cycle-vertical-reversal', points: [[0,1],[0,3],[3,3],[3,1],[2,0.5],[1,0.7],[0,1]], modes: ['line','line','line','smooth','smooth','smooth'] },
  { name: 'breaks', points: [[0,0],[1,1],[2,1],[3,0]], breaks: [2] },
];
const results = scenarios.map(s => {
  const points=s.points.map(([x,y])=>({x,y})), before=JSON.stringify(points), h=shapePreservingHandles(points,s.modes,s.breaks);
  let samples=0, plateauMaxError=0;
  for(let i=0;i<points.length-1;i++) {
    if(s.breaks?.includes(i+1)) continue;
    const a=points[i],b=points[i+1];
    for(let j=0;j<=100;j++) {
      const t=j/100,u=1-t;
      const y=u*u*u*a.y+3*u*u*t*(a.y+h[i].oy)+3*u*t*t*(b.y+h[i+1].iy)+t*t*t*b.y;
      assert(y>=Math.min(a.y,b.y)-1e-12 && y<=Math.max(a.y,b.y)+1e-12,`${s.name}/${i}: overshoot ${y}`);
      if(a.y===b.y) plateauMaxError=Math.max(plateauMaxError,Math.abs(y-a.y));
      samples++;
    }
  }
  assert.equal(JSON.stringify(points),before);
  return {scenario:s.name,pass:true,samples,plateauMaxError};
});
const ap=[{x:0,y:0},{x:1,y:1}], ah=[{ix:0,iy:0,ox:0,oy:1},{ix:-1,iy:0,ox:0,oy:0}];
assert.deepEqual(sampleShapeSegment(ap,ah,0,0.5,['line']),{x:0.5,y:0.5,dx:1,dy:1});
assert.deepEqual(sampleShapeSegment(ap,ah,0,0.5,['smooth']),{x:0.125,y:0.875,dx:0.75,dy:0.75});
results.push({scenario:'segment-arrow-position-tangent',pass:true});
const dir=process.env.EVIDENCE_DIR;
if(dir){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(`${dir}/shape-results.json`,JSON.stringify({invocation:'EVIDENCE_DIR=<dir> node tests/test-graph-shape-preserving.mjs',results},null,2));}
console.log(JSON.stringify(results,null,2));
