// Same roulette selection as the supplied GA, with a configurable vehicle factory.
function selectRacingParent(candidates, drawRandom = Math.random) {
  const eligible = candidates.filter(vehicle => vehicle && vehicle.brain);
  if (!eligible.length) return null;
  const weights = eligible.map(vehicle => Number.isFinite(vehicle.fitness) && vehicle.fitness > 0 ? vehicle.fitness : 0);
  const maximum = Math.max(...weights);
  if (!maximum) return eligible[Math.min(eligible.length - 1, Math.floor(drawRandom() * eligible.length))];
  const scaled = weights.map(weight => weight / maximum);
  let choice = drawRandom() * scaled.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < eligible.length; i++) {
    choice -= scaled[i];
    if (choice < 0) return eligible[i];
  }
  return eligible[scaled.lastIndexOf(Math.max(...scaled))];
}

function createRacingGeneration(config, parents, drawRandom = () => random(1)) {
  const children = [];
  try {
    for (let i = 0; i < config.population; i++) {
      const parent = selectRacingParent(parents, drawRandom);
      const child = new RacingVehicle(config, parent ? parent.brain : null, i);
      children.push(child);
      if (parent) child.mutate();
    }
    return children;
  } catch (error) { disposePopulation(children, []); throw error; }
}
