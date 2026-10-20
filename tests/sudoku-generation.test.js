import test from 'node:test';
import assert from 'node:assert/strict';
import { createDifficultyPuzzle, DIFFICULTY_GENERATOR_VERSION } from '../sudoku-game/js/difficulty-generator.js';
import { gradePuzzle } from '../sudoku-game/js/difficulty.js';
import { countSolutions, solve, conflicts } from '../sudoku-game/js/puzzle.js';

function seeded(initial) {
  let state = initial;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function generate(level, seed, options = {}) {
  return createDifficultyPuzzle(level, { random: seeded(seed), maxTimeMs: 60_000, ...options });
}

test('fresh generated puzzles have exactly the requested logical level and one solution', () => {
  const cases = [['easy',20261020],['easy',20261021],['medium',20361020],['medium',20361021],['hard',20461020]];
  const seen = new Set();
  for (const [difficulty, seed] of cases) {
    const result = generate(difficulty, seed);
    assert.equal(result.status, 'success');
    assert.equal(result.grade.difficulty, difficulty);
    assert.equal(result.stats.requestedDifficulty, difficulty);
    assert.equal(result.stats.version, DIFFICULTY_GENERATOR_VERSION);
    assert.equal(result.stats.uniquenessChecks, 1);
    assert.ok(result.puzzle.filter(Boolean).length <= 36);
    assert.equal(countSolutions(result.puzzle), 1);
    assert.equal(gradePuzzle(result.puzzle).difficulty, difficulty);
    if (difficulty !== 'easy') {
      assert.equal(gradePuzzle(result.puzzle, {maxLevel: difficulty === 'hard' ? 'medium' : 'easy'}).status, 'unclassified');
    }
    const answer = [...result.puzzle], solver = solve(answer);
    let end; do { end = solver.next(); } while (!end.done);
    assert.equal(end.value, true);
    assert.ok(answer.every(Boolean));
    assert.ok(!conflicts(answer).some(Boolean));
    result.puzzle.forEach((value,i) => { if (value) assert.equal(answer[i], value); });
    assert.ok(!seen.has(result.puzzle.join('')));
    seen.add(result.puzzle.join(''));
  }
});

test('seeded requests are reproducible and the clue limit is respected', () => {
  const a = generate('easy', 7182, {maxClues: 32});
  const b = generate('easy', 7182, {maxClues: 32});
  assert.equal(a.status, 'success'); assert.equal(b.status, 'success');
  assert.deepEqual(a.puzzle, b.puzzle); assert.deepEqual(a.grade, b.grade);
  assert.ok(a.puzzle.filter(Boolean).length <= 32);
});

test('bounded searches explicitly exhaust without returning a fallback puzzle', () => {
  for (const [options, reason] of [
    [{maxTimeMs: 0}, 'time'], [{maxPasses: 0}, 'passes'], [{maxChecks: 0}, 'checks'], [{maxChecks: 1}, 'checks']
  ]) {
    const result = generate('hard', 42, options);
    assert.equal(result.status, 'exhausted'); assert.equal(result.reason, reason);
    assert.equal('puzzle' in result, false); assert.equal('grade' in result, false);
    assert.equal(result.stats.uniquenessChecks, 0);
    if (options.maxChecks !== undefined) assert.ok(result.stats.gradeChecks <= options.maxChecks);
  }
});

test('invalid levels, budgets, and random sources fail clearly', () => {
  assert.throws(() => generate('expert',1), /Unknown difficulty/);
  for (const options of [{maxTimeMs:NaN},{maxTimeMs:-1},{maxPasses:1.5},{maxChecks:-1},{maxClues:16},{maxClues:81}]) {
    assert.throws(() => generate('easy',1,options), /Invalid generation/);
  }
  assert.throws(() => createDifficultyPuzzle('easy',{random:null}), /random function/);
  assert.throws(() => createDifficultyPuzzle('easy',{random:()=>1}), /Random values/);
});

test('candidate observer exposes independent, correctly graded lower-level snapshots', () => {
  const candidates=[];
  const result=generate('medium',20361020,{onCandidate:c=>candidates.push(c)});
  assert.equal(result.status,'success');
  assert.ok(candidates.some(c=>c.grade.difficulty==='easy'));
  assert.ok(candidates.some(c=>c.grade.difficulty==='medium'));
  for(const candidate of candidates) {
    assert.ok(candidate.puzzle.filter(Boolean).length<=36);
    assert.ok(candidate.generationMs>=0);
    assert.ok(Number.isInteger(candidate.sourceId)&&candidate.sourceId>0);
    assert.equal(gradePuzzle(candidate.puzzle).difficulty,candidate.grade.difficulty);
    assert.equal(countSolutions(candidate.puzzle),1);
  }
  const changed=generate('medium',20361020,{onCandidate:c=>{c.puzzle.fill(9);c.grade.difficulty='bogus';c.grade.counts['naked-single']=-1;}});
  assert.deepEqual(changed.puzzle,result.puzzle);
  assert.deepEqual(changed.grade,result.grade);
});

test('incremental search resumes to the same result and supports cooperative cancellation', async () => {
  const {createDifficultySearch}=await import('../sudoku-game/js/difficulty-generator.js');
  const search=createDifficultySearch('easy',{random:seeded(7182),maxTimeMs:60_000});
  let next=search.next();assert.equal(next.done,false);
  do {next=search.next();}while(!next.done);
  assert.deepEqual(next.value.puzzle,generate('easy',7182).puzzle);
  let stop=false;
  const cancelled=createDifficultySearch('hard',{random:seeded(42),shouldStop:()=>stop});
  assert.equal(cancelled.next().done,false);stop=true;
  const result=cancelled.next();
  assert.equal(result.done,true);assert.equal(result.value.status,'exhausted');
  assert.equal(result.value.reason,'cancelled');assert.equal('puzzle'in result.value,false);
  assert.throws(()=>generate('easy',1,{onCandidate:42}),/candidate callback/);
  assert.throws(()=>generate('easy',1,{shouldStop:42}),/stop callback/);
});

test('Novice generation is unique, keeps 45 clues, and needs only naked singles', () => {
  const puzzles = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const result = generate('novice', seed);
    assert.equal(result.status, 'success');
    assert.equal(result.puzzle.filter(Boolean).length, 45);
    assert.equal(countSolutions(result.puzzle), 1);
    const grade = gradePuzzle(result.puzzle, {maxLevel:'novice'});
    assert.equal(grade.difficulty, 'novice');
    assert.deepEqual(Object.keys(grade.counts), ['naked-single']);
    assert.equal(gradePuzzle(result.puzzle).difficulty, 'novice');
    puzzles.add(result.puzzle.join(''));
  }
  assert.equal(puzzles.size, 30);
});
