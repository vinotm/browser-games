import test from 'node:test';
import assert from 'node:assert/strict';
import { PuzzlePool } from '../sudoku-game/js/difficulty-pool.js';
import { createPuzzleService } from '../sudoku-game/js/puzzle-service.js';
import { createPuzzleClient } from '../sudoku-game/js/puzzle-client.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(condition){for(let i=0;i<100;i++){if(condition())return;await tick();}assert.fail('Service did not settle');}
const candidate=(difficulty,generationMs,origin)=>({puzzle:[1],grade:{difficulty,version:'logic-v1'},generationMs,origin});
test('pool ranks difficulty first, then time; caps capacity and evicts shared-solution siblings',()=>{
 const pool=new PuzzlePool(2);
 for(const c of [candidate('easy',900,'a'),candidate('easy',800,'b'),candidate('easy',700,'c'),candidate('medium',30,'m')])pool.offer(c);
 assert.equal(pool.counts().easy,2);assert.equal(pool.fallback('hard').grade.difficulty,'medium');
 assert.equal(pool.take('easy').generationMs,900);
 pool.offer(candidate('easy',1000,'shared'));pool.offer(candidate('hard',2000,'shared'));
 assert.equal(pool.take('hard').origin,'shared');assert.ok(!pool.queues.easy.some(c=>c.origin==='shared'));
});
test('a bounded unsuccessful search serves the highest lower candidate with longest generation time',async()=>{
 function* generate(level,{onCandidate,maxTimeMs}){
  assert.equal(level,'hard');assert.equal(maxTimeMs,2000);
  onCandidate({...candidate('easy',900),sourceId:1});yield;
  onCandidate({...candidate('medium',30),sourceId:2});yield;
  onCandidate({...candidate('medium',80),sourceId:3});yield;
  return {status:'exhausted',reason:'time'};
 }
 const s=createPuzzleService({generate,verify:()=>1});s.setPaused(true);
 const result=await s.request('hard');assert.equal(result.givenDifficulty,'medium');assert.equal(result.generationMs,80);assert.equal(result.cacheHit,false);
 s.close();
});
test('background fills all level queues, hidden tabs pause, and memory hits preserve generation time with zero serve time',async()=>{
 let calls=0,clock=0;
 function* generate(level,{onCandidate,shouldStop}){
  calls++;
  for(const d of ['novice','easy','medium','hard']){
   if(shouldStop?.())return {status:'exhausted'};
   clock+=5;onCandidate({...candidate(d,300),sourceId:1});
   if(d===level)return {status:'success'};
   yield;
  }
 }
 const s=createPuzzleService({generate,verify:()=>1,capacity:2,clock:()=>clock});s.setPaused(true);
 await s.request('easy');await tick();assert.equal(calls,1);
 s.setPaused(false);await until(()=>Object.values(s.counts()).every(n=>n===2));
 s.setPaused(true);const result=await s.request('medium');
 assert.equal(result.cacheHit,true);assert.equal(result.serveMs,0);assert.equal(result.generationMs,300);
 assert.ok(Object.values(s.counts()).every(n=>n<=2));s.close();
 await assert.rejects(s.request('hard'),/closed/);
});
test('client reuses a worker and measures cold waits while retaining exact zero for memory hits',async()=>{
 let now=0,instances=0;const requests=[];
 const worker={postMessage:m=>{if(m.type==='request')requests.push(m);},terminate(){}};
 const c=createPuzzleClient({createWorker:()=>{instances++;return worker;},clock:()=>now});
 const p=c.take('hard');now=2040;
 worker.onmessage({data:{id:requests[0].id,result:{...candidate('medium',777),generationMs:777,cacheHit:false}}});
 assert.equal((await p).serveMs,2040);
 const next=c.take('easy');now=2100;
 worker.onmessage({data:{id:requests[1].id,result:{generationMs:876,cacheHit:true}}});
 assert.equal((await next).serveMs,0);assert.equal(instances,1);
 c.close();
});
test('warmup fills bounded queues before the first game, respects visibility, and serves the first game from memory',async()=>{
 let calls=0;
 function* generate(level,{onCandidate}) {
  calls++;
  for(const d of ['novice','easy','medium','hard']) onCandidate({...candidate(d,40),sourceId:d});
  return {status:'success'};
 }
 const s=createPuzzleService({generate,verify:()=>1,capacity:2});
 s.setPaused(true);s.warmup();await tick();assert.equal(calls,0);
 s.setPaused(false);await until(()=>Object.values(s.counts()).every(n=>n===2));
 const filledCalls=calls;await tick();await tick();assert.equal(calls,filledCalls);
 s.setPaused(true);
 const first=await s.request('hard');assert.equal(first.cacheHit,true);assert.equal(first.serveMs,0);
 assert.equal(first.givenDifficulty,'hard');assert.equal(calls,filledCalls);s.close();
});
test('client warms one worker without requesting a game and retries failed startup on Play',async()=>{
 let instances=0;const messages=[];
 const worker={postMessage:m=>messages.push(m),terminate(){}};
 const c=createPuzzleClient({createWorker:()=>{instances++;return worker;}});
 c.setVisible(false);c.warmup();c.warmup();
 assert.equal(instances,1);assert.deepEqual(messages[0],{type:'visibility',visible:false});
 assert.equal(messages.filter(m=>m.type==='request').length,0);
 c.setVisible(true);const p=c.take('easy');const request=messages.find(m=>m.type==='request');
 worker.onmessage({data:{id:request.id,result:{cacheHit:true}}});assert.equal((await p).serveMs,0);c.close();
 let tries=0;
 const retry=createPuzzleClient({createWorker:()=>{if(++tries===1)throw Error('Unavailable');return worker;}});
 retry.warmup();const next=retry.take('medium');const last=messages.at(-1);
 worker.onmessage({data:{id:last.id,result:{cacheHit:true}}});await next;assert.equal(tries,2);retry.close();
});
test('persistent cache restores across service lifetimes and claims prevent reuse across tabs', async () => {
 const p = {...candidate('easy', 123, 'saved-origin'), puzzle: Array(81).fill(0)};
 let rows = [p], generations = 0;
 const store = { async load() { return structuredClone(rows); }, async offer(c) { rows.push(c); },
   async claim(c) { const found = rows.some(r => r.origin === c.origin); rows = rows.filter(r => r.origin !== c.origin); return found; } };
 function* generate(level, {onCandidate}) { generations++; onCandidate({...p, sourceId:1}); }
 const first = createPuzzleService({store,generate,verify:()=>1}); first.setPaused(true);
 const second = createPuzzleService({store,generate,verify:()=>1}); second.setPaused(true);
 const a = await first.request('easy'); assert.equal(a.cacheHit,true); assert.equal(a.generationMs,123);
 const b = await second.request('easy'); assert.equal(b.cacheHit,false); assert.equal(generations,1);
 first.close(); second.close();
});
test('unavailable persistent storage falls back to fresh generation', async () => {
 const s = createPuzzleService({store:{async load(){throw Error('Storage denied');}},verify:()=>1,
  generate:function*(level,{onCandidate}){onCandidate({...candidate(level,10),sourceId:1});}});
 s.setPaused(true);assert.equal((await s.request('easy')).givenDifficulty,'easy');s.close();
});
