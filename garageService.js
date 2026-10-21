function cloneGarageDocument(value) {
  return validateBrainDocument(JSON.parse(JSON.stringify(value)));
}

function captureGarageChampion(context) {
  if (context.mode !== 'training') throw new Error('Ajoutez un champion depuis Training. Pour un cerveau chargé en démonstration, utilisez Import JSON dans le Garage.');
  const archived = context.championDocument;
  const archivedScore = archived && Number.isFinite(archived.metadata && archived.metadata.progress) ? archived.metadata.progress : -1;
  const best = context.vehicles.reduce((leader, car) => Number.isFinite(car.fitness) && car.fitness >= 0 &&
    (!leader || car.fitness > leader.fitness) ? car : leader, null);
  if (best && best.fitness > archivedScore && best.fitness > 0) {
    return cloneGarageDocument(serializeRacingBrain(best.brain, {
      generation: context.generation + 1, track: context.track, trackSeed: context.trackSeed,
      checkpointCount: context.checkpointCount, progress: best.fitness, score: best.fitness, scoreUnit: 'checkpoints',
      captureStatus: 'in-progress', capturedAt: context.date, finished: best.finished
    }));
  }
  if (archived) {
    const document = cloneGarageDocument(archived);
    document.metadata = {...document.metadata, checkpointCount: context.checkpointCount,
      score: archivedScore >= 0 ? archivedScore : null, scoreUnit: 'checkpoints', captureStatus: 'completed', capturedAt: context.date};
    return document;
  }
  throw new Error('Aucun résultat à enregistrer : laissez une voiture franchir un checkpoint ou attendez la fin de la première génération.');
}

function garageDocumentIdentity(document) {
  return JSON.stringify({format: document.format, version: document.version, topology: document.topology,
    ...(document.config.activation==='relu'?{activation:'relu'}:{}),
    sight: document.config.sight, weights: document.weights.map(weight => ({shape: weight.shape, values: weight.values.map(Math.fround)}))});
}

async function fingerprintGarageDocument(document) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('La vérification du Garage nécessite un contexte sécurisé : utilisez http://127.0.0.1:8775/.');
  const bytes = new TextEncoder().encode(garageDocumentIdentity(document));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function verifyGarageDocument(value) {
  const document = cloneGarageDocument(value);
  const brain = restoreRacingBrain(document);
  try { verifiedBrainDocument(brain, document.metadata); }
  finally { brain.dispose(); }
  // Preserve the supplied JSON weights exactly; verification never rewrites them.
  return document;
}

function validGarageName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name || Array.from(name).length > 80) throw new Error('Choisissez un nom de 1 à 80 caractères.');
  return name;
}

function garageMetadata(document) {
  const metadata = document.metadata || {};
  const finite = value => Number.isFinite(value) && value >= 0 ? value : null;
  return {
    generation: Number.isSafeInteger(metadata.generation) && metadata.generation > 0 ? metadata.generation : null,
    track: typeof metadata.track === 'string' ? metadata.track : null,
    checkpointCount: Number.isSafeInteger(metadata.checkpointCount) && metadata.checkpointCount > 0 ? metadata.checkpointCount : null,
    progress: finite(metadata.progress), score: finite(metadata.score),
    scoreUnit: metadata.scoreUnit === 'checkpoints' ? 'checkpoints' : null,
    captureStatus: ['in-progress','completed'].includes(metadata.captureStatus) ? metadata.captureStatus : 'unknown',
    capturedAt: typeof metadata.capturedAt === 'string' && Number.isFinite(Date.parse(metadata.capturedAt)) ? metadata.capturedAt : null
  };
}

class GarageService {
  constructor(store, options = {}) {
    this.store = store;
    this.verify = options.verify || verifyGarageDocument;
    this.fingerprint = options.fingerprint || fingerprintGarageDocument;
    this.now = options.now || (() => new Date().toISOString());
  }
  async list() {
    const records = await this.store.list();
    return records.map(record => {
      if (record.version !== 1) throw new Error(`Entrée Garage incompatible : ${record.name || record.id}.`);
      return {...record, document: cloneGarageDocument(record.document)};
    });
  }
  async add(snapshot, requestedName, source) {
    // Detached synchronously before any await: next generations cannot alter it.
    const document = this.verify(cloneGarageDocument(snapshot));
    const name = validGarageName(requestedName);
    const fingerprint = await this.fingerprint(document);
    return this.store.add({version: 1, name, fingerprint, document,
      provenance: garageMetadata(document), source, createdAt: this.now()});
  }
  async rename(id, name) {
    const record = await this.store.rename(id, validGarageName(name));
    if (!record) throw new Error('Ce cerveau n’existe plus dans le Garage.');
    return record;
  }
  remove(id) { return this.store.remove(id); }
  exportDocument(record) { return this.verify(record.document); }
}
