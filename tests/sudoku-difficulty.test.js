import { createDifficultyPuzzle } from '../sudoku-game/js/difficulty-generator.js';
const createPuzzle = (random = Math.random) => {
  const result = createDifficultyPuzzle('easy', { random });
  if (result.status !== 'success') throw new Error('Test puzzle generation failed');
  return result.puzzle;
};
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradePuzzle, findLogicalStep, DIFFICULTY_VERSION } from '../sudoku-game/js/difficulty.js';
import { solve } from '../sudoku-game/js/puzzle.js';

const board = () => Array(81).fill(0);
const mask = (...digits) => digits.reduce((m,d) => m | (1 << (d-1)), 0);
const step = (masks, technique) => findLogicalStep(board(), masks, technique);
const removed = (deduction, index, digit) => deduction?.eliminations?.some(e => e.index === index && e.digits.includes(digit));

test('singles distinguish one candidate from one position in a unit', () => {
  const m = Array(81).fill(mask(1,2,3)); m[0] = mask(4);
  assert.deepEqual(step(m,'naked-single'),{ placement:{index:0,digit:4} });
  m[0]=mask(1,4);
  assert.equal(step(m,'naked-single'),null);
  assert.deepEqual(step(m,'hidden-single'),{ placement:{index:0,digit:4} });
});

test('locked candidates support pointing and claiming without erasing their source', () => {
  let m = Array(81).fill(mask(1,2,3));
  m[0] |= mask(4); m[1] |= mask(4); m[8] |= mask(4);
  let s = step(m,'locked-candidates');
  assert.ok(removed(s,8,4)); assert.ok(!removed(s,0,4));
  // Row 0 confines 4 to box 0; other box cells may lose it.
  m = Array(81).fill(mask(1,2,3));
  for(const i of [0,1,9,19]) m[i] |= mask(4);
  s=step(m,'locked-candidates');
  assert.ok(removed(s,9,4)); assert.ok(removed(s,19,4)); assert.ok(!removed(s,0,4));
});

test('naked pairs and triples remove only their union from other unit cells', () => {
  let m=Array(81).fill(511);m[0]=m[1]=mask(2,7);
  let s=step(m,'naked-pair');
  assert.ok(removed(s,2,2));assert.ok(removed(s,2,7));assert.ok(!removed(s,0,2));
  m[1]=mask(2,7,9);assert.equal(step(m,'naked-pair'),null);
  m=Array(81).fill(511);m[0]=mask(1,2);m[1]=mask(2,3);m[2]=mask(1,3);
  s=step(m,'naked-triple');
  assert.ok(removed(s,3,1));assert.ok(removed(s,3,2));assert.ok(removed(s,3,3));
  m[2]=mask(1,4);assert.equal(step(m,'naked-triple'),null);
});

test('hidden pairs and triples remove unrelated candidates from their cells', () => {
  for(const count of [2,3]) {
    const m=Array(81).fill(mask(4,5,6,7,8,9));
    for(let i=0;i<count;i++) m[i]=511;
    const s=step(m,count===2?'hidden-pair':'hidden-triple');
    for(let i=0;i<count;i++) { assert.ok(removed(s,i,4));assert.ok(!removed(s,i,1)); }
    m.fill(511); // With all candidates everywhere there is no confined subset.
    assert.equal(step(m,count===2?'hidden-pair':'hidden-triple'),null);
  }
});

test('X-Wing works in both orientations and requires exactly matching positions', () => {
  for(const transpose of [false,true]) {
    const index=(r,c)=>transpose?c*9+r:r*9+c;
    const m=Array(81).fill(511);
    for(const r of [0,3]) for(let c=0;c<9;c++) if(c!==1&&c!==7)m[index(r,c)] &= ~mask(9);
    const s=step(m,'x-wing');
    assert.ok(removed(s,index(5,1),9));assert.ok(removed(s,index(5,7),9));
    assert.ok(!removed(s,index(0,1),9));
    m[index(3,5)] |= mask(9);
    assert.equal(step(m,'x-wing'),null);
  }
});

test('grading validates input, leaves ambiguous puzzles unclassified, and never mutates givens', () => {
  assert.throws(()=>gradePuzzle([0]),/81 integers/);
  assert.throws(()=>gradePuzzle(Array(81)),/81 integers/);
  assert.throws(()=>gradePuzzle(board(),{maxLevel:'constructor'}),/Unknown difficulty/);
  assert.throws(()=>gradePuzzle(Array(81).fill(-1)),/81 integers/);
  assert.throws(()=>gradePuzzle(board(),{maxLevel:'expert'}),/Unknown difficulty/);
  const invalid=board();invalid[0]=invalid[1]=1;
  assert.equal(gradePuzzle(invalid).status,'invalid');
  const result=gradePuzzle(board());
  assert.equal(result.status,'unclassified');assert.equal(result.difficulty,null);
  assert.equal(result.version,DIFFICULTY_VERSION);
});

test('logical placements and eliminations preserve the independently solved answer', () => {
  let state=20261020;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const seen=new Set();
  for(let run=0;run<100;run++) {
    const puzzle=run === 0 ? [...'000800070063000900290600001170530029400901060000064005012000008600000000950070200'].map(Number) : createPuzzle(random);
    const original=[...puzzle], solution=[...puzzle];
    const solver=solve(solution);let end;do{end=solver.next();}while(!end.done);
    assert.equal(end.value,true);
    const grade=gradePuzzle(puzzle,{includeSteps:true});
    assert.deepEqual(puzzle,original);assert.notEqual(grade.status,'invalid');
    for(const s of grade.steps) {
      seen.add(s.technique);
      if(s.placement) assert.equal(s.placement.digit,solution[s.placement.index]);
      else for(const e of s.eliminations) assert.ok(!e.digits.includes(solution[e.index]));
    }
    if(grade.status==='solved') {
      assert.deepEqual(grade.board,solution);
      if(grade.difficulty==='medium') assert.equal(gradePuzzle(puzzle,{maxLevel:'easy'}).status,'unclassified');
      if(grade.difficulty==='hard') assert.equal(gradePuzzle(puzzle,{maxLevel:'medium'}).status,'unclassified');
    } else assert.equal(grade.difficulty,null);
  }
  assert.ok(seen.has('naked-single'));
  assert.ok(seen.has('locked-candidates'));
});

test('fixed fixtures separate Medium, Hard, and unsupported puzzles', () => {
  const fixtures = [
    ['000800070063000900290600001170530029400901060000064005012000008600000000950070200','medium'],
    ['460000720700006100091037480006000092030061500000304000000002800014000050380010000','hard'],
    ['289005000000000798010008200000074003740002001365000000000000010000210800871096002',null]
  ];
  for(const [text,level] of fixtures) {
    const puzzle=[...text].map(Number), grade=gradePuzzle(puzzle,{includeSteps:true});
    assert.equal(grade.difficulty,level);
    if(level) {
      assert.equal(grade.status,'solved');
      const lower=level==='hard'?'medium':'easy';
      assert.equal(gradePuzzle(puzzle,{maxLevel:lower}).status,'unclassified');
    } else assert.equal(grade.status,'unclassified');
    const answer=[...puzzle], solver=solve(answer);while(!solver.next().done){}
    for(const s of grade.steps) {
      if(s.placement)assert.equal(s.placement.digit,answer[s.placement.index]);
      else for(const e of s.eliminations)assert.ok(!e.digits.includes(answer[e.index]));
    }
  }
});
