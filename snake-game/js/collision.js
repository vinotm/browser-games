// Called only after a fatal move: identify the obstacle without logging movement.
export function describeFatalCollision(head, walls, size) {
  const collision = { collision_cell: { x: head.x, y: head.y } };
  if (head.x < 0 || head.y < 0 || head.x >= size || head.y >= size) {
    return { death_cause: 'edge', ...collision };
  }
  const wall = walls.find(wall => wall.cells.some(cell => cell.x === head.x && cell.y === head.y));
  if (wall) return { death_cause: 'wall', ...collision,
    wall_id: wall.id, wall_source: wall.source ?? 'milestone' };
  return { death_cause: 'body', ...collision };
}
