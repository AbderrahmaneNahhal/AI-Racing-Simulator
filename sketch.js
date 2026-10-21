// Course defaults: inherited forces, integration, lifespan and fitness.
let TOTAL = 100;
const MUTATION_RATE = 0.1;
const LIFESPAN = 25;
let SIGHT = 50;
const maxFitness = 500;
let generationCount = 0;
let walls = [], population = [], savedVehicles = [];
let inside = [], outside = [], checkpoints = [];
let start, end;
let speedSlider, dashboard, chart;
let paused = false;
let lastGenerationStatistics = null;
let trainingConfig;
let currentTrack = 'medium';
let trackRenderer = null;
let history = [];
let championDocument = null;
let demonstrationDocument = null;
let mode = 'training';
let evaluationResults = {};
let selectedVehicle = null;
let showSensors = false;
let showCheckpoints = false;
let camera = null;
let carPreview = null;
let simulationModes = null;
let raceDashboard = null;
let garageDashboard = null;
let appShell = null;
let trainingStopRules = {maxEnabled:false,maxGenerations:100,successEnabled:false,successRate:60};
let trainingStoppedReason = null;
let trainingGenerationPending = false;

function preload() { preloadRacingArt(); }

function buildTrack() {
  if (mode === 'race') throw new Error('Le circuit Race est géré par sa propre session.');
  const preset = RACING_TRACKS[currentTrack];
  noiseSeed(preset.seed);
  const geometry = trackGeometry(currentTrack, width, height, noise);
  inside = geometry.inside.map(p => createVector(p.x, p.y));
  outside = geometry.outside.map(p => createVector(p.x, p.y));
  checkpoints = inside.map((a, i) => new Boundary(a.x, a.y, outside[i].x, outside[i].y));
  walls = [];
  for (let i = 0; i < checkpoints.length; i++) {
    const next = (i + 1) % checkpoints.length;
    for (const points of [inside, outside]) {
      walls.push(new Boundary(points[i].x, points[i].y, points[next].x, points[next].y));
    }
  }
  start = checkpoints[0].midpoint();
  end = checkpoints[checkpoints.length - 1].midpoint();
  if (trackRenderer) trackRenderer.dispose();
  trackRenderer = new TrackRenderer(inside, outside, width, height, preset.seed);
  if (camera) { camera.fit(inside.concat(outside)); syncCameraControls(); }
}

function setup() {
  const canvas = createCanvas(1200, 800);
  canvas.parent('circuit');
  tf.setBackend('cpu');
  trainingConfig = { ...DEFAULT_TRAINING_CONFIG };
  buildTrack();
  camera = new RacingCamera(width, height);
  camera.fit(inside.concat(outside));
  carPreview = document.getElementById('car-preview');
  population = createRacingGeneration(trainingConfig, []);
  // Keep the original speed slider, with the original limits.
  speedSlider = createSlider(1, 10, 1);
  dashboard = new RacingDashboard(speedSlider, dashboardActions());
  dashboard.setConfig(trainingConfig);
  initializeTrackStorage();
  chart = new PerformanceChart(document.getElementById('performance-chart'));
  bindSimulationInteractions(canvas.elt);
  simulationModes = new SimulationModes();
  raceDashboard = new RaceDashboard(simulationModes);
  garageDashboard = new GarageDashboard(new GarageService(new GarageStore()), raceDashboard);
  appShell = new RacingAppShell({canvas:canvas.elt,worldWidth:width,worldHeight:height,
    pause:()=>{paused=true;if(mode==='race')simulationModes.race.pause();},
    switchMode:target=>raceDashboard.switchMode(target),activeMode:()=>simulationModes.active,
    render:()=>draw(),startLoop:()=>loop(),stopLoop:()=>noLoop()});
  window.addEventListener('pagehide', () => { garageDashboard.service.store.close().catch(() => {}); });
}

function playSimulation() {
  if (mode === 'race') { simulationModes.race.start(); return; }
  if (mode === 'demo' && population.length === 0) resetSimulation();
  if(mode==='training'&&trainingGenerationPending)advanceRacingGeneration();
  paused = false;
}

function resetSimulation() {
  if (mode === 'race') { simulationModes.race.restart(); simulationModes.publishRace(); return; }
  disposePopulation(population, savedVehicles);
  population = [];
  savedVehicles = [];
  generationCount = 0;
  lastGenerationStatistics = null;
  history = [];
  trainingStoppedReason=null;trainingGenerationPending=false;
  if (chart) chart.version = '';
  selectedVehicle = null;
  paused = true;
  if (mode === 'demo' && demonstrationDocument) {
    const brain = restoreRacingBrain(demonstrationDocument);
    try { population.push(new RacingVehicle(trainingConfig, brain)); }
    finally { brain.dispose(); }
    TOTAL = 1;
  } else {
    championDocument = null;
    TOTAL = trainingConfig.population;
    population = createRacingGeneration(trainingConfig, []);
  }
}

function completeRacingGeneration() {
  if (mode === 'race') throw new Error('Aucune génération génétique en Race Mode.');
  // Capture raw checkpoints before the original GA normalizes fitness.
  lastGenerationStatistics = { ...generationStatistics(savedVehicles),
    generation: generationCount + 1, track: currentTrack };
  history.push(lastGenerationStatistics);
  if (mode === 'demo') {
    evaluationResults[currentTrack] = lastGenerationStatistics;
    paused = true;
    return;
  }
  const best = savedVehicles.reduce((leader, vehicle) => !leader || vehicle.fitness > leader.fitness ? vehicle : leader, null);
  if (best && (!championDocument || best.fitness > championDocument.metadata.progress)) {
    championDocument = serializeRacingBrain(best.brain, {
      progress: best.fitness, generation: generationCount + 1, track: currentTrack,
      trackSeed: RACING_TRACKS[currentTrack].seed, finished: best.finished
    });
  }
  trainingStoppedReason=trainingStopReason(trainingStopRules,lastGenerationStatistics);
  if(trainingStoppedReason){trainingGenerationPending=true;paused=true;return;}
  advanceRacingGeneration();
}

function advanceRacingGeneration() {
  calculateFitnessForAllCars();
  const next = createRacingGeneration(trainingConfig, savedVehicles);
  disposePopulation([], savedVehicles);
  savedVehicles = [];
  population = next;
  selectedVehicle = null;
  generationCount++;
  trainingStoppedReason=null;trainingGenerationPending=false;
}

function stepSimulation() {
  if (mode === 'race') { simulationModes.race.step(); return; }
  // Preserve the existing perception/check/locomotion ordering.
  for (const vehicle of population) {
    vehicle.applyBehaviors(walls);
    vehicle.check(checkpoints);
    vehicle.update();
  }
  for (let i = population.length - 1; i >= 0; i--) {
    if (population[i].dead || population[i].finished) savedVehicles.push(population.splice(i, 1)[0]);
  }
  if (population.length === 0) completeRacingGeneration();
}

function draw() {
  if (mode === 'race') { drawRace(); return; }
  const cycles = speedSlider.value();
  for (let n = 0; !paused && n < cycles; n++) stepSimulation();
  const leader = population.reduce((best, vehicle) => !best || vehicle.fitness > best.fitness ? vehicle : best, null);
  if (!population.includes(selectedVehicle)) selectedVehicle = leader;
  if (camera) { camera.update(selectedVehicle,typeof deltaTime==='number'?deltaTime:1000/60); background('#8a9c40'); camera.begin(); }
  if(camera&&camera.follow)syncCameraControls();
  if (trackRenderer) trackRenderer.show(); else background('#18352f');
  if (showCheckpoints) {
    push(); stroke('#80b7ff'); strokeWeight(1);
    for (const checkpoint of checkpoints) line(checkpoint.a.x, checkpoint.a.y, checkpoint.b.x, checkpoint.b.y);
    pop();
  }
  for (const vehicle of population) vehicle.show();
  const candidates = population.concat(savedVehicles);
  if (leader) leader.highlight();
  if (selectedVehicle && selectedVehicle.showSelection) selectedVehicle.showSelection();
  if (selectedVehicle && showSensors) selectedVehicle.showSensors();
  if (camera) camera.end();
  if(appShell&&appShell.surroundings)appShell.surroundings.draw(trackRenderer,camera,{vehicles:population,leader,selected:selectedVehicle,sensors:showSensors,checkpoints:showCheckpoints?checkpoints:[]});
  if (carPreview) drawRacingCarPreview(carPreview, selectedVehicle);
  let progress = 0;
  for (const vehicle of candidates) {
    if (Number.isFinite(vehicle.fitness)) progress = Math.max(progress, vehicle.fitness);
  }
  const outputs = selectedVehicle && selectedVehicle.brain.lastOutputs;
  // One statistics/DOM update per rendered frame, regardless of speed.
  dashboard.render({
    generation: generationCount + 1, alive: population.filter(v => !v.dead && !v.finished).length,
    total: TOTAL, progress, checkpoints: checkpoints.length,
    meanProgress: lastGenerationStatistics ? lastGenerationStatistics.meanProgress : null,
    successRate: lastGenerationStatistics ? lastGenerationStatistics.successRate : null,
    finishedCount: lastGenerationStatistics ? lastGenerationStatistics.finishedCount : null,
    speed: cycles, paused, mode, stopReason:trainingStoppedReason, topology: trainingTopology(trainingConfig).join(' → '),
    hasChampion: !!(championDocument || demonstrationDocument), historyLength: history.length,
    selected: selectedVehicle ? 'Voiture #' + (selectedVehicle.identity + 1) + (selectedVehicle === leader ? ' · leader' : '') : null,
    decision: outputs && outputs.length ? 'Direction ' + (outputs[0] * 360 - 180).toFixed(0) + '° · vitesse désirée ' + (outputs[1] * selectedVehicle.maxspeed).toFixed(2) + ' px/pas' : null,
    history, chart, track: currentTrack, evaluations: evaluationResults
  });
}

function drawRace() {
  const session = simulationModes.race;
  for (let n = 0; n < speedSlider.value() && session.state === 'running'; n++) session.step();
  const visible = session.visibleVehicles;
  if (!visible.includes(selectedVehicle)) selectedVehicle = visible[0] || null;
  camera.update(selectedVehicle,typeof deltaTime==='number'?deltaTime:1000/60); background('#8a9c40'); camera.begin();
  if(camera.follow)syncCameraControls();
  trackRenderer.show();
  if (showCheckpoints) {
    push(); stroke('#80b7ff'); strokeWeight(1);
    for (const checkpoint of checkpoints) line(checkpoint.a.x, checkpoint.a.y, checkpoint.b.x, checkpoint.b.y);
    pop();
  }
  for (const car of visible) {
    car.show();
    const result=session.resultFor(car);
    if(result.state==='finished'||result.state==='eliminated') {
      const ctx=drawingContext;ctx.save();ctx.strokeStyle='#f9e5ad';ctx.lineWidth=.8;
      ctx.beginPath();ctx.arc(car.pos.x,car.pos.y,9,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#fff4cf';ctx.font='bold 4px system-ui';ctx.textAlign='center';
      ctx.fillText('RETRAIT',car.pos.x,car.pos.y-12);ctx.restore();
    } else if(result.maneuver==='contact')car.drawHalo('#ffbd57',9);
  }
  const raceLeader = visible.filter(car=>session.resultFor(car).state==='running').reduce((best,car)=>!best||car.fitness>best.fitness?car:best,null);
  if(raceLeader) raceLeader.drawHalo('#ffd383',8);
  if (selectedVehicle) {
    selectedVehicle.showSelection();
    if (showSensors) selectedVehicle.showSensors();
  }
  camera.end();
  if(appShell&&appShell.surroundings)appShell.surroundings.draw(trackRenderer,camera,{vehicles:visible,leader:raceLeader,selected:selectedVehicle,sensors:showSensors,checkpoints:showCheckpoints?checkpoints:[],race:session});
  if (carPreview) {
    if (selectedVehicle) selectedVehicle.preview(carPreview);
    else drawRacingCarPreview(carPreview, null);
  }
  raceDashboard.render(session); // Race UI only, once per rendered frame.
}
