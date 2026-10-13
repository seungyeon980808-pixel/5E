const test = require('node:test');
const assert = require('node:assert/strict');
test('split bounds keep reversed drags and out-of-image gestures inside original pixels', async () => {
  const { splitRegion } = await import('../js/image-split-geometry.js');
  assert.deepEqual(splitRegion('rectangle',[{x:102.5,y:71.2},{x:-2,y:5.7}],100,80),{mode:'rectangle',x:0,y:5,width:100,height:67});
  assert.equal(splitRegion('rectangle',[{x:20,y:20},{x:22,y:60}],100,80),null);
  assert.equal(splitRegion('rectangle',[{x:NaN,y:20},{x:60,y:60}],100,80),null);
});
test('freehand requires an enclosed area and keeps source coordinates for provenance', async () => {
  const { splitRegion } = await import('../js/image-split-geometry.js');
  assert.equal(splitRegion('freehand',[{x:1,y:1},{x:20,y:20},{x:30,y:30}],100,80),null);
  const points=[{x:10.2,y:8.1},{x:50.7,y:8.1},{x:10.2,y:40.6}];
  const region=splitRegion('freehand',points,100,80);assert.deepEqual(region.points,points);assert.deepEqual([region.x,region.y,region.width,region.height],[10,8,41,33]);
});
