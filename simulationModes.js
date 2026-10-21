// The ONLY Race adaptation of SIGHT. Vehicle.look() is synchronous (dataSync).
// Scope is one perception/decision call; restore even if prediction throws.
// Never use this helper across an await, timer or asynchronous callback.
function withRaceSight(vision, action) {
  if (!Number.isFinite(vision) || vision <= 0) throw new Error('Distance de vision invalide.');
  const previous = SIGHT;
  try { SIGHT = vision; return action(); }
  finally { SIGHT = previous; }
}

// Vehicle's constructor reads scene globals. Only constructors run in this scope.
function withRaceSpawn(scene, action) {
  const previousStart = start, previousCheckpoints = checkpoints;
  try { start = scene.start; checkpoints = scene.checkpoints; return action(); }
  finally { start = previousStart; checkpoints = previousCheckpoints; }
}

function captureTrainingSession() {
  return {TOTAL, SIGHT, generationCount, walls, population, savedVehicles, inside, outside, checkpoints,
    start, end, lastGenerationStatistics, trainingConfig, currentTrack, history, championDocument,
    demonstrationDocument, mode, evaluationResults, selectedVehicle, showSensors, showCheckpoints,
    camera, trackRenderer, trainingStopRules, trainingStoppedReason, trainingGenerationPending, speed: speedSlider.value()};
}

function restoreTrainingSession(saved) {
  ({TOTAL, SIGHT, generationCount, walls, population, savedVehicles, inside, outside, checkpoints,
    start, end, lastGenerationStatistics, trainingConfig, currentTrack, history, championDocument,
    demonstrationDocument, mode, evaluationResults, selectedVehicle, showSensors, showCheckpoints,
    camera, trackRenderer, trainingStopRules, trainingStoppedReason, trainingGenerationPending} = saved);
  speedSlider.value(saved.speed);
  paused = true; // Explicit return in pause, never reset or resume automatically.
}

class SimulationModes {
  constructor() { this.active = 'training'; this.training = null; this.race = null; }

  enterRace(track) {
    if (this.active === 'race') return;
    const session = new RaceSession(createRaceScene(track));
    this.training = captureTrainingSession();
    this.race = session;
    this.active = 'race';
    this.publishRace();
  }

  publishRace() {
    const scene = this.race.scene;
    mode = 'race'; paused = true;
    walls = scene.walls; inside = scene.inner; outside = scene.outer;
    checkpoints = scene.checkpoints; start = scene.start; end = scene.end;
    currentTrack = scene.id; camera = scene.camera; trackRenderer = scene.renderer;
    population = this.race.vehicles; savedVehicles = []; TOTAL = population.length;
    selectedVehicle = population[0] || null;
  }

  changeRaceTrack(id) {
    if (this.active !== 'race') return;
    const next = new RaceSession(createRaceScene(id));
    next.format = this.race.format;
    this.race.dispose(); this.race = next; this.publishRace();
  }

  prepareRace(entries) {
    if (this.active !== 'race') throw new Error('Passez en Race Mode pour préparer une course.');
    this.race.prepare(entries); this.publishRace();
  }

  leaveRace() {
    if (this.active !== 'race') return;
    this.race.dispose();
    restoreTrainingSession(this.training);
    this.race = null; this.training = null; this.active = 'training';
  }
}
