function reportAction(action) {
  return async event => {
    try { await action(event); }
    catch (error) { dashboard.message(error.message, true); }
  };
}

function dashboardActions() {
  return {
    ...circuitActions(),
    play: playSimulation,
    pause: () => { paused = true; },
    reset: reportAction(() => { resetSimulation(); dashboard.message('Population réinitialisée sur le même circuit.'); }),
    'show-sensors': event => { showSensors = event.target.checked; },
    'show-checkpoints': event => { showCheckpoints = event.target.checked; },
    'apply-config': reportAction(() => applyTrainingSettings(dashboard.readConfig())),
    'apply-stop': reportAction(() => {
      trainingStopRules=validateTrainingStop({maxEnabled:document.getElementById('stop-max-enabled').checked,
        maxGenerations:Number(document.getElementById('stop-max').value),successEnabled:document.getElementById('stop-success-enabled').checked,
        successRate:Number(document.getElementById('stop-success').value)});
      dashboard.message('Conditions d’arrêt enregistrées sans réinitialisation. Play reprend une série arrêtée.');
    }),
    'save-config': reportAction(() => {
      saveTrainingConfiguration(localStorage, trainingConfig, currentTrack);
      dashboard.message('Configuration active enregistrée dans ce navigateur.');
    }),
    'load-config': reportAction(() => {
      const value = loadTrainingConfiguration(localStorage);
      refreshCustomTrackOptions();
      applyTrainingSettings(value.config, value.track);
      dashboard.message('Configuration restaurée. Entraînement réinitialisé en pause.');
    }),
    'export-brain': reportAction(exportChampion),
    'brain-file': reportAction(importBrainFile),
    'track-select': reportAction(event => changeTrack(event.target.value)),
    'training-mode': reportAction(() => applyTrainingSettings(trainingConfig))
  };
}

function bindSimulationInteractions(canvas) {
  const surface=canvas.parentElement||canvas;
  const zoom = document.getElementById('camera-zoom');
  zoom.addEventListener('input', event => { camera.setZoom(Number(event.target.value)); syncCameraControls(); });
  document.getElementById('camera-home').addEventListener('click', () => { camera.reset(); syncCameraControls(); });
  document.getElementById('camera-follow').addEventListener('change', event => {
    camera.follow = event.target.checked;
    if (camera.follow) camera.startFollow();
    else camera.zoomTarget=null;
    syncCameraControls();
  });
  let drag = null;
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = {x:event.clientX, y:event.clientY, previousX:event.clientX, previousY:event.clientY, moved:false};
    canvas.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointermove', event => {
    if (!drag) return;
    const box = canvas.getBoundingClientRect();
    if (Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>4) drag.moved=true;
    if (drag.moved) {
      camera.pan((event.clientX-drag.previousX)*width/box.width, (event.clientY-drag.previousY)*height/box.height);
      syncCameraControls();
    }
    drag.previousX=event.clientX;drag.previousY=event.clientY;
  });
  surface.addEventListener('pointerup', event => {
    if (!drag) return;
    if (!drag.moved) {
      const box=canvas.getBoundingClientRect();
      const selectable = mode === 'race' ? simulationModes.race.visibleVehicles : population;
      selectedVehicle=pickRacingVehicle(selectable,canvasPoint(event,box,width,height),camera,14*width/box.width);
    }
    drag=null;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  });
  surface.addEventListener('pointercancel', () => { drag=null; });
  surface.addEventListener('wheel', event => {
    event.preventDefault();
    camera.setZoom(camera.zoom*(event.deltaY<0?1.12:1/1.12),canvasPoint(event,canvas.getBoundingClientRect(),width,height));
    syncCameraControls();
  },{passive:false});
  document.addEventListener('keydown', event => {
    if (event.key.toLowerCase() !== 'd' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.closest('input, select, textarea, button, [contenteditable]')) return;
    showSensors = !showSensors;
    document.getElementById('show-sensors').checked = showSensors;
  });
}

function syncCameraControls() {
  document.getElementById('camera-zoom').value=camera.zoom;
  document.getElementById('camera-zoom-value').textContent=`×${camera.zoom.toFixed(1)}`;
  document.getElementById('camera-follow').checked=camera.follow;
}

function applyTrainingSettings(value, track = currentTrack) {
  if (mode === 'race') throw new Error('Les paramètres Training sont suspendus pendant la compétition.');
  const config = validateTrainingConfig(value);
  if (!RACING_TRACKS[track]) throw new Error('Circuit inconnu.');
  trainingConfig = config;
  SIGHT = config.sight;
  mode = 'training';
  demonstrationDocument = null;
  evaluationResults = {};
  if (track !== currentTrack) { currentTrack = track; buildTrack(); }
  resetSimulation();
  dashboard.setConfig(config);
  document.getElementById('track-select').value = currentTrack;
  dashboard.message('Paramètres appliqués. Réseaux compatibles recréés ; Play pour démarrer.');
}

function changeTrack(id) {
  if (mode === 'race') { simulationModes.changeRaceTrack(id); syncCameraControls(); return; }
  if (!RACING_TRACKS[id]) throw new Error('Circuit inconnu.');
  currentTrack = id;
  buildTrack();
  resetSimulation();
  dashboard.message(mode === 'demo' ? 'Même cerveau, nouveau circuit. Play pour mesurer sa généralisation.' :
    'Circuit changé. Nouvelle série d’entraînement en pause.');
}

function exportChampion() {
  if (mode === 'race') throw new Error('Revenez en Training pour exporter son champion.');
  const document = championDocument || demonstrationDocument;
  if (!document) throw new Error('Attendez la fin d’une génération pour exporter son meilleur cerveau.');
  const brain = restoreRacingBrain(document);
  let verified;
  try { verified = verifiedBrainDocument(brain, document.metadata); }
  finally { brain.dispose(); }
  const blob = new Blob([JSON.stringify(verified)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url; link.download = `ai-racing-${currentTrack}-brain.json`;
  window.document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  dashboard.message('Cerveau exporté. Restauration et décisions vérifiées avant téléchargement.');
}

function loadDemonstration(value) {
  if (mode === 'race') throw new Error('Utilisez l’import multiple Race pour les concurrents.');
  const document = validateBrainDocument(value);
  // Test restoration before replacing the session or any current tensors.
  const brain = restoreRacingBrain(document);
  try { brain.predict(Array(document.config.sensors).fill(0)); }
  finally { brain.dispose(); }
  trainingConfig = { ...document.config };
  SIGHT = trainingConfig.sight;
  demonstrationDocument = document;
  championDocument = null;
  mode = 'demo';
  evaluationResults = {};
  resetSimulation();
  dashboard.setConfig(trainingConfig);
  dashboard.message('Cerveau restauré. Démonstration sans mutation ni reproduction ; Play pour démarrer.');
}

async function importBrainFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Fichier trop volumineux (maximum 2 Mo).');
    loadDemonstration(JSON.parse(await file.text()));
  } finally { event.target.value = ''; }
}
