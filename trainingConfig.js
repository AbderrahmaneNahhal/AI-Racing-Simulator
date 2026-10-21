const DEFAULT_TRAINING_CONFIG = Object.freeze({
  population: 100, mutation: 0.1, sensors: 6, sight: 50, hidden: 12, layers: 1
});

function validateTrainingConfig(value) {
  if (!value || typeof value !== 'object') throw new Error('Configuration absente.');
  const limits = {
    population: [10, 300, true], mutation: [0, 1, false], sensors: [3, 15, true],
    sight: [20, 200, true], hidden: [4, 48, true], layers: [1, 3, true]
  };
  const result = {};
  for (const [key, [min, max, integer]] of Object.entries(limits)) {
    const number = value[key];
    if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
      throw new Error(`Paramètre ${key} invalide (${min} à ${max}).`);
    }
    result[key] = number;
  }
  if (value.activation !== undefined) {
    if (!['sigmoid','relu'].includes(value.activation)) throw new Error('Activation invalide : Sigmoid ou ReLU.');
    result.activation = value.activation;
  }
  if (value.hiddenLayers !== undefined) {
    if (!Array.isArray(value.hiddenLayers) || value.hiddenLayers.length !== result.layers ||
      !Array.from(value.hiddenLayers).every(n=>Number.isInteger(n)&&n>=4&&n<=48)) throw new Error('Largeurs des couches incompatibles (4 à 48 neurones par couche).');
    result.hiddenLayers = value.hiddenLayers.slice();
  }
  return result;
}

function trainingWidths(config) { return config.hiddenLayers ? config.hiddenLayers.slice() : Array(config.layers).fill(config.hidden); }
function validateTrainingStop(value) {
  if(!value||typeof value.maxEnabled!=='boolean'||typeof value.successEnabled!=='boolean'||
    !Number.isInteger(value.maxGenerations)||value.maxGenerations<1||value.maxGenerations>100000||
    !Number.isFinite(value.successRate)||value.successRate<0||value.successRate>100)throw new Error('Arrêt : générations de 1 à 100000 et réussite de 0 à 100 %.');
  return {...value};
}
function trainingStopReason(rules, statistics) {
  if(rules.successEnabled&&statistics.successRate>=rules.successRate)return `Objectif atteint : ${statistics.successRate.toFixed(1)} % de réussite (objectif ${rules.successRate} %).`;
  if(rules.maxEnabled&&statistics.generation>=rules.maxGenerations)return `Limite atteinte : ${statistics.generation} générations terminées.`;
  return null;
}
function trainingTopology(config) {
  return [config.sensors, ...trainingWidths(config), 2];
}

function validateBrainDocument(value) {
  if (!value || value.format !== 'ai-racing-brain' || ![1,2].includes(value.version)) {
    throw new Error('Format de cerveau non reconnu.');
  }
  const config = validateTrainingConfig(value.config);
  if(value.version===1&&(config.activation==='relu'||trainingWidths(config).some(n=>n!==config.hidden)))
    throw new Error('Cette topologie ou activation nécessite un cerveau JSON version 2.');
  const topology = trainingTopology(config);
  if (JSON.stringify(value.topology) !== JSON.stringify(topology)) {
    throw new Error('Topologie incompatible avec les capteurs et la configuration.');
  }
  const shapes = [];
  for (let i = 1; i < topology.length; i++) shapes.push([topology[i - 1], topology[i]], [topology[i]]);
  if (!Array.isArray(value.weights) || value.weights.length !== shapes.length) throw new Error('Poids manquants.');
  value.weights.forEach((weight, index) => {
    const shape = shapes[index];
    const size = shape.reduce((a, b) => a * b, 1);
    if (!weight || JSON.stringify(weight.shape) !== JSON.stringify(shape) ||
        !Array.isArray(weight.values) || weight.values.length !== size ||
        !weight.values.every(x => Number.isFinite(x) && Number.isFinite(Math.fround(x)))) {
      throw new Error(`Poids ${index + 1} invalides.`);
    }
  });
  return { ...value, config, topology };
}
