import test from 'node:test';
import assert from 'node:assert/strict';
import { describeFatalCollision } from '../snake-game/js/collision.js';

test('fatal wall reports identify the exact wall, its origin and the L-arm collision cell', () => {
  const walls = [
    { id: 'wall-1', cells: [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }] },
    { id: 'wall-2', source: 'expired_food', cells: [{ x: 10, y: 11 }] },
  ];
  assert.deepEqual(describeFatalCollision({ x: 6, y: 6 }, walls, 32), {
    death_cause: 'wall', collision_cell: { x: 6, y: 6 }, wall_id: 'wall-1', wall_source: 'milestone',
  });
  assert.deepEqual(describeFatalCollision({ x: 10, y: 11 }, walls, 32), {
    death_cause: 'wall', collision_cell: { x: 10, y: 11 }, wall_id: 'wall-2', wall_source: 'expired_food',
  });
  // An L's empty bounding-box corner is not part of the wall.
  assert.equal(describeFatalCollision({ x: 6, y: 5 }, walls, 32).death_cause, 'body');
});

test('edge and body deaths have a collision cell and no wall metadata', () => {
  for (const head of [{ x: -1, y: 4 }, { x: 32, y: 4 }, { x: 4, y: -1 }, { x: 4, y: 32 }]) {
    assert.deepEqual(describeFatalCollision(head, [], 32), { death_cause: 'edge', collision_cell: head });
  }
  assert.deepEqual(describeFatalCollision({ x: 7, y: 8 }, [], 32), {
    death_cause: 'body', collision_cell: { x: 7, y: 8 },
  });
});
