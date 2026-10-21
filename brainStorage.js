function serializeRacingBrain(brain, metadata = {}) {
  return {
    format: 'ai-racing-brain', version: brain.config.activation==='relu'||trainingWidths(brain.config).some(n=>n!==brain.config.hidden)?2:1,
    config: validateTrainingConfig(brain.config), topology: trainingTopology(brain.config),
    metadata,
    weights: brain.model.getWeights().map(weight => ({
      shape: Array.from(weight.shape), values: Array.from(weight.dataSync())
    }))
  };
}

function restoreRacingBrain(document) {
  const value = validateBrainDocument(document);
  // Restoration must not consume the learning RNG for weights immediately replaced.
  // Same topology/activations as RacingBrain; only the temporary initializer differs.
  const model = createRacingModel(value.config, true);
  const brain = new RacingBrain(value.config, model);
  try {
    tf.tidy(() => brain.model.setWeights(value.weights.map(weight => tf.tensor(weight.values, weight.shape))));
    return brain;
  } catch (error) { brain.dispose(); throw error; }
}

function verifiedBrainDocument(brain, metadata) {
  // Exercise the complete JSON round trip before reporting a successful export.
  const document = JSON.parse(JSON.stringify(serializeRacingBrain(brain, metadata)));
  const restored = restoreRacingBrain(document);
  try {
    for (const value of [0, .5, 1]) {
      const inputs = Array(brain.input_nodes).fill(value);
      const expected = brain.predict(inputs), actual = restored.predict(inputs);
      if (!actual.every((output, i) => Math.abs(output - expected[i]) < 1e-6)) {
        throw new Error('La restauration du cerveau ne reproduit pas les décisions.');
      }
    }
  } finally { restored.dispose(); }
  return document;
}

function saveTrainingConfiguration(storage, config, track) {
  const validated = validateTrainingConfig(config);
  if (!RACING_TRACKS[track]) throw new Error('Circuit inconnu.');
  storage.setItem('ai-racing-config-v1', JSON.stringify({version: 1, config: validated, track,
    ...(track==='custom'?{circuit:RACING_TRACKS.custom.document}:{})}));
}

function loadTrainingConfiguration(storage) {
  const text = storage.getItem('ai-racing-config-v1');
  if (!text) throw new Error('Aucune configuration enregistrée dans ce navigateur.');
  const value = JSON.parse(text);
  const config=validateTrainingConfig(value.config);
  if(value.version!==1)throw new Error('Configuration incompatible.');
  if(value.track==='custom'&&value.circuit)registerCustomTrack(value.circuit);
  if (!RACING_TRACKS[value.track]) throw new Error('Configuration incompatible.');
  return {config, track: value.track};
}
