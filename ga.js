
// Fonctions pour le calcul génétique
// On va créer une nouvelle génération de voitures
function nextGeneration() {
    calculateFitnessForAllCars();

    for (let i = 0; i < TOTAL; i++) {
      population[i] = pickOne();
    }

    for (const vehicle of savedVehicles) {
      vehicle.dispose();
    }
    savedVehicles = [];
  }
  
  function pickOne() {
    const candidates = savedVehicles.filter(vehicle => vehicle && vehicle.brain);
    if (candidates.length === 0) {
      return new Vehicle();
    }

    const maxWeight = candidates.reduce((max, vehicle) => {
      const weight = Number.isFinite(vehicle.fitness) && vehicle.fitness > 0
        ? vehicle.fitness
        : 0;
      return Math.max(max, weight);
    }, 0);

    let parent;
    if (maxWeight === 0) {
      const index = Math.min(candidates.length - 1, Math.floor(random(candidates.length)));
      parent = candidates[index];
    } else {
      const scaledWeights = candidates.map(vehicle => {
        const weight = Number.isFinite(vehicle.fitness) && vehicle.fitness > 0
          ? vehicle.fitness
          : 0;
        return weight / maxWeight;
      });
      const totalWeight = scaledWeights.reduce((sum, weight) => sum + weight, 0);
      let choice = random(totalWeight);

      for (let i = 0; i < candidates.length; i++) {
        choice -= scaledWeights[i];
        if (choice < 0) {
          parent = candidates[i];
          break;
        }
      }

      if (!parent) {
        parent = candidates[scaledWeights.lastIndexOf(Math.max(...scaledWeights))];
      }
    }

    const child = new Vehicle(parent.brain);
    child.mutate();
    return child;
  }
  
  function calculateFitnessForAllCars() {
    for (let vehicle of savedVehicles) {
      vehicle.calculateFitness();
    }

    if (savedVehicles.length === 0) {
      return;
    }

    let maxWeight = 0;
    for (let vehicle of savedVehicles) {
      if (!Number.isFinite(vehicle.fitness) || vehicle.fitness < 0) {
        vehicle.fitness = 0;
      }
      maxWeight = Math.max(maxWeight, vehicle.fitness);
    }

    if (maxWeight === 0) {
      const uniformWeight = 1 / savedVehicles.length;
      for (let vehicle of savedVehicles) {
        vehicle.fitness = uniformWeight;
      }
      return;
    }

    let scaledSum = 0;
    for (let vehicle of savedVehicles) {
      scaledSum += vehicle.fitness / maxWeight;
    }
    for (let vehicle of savedVehicles) {
      vehicle.fitness = (vehicle.fitness / maxWeight) / scaledSum;
    }
  }