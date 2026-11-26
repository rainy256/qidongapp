import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overlapWindows,cellsPerRow,chunkCells,tickIndices,bestFutureSpan,preserveElapsedPicks} from '../components/overlap-layout.mjs';
const cells=(counts,start=100)=>counts.map((count,i)=>({slot:start+i,count,memberNames:[]}));
test('overlap context is exactly one cell on each side; past cells are hidden',()=>{
 const result=overlapWindows(cells([0,1,2,3,3,1,0,0,2,2,0]),101);
 assert.equal(result.overlapCount,2);
 assert.deepEqual(result.windows.map(w=>w.cells.map(c=>c.slot)),[[101,102,103,104,105],[107,108,109,110]]);
 assert.deepEqual(result.windows[0].runs,[{from:102,to:105,peak:3,minimum:2}]);
});
test('nearby expanded windows merge without duplicating cells; cut past slots',()=>{
 const result=overlapWindows(cells([3,2,2,1,0,2,3,1]),102);
 assert.equal(result.overlapCount,2);assert.equal(result.windows.length,1);
 assert.deepEqual(result.windows[0].cells.map(c=>c.slot),[102,103,104,105,106,107]);
 assert.equal(overlapWindows(cells([3,3]),102).future.length,0);
 assert.equal(overlapWindows(cells([0,1,1]),100).windows.length,0);
});
test('width-driven rows preserve all cells and avoid crowded ticks',()=>{
 for(const width of [160,200,250,320,600]){
 const max=cellsPerRow(width);assert.ok(max<=12&&max>=1);
 const rows=chunkCells(cells(Array(48).fill(3)),max);
 assert.equal(rows.flat().length,48);assert.ok(rows.every(r=>r.length<=max));
 for(const row of rows){const ticks=tickIndices(row.length,width);assert.equal(ticks[0],0);assert.equal(ticks.at(-1),row.length);for(let i=1;i<ticks.length;i++)assert.ok((ticks[i]-ticks[i-1])*width/row.length>=64);}
 }
});
test('quick join ignores elapsed high-density cells and chooses longest future peak',()=>{
 assert.deepEqual(bestFutureSpan(cells([3,3,0,1,2,2,0,2]),103),{from:104,to:106});
 assert.equal(bestFutureSpan(cells([3,3,0]),103),null);
});

test('saving future changes preserves elapsed picks, including marking unavailable',()=>{
 const saved=[{nightId:'today',from:100,to:110},{nightId:'tomorrow',from:148,to:152}];
 const draft=[{nightId:'today',from:100,to:104},{nightId:'tomorrow',from:150,to:155}];
 assert.deepEqual(preserveElapsedPicks(saved,draft,105,false).picks,[{nightId:'today',from:100,to:105},{nightId:'tomorrow',from:150,to:155}]);
 assert.deepEqual(preserveElapsedPicks(saved,draft,105,true).picks,[{nightId:'today',from:100,to:105}]);
});
