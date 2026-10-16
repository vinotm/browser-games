import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../snake-game/js/game.js',import.meta.url),'utf8');
const tick=source.slice(source.indexOf('function tick()'),source.indexOf('\n}',source.indexOf('function tick()'))+2);
function step({length=10,food=false,queued=null,headX=10}={}){
 const snake=Array.from({length},(_,i)=>({x:headX-i,y:10}));
 const c={state:'playing',addMilestoneWalls(){},snake,shortenRemaining:5,minimumSnakeLength:5,extendRemaining:0,direction:{x:1,y:0},queuedDirection:queued,size:32,movingFood:false,foodGroupSequence:0,buffs:[],bonusFood:null,
 food:food?{}:null,moveFood(){},activatePendingWalls(){},advancePickups(){},foodPosition:()=>food?{x:headX+1,y:10}:null,bonusContains:()=>false,isBarrier:()=>false,gameOver(){c.dead=true},copySnake:()=>snake.map(p=>({...p})),advanceFoodCombo(){},awardFoodPoints(){c.awarded=true},updateScore(){},countRegularFood(){},placeFood(){},buffContains:()=>false,applyBuff(){}};
 runInNewContext(tick+';tick()',c);return c;
}
test('shortener advances and turns the head while removing extra tail cells',()=>{
 const c=step({queued:{x:0,y:-1}});assert.equal(c.snake[0].y,9);assert.equal(c.snake.length,9);assert.equal(c.shortenRemaining,4);
});
test('shortener preserves food rewards and minimum length',()=>{
 const eating=step({food:true});assert.equal(eating.snake[0].x,11);assert.equal(eating.snake.length,10);assert.equal(eating.awarded,true);
 const minimum=step({length:5});assert.equal(minimum.snake.length,5);assert.equal(minimum.snake[0].x,11);assert.equal(minimum.shortenRemaining,0);
});
test('shortening still checks fatal movement before changing the snake',()=>{
 const c=step({headX:31});assert.equal(c.dead,true);assert.equal(c.snake.length,10);assert.equal(c.shortenRemaining,5);
});
