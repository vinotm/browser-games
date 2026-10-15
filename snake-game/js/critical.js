// Integer percentages avoid drift when repeatedly collecting upgrades.
// bonusPercent is extra damage/points: 100% bonus means a total of 2×.
export function createCritStats() {
  return { chancePercent: 5, bonusPercent: 100 };
}

export function collectCritBuff(stats, type) {
  if (type === 'critRate') {
    const previous = stats.chancePercent;
    stats.chancePercent = Math.min(50, previous + 5);
    return stats.chancePercent > previous;
  }
  if (type === 'critMultiplier') {
    const previous = stats.bonusPercent;
    stats.bonusPercent = Math.min(900, previous + 100);
    return stats.bonusPercent > previous;
  }
  return false;
}

export function rollFoodPoints(basePoints, stats, random = Math.random) {
  const critical = random() < stats.chancePercent / 100;
  return {
    critical,
    points: basePoints * (critical ? 1 + stats.bonusPercent / 100 : 1),
  };
}
