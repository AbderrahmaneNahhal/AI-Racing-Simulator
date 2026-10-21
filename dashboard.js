// Read-only measurements: never normalize or mutate a live vehicle for the UI.
function generationStatistics(vehicles) {
  let bestProgress = 0;
  let meanFitness = 0;
  let meanProgress = 0;
  let finishedCount = 0;
  vehicles.forEach((vehicle, index) => {
    const progress = Number.isFinite(vehicle.fitness) ? Math.max(0, vehicle.fitness) : 0;
    bestProgress = Math.max(bestProgress, progress);
    meanProgress += (progress - meanProgress) / (index + 1);
    if (vehicle.finished) finishedCount++;
    // Reuse the existing fitness contract on a shallow snapshot, without tensors.
    const snapshot = Object.assign(Object.create(Object.getPrototypeOf(vehicle)), vehicle);
    snapshot.fitness = progress;
    snapshot.calculateFitness();
    meanFitness += (snapshot.fitness - meanFitness) / (index + 1);
  });
  return { bestProgress, meanFitness: vehicles.length ? meanFitness : null,
    meanProgress: vehicles.length ? meanProgress : null, finishedCount,
    successRate: vehicles.length ? finishedCount / vehicles.length * 100 : null };
}

function disposePopulation(active, saved) {
  // A vehicle belongs to one collection; Set also guards against double disposal.
  for (const vehicle of new Set([...active, ...saved])) {
    const brain = vehicle.brain;
    // TF.js 1.1 Sequential.dispose() requires its internal graph to be built,
    // including for fresh cars that have never performed a prediction.
    if (brain && brain.model && !brain.model.built) {
      brain.model.build([null, brain.input_nodes]);
    }
    vehicle.dispose();
  }
}

class RacingDashboard {
  constructor(slider, actions, root = document) {
    this.root = root;
    slider.parent('speed-control');
    slider.attribute('id', 'simulation-speed');
    this.element('play').addEventListener('click', actions.play);
    this.element('pause').addEventListener('click', actions.pause);
    this.element('reset').addEventListener('click', actions.reset);
    for (const [id, action] of Object.entries(actions)) {
      if (!['play', 'pause', 'reset'].includes(id)) {
        this.element(id).addEventListener(id === 'brain-file' || id === 'track-file' || id === 'track-select' ||
          id === 'show-sensors' || id === 'show-checkpoints' ? 'change' : 'click', action);
      }
    }
    this.root.querySelectorAll('[data-config-slider]').forEach(input=>input.addEventListener('input',()=>this.syncSliders()));
    this.syncSliders();
  }

  element(id) { return this.root.getElementById(id); }

  render(state) {
    this.element('generation').textContent = state.generation;
    this.element('alive').textContent = `${state.alive} / ${state.total}`;
    this.element('progress').textContent = `${state.progress} / ${state.checkpoints}`;
    this.element('mean-progress').textContent = state.meanProgress == null ? '—' :
      state.meanProgress.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    this.element('success').textContent = state.successRate == null ? '—' : `${state.successRate.toFixed(1)} %`;
    this.element('finishers').textContent = state.finishedCount == null ? '—' : state.finishedCount;
    this.element('speed-value').textContent = `×${state.speed}`;
    this.element('simulation-status').textContent = state.paused ? 'En pause' : 'En cours';
    const stop=this.root.getElementById('training-stop-reason');
    if(stop)stop.textContent=state.stopReason||'Arrêt automatique évalué après chaque génération terminée. Play reprend ; Reset recommence la série.';
    this.element('play').disabled = !state.paused;
    this.element('pause').disabled = state.paused;
    this.element('mode-label').textContent = state.mode === 'demo' ? 'DÉMONSTRATION · CERVEAU FIGÉ' : 'ENTRAÎNEMENT · ALGORITHME GÉNÉTIQUE';
    this.element('export-brain').disabled = !state.hasChampion;
    this.element('training-mode').disabled = state.mode !== 'demo';
    this.element('network-topology').textContent = state.topology || '6 → 12 → 2';
    this.element('history-count').textContent = `${state.historyLength || 0} générations`;
    this.element('selected-car').textContent = state.selected || 'Aucune voiture active';
    this.element('network-decision').textContent = state.decision || 'En attente d’une décision';
    if (state.chart) state.chart.render(state.history, state.checkpoints, state.track);
    if (state.evaluations) {
      const signature = JSON.stringify(state.evaluations);
      if (signature !== this.evaluationSignature) {
        this.renderEvaluations(state.evaluations);
        this.evaluationSignature = signature;
      }
    }
  }

  readConfig() {
    const value = {};
    for (const key of Object.keys(DEFAULT_TRAINING_CONFIG)) {
      const text = this.element(`config-${key}`).value.trim();
      if (text === '') throw new Error(`Renseignez le paramètre ${key}.`);
      value[key] = Number(text);
    }
    value.mutation /= 100;
    value.activation=this.element('config-activation').value;
    value.hiddenLayers=Array.from({length:value.layers},(_,i)=>Number(this.element(i?'config-hidden-'+(i+1):'config-hidden').value));
    return validateTrainingConfig(value);
  }

  setConfig(config) {
    for (const key of Object.keys(DEFAULT_TRAINING_CONFIG)) {
      const value=config[key];
      this.element(`config-${key}`).value = key === 'mutation' ? value * 100 : value;
    }
    this.element('config-activation').value=config.activation||'sigmoid';
    trainingWidths(config).forEach((value,i)=>{this.element(i?'config-hidden-'+(i+1):'config-hidden').value=value;});
    this.syncSliders();
  }

  syncSliders() {
    this.root.querySelectorAll('[data-config-slider]').forEach(input=>{
      const output=this.root.getElementById(input.id+'-value');if(output)output.textContent=input.value;
    });
    this.root.querySelectorAll('[data-hidden-layer]').forEach(label=>{label.hidden=Number(label.dataset.hiddenLayer)>Number(this.element('config-layers').value);});
  }

  message(text, error = false) {
    const element = this.element('feedback');
    element.textContent = text;
    element.classList.toggle('error', error);
  }

  renderEvaluations(results) {
    const body = this.element('evaluation-results');
    body.replaceChildren();
    for (const [id, result] of Object.entries(results)) {
      const row = document.createElement('tr');
      for (const text of [RACING_TRACKS[id].label, `${result.bestProgress} / 60`, result.finishedCount ? 'Oui' : 'Non']) {
        const cell = document.createElement('td'); cell.textContent = text; row.appendChild(cell);
      }
      body.appendChild(row);
    }
  }
}
