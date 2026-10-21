function garageStorageError(error) {
  const messages = {
    QuotaExceededError: 'Espace de stockage local insuffisant. Exportez des cerveaux avant de libérer de la place.',
    SecurityError: 'Le navigateur refuse le stockage local. Utilisez le serveur local et vérifiez les autorisations du site.',
    VersionError: 'Ce Garage utilise une version incompatible. Ne supprimez pas ses données ; ouvrez la version compatible de l’application.',
    AbortError: 'Transaction annulée : aucune sauvegarde n’a été confirmée.',
    InvalidStateError: 'Le stockage local est fermé ou indisponible. Réessayez après rechargement.'
  };
  return new Error(messages[error && error.name] || `Garage indisponible : ${error && error.message || 'erreur de stockage inconnue'}`);
}

function garageNameKey(name) { return name.normalize('NFC').toLocaleLowerCase('fr'); }

// Only promote evidence supplied for the same model; never replace its weights/name/id.
function improvedGarageRecord(existing, incoming) {
  const old=existing.document.metadata||{},next=incoming.document.metadata||{};
  const score=value=>Number.isFinite(value.progress)&&value.progress>=0?value.progress:null;
  const a=score(old),b=score(next);
  const promote=b!==null&&(a===null||b>a||b===a&&next.captureStatus==='completed'&&old.captureStatus!=='completed');
  if(!promote)return null;
  const metadata={...old};
  // A better observation is a new provenance event. Missing fields must become
  // unknown, rather than inheriting an unrelated older generation/circuit/score.
  for(const key of ['progress','score','generation','checkpointCount','trackSeed','track','scoreUnit','capturedAt','captureStatus','finished','trackDocument'])delete metadata[key];
  const numeric=['progress','score','generation','checkpointCount','trackSeed'];
  for(const key of numeric)if(Number.isFinite(next[key])&&next[key]>=0)metadata[key]=next[key];
  for(const key of ['track','scoreUnit','capturedAt'])if(typeof next[key]==='string')metadata[key]=next[key];
  if(['in-progress','completed'].includes(next.captureStatus))metadata.captureStatus=next.captureStatus;
  if(typeof next.finished==='boolean')metadata.finished=next.finished;
  const document={...existing.document,metadata};
  return {...existing,document,provenance:{...existing.provenance,...garageMetadata(document)}};
}

class GarageStore {
  constructor(factory = globalThis.indexedDB, databaseName = 'ai-racing-garage') {
    this.factory = factory; this.databaseName = databaseName; this.connection = null;
  }
  open() {
    if (this.connection) return this.connection;
    if (!this.factory) return Promise.reject(new Error('IndexedDB est indisponible. Le Garage ne peut pas être conservé ; les fonctions JSON restent utilisables.'));
    this.connection = new Promise((resolve, reject) => {
      let settled = false;
      const request = this.factory.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('brains', {keyPath: 'id', autoIncrement: true});
        store.createIndex('fingerprint', 'fingerprint', {unique: true});
        store.createIndex('nameKey', 'nameKey', {unique: true});
      };
      request.onblocked = () => { settled = true; reject(new Error('Garage bloqué par un autre onglet. Fermez les autres onglets de cette application puis réessayez.')); };
      request.onerror = () => { settled = true; reject(garageStorageError(request.error)); };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        db.onversionchange = () => { db.close(); this.connection = null; };
        resolve(db);
      };
    }).catch(error => { this.connection = null; throw error; });
    return this.connection;
  }
  async close() { const pending = this.connection; this.connection = null; if (pending) (await pending).close(); }

  async transaction(mode, action) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let transaction, result;
      try { transaction = db.transaction('brains', mode); }
      catch (error) { reject(garageStorageError(error)); return; }
      // Request success is insufficient. Only oncomplete resolves a successful write.
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(garageStorageError(transaction.error || {name: 'AbortError'}));
      transaction.onerror = () => {}; // IDB aborts on request errors; report its final abort.
      try { action(transaction.objectStore('brains'), value => { result = value; }); }
      catch (error) { transaction.abort(); reject(garageStorageError(error)); }
    });
  }

  list() {
    return this.transaction('readonly', (store, done) => { store.getAll().onsuccess = event => done(event.target.result); });
  }

  chooseName(store, requested, ownId, done, suffix = 1) {
    const ending = suffix === 1 ? '' : ` (${suffix})`;
    const name = Array.from(requested).slice(0, 80 - ending.length).join('') + ending;
    const nameKey = garageNameKey(name);
    store.index('nameKey').get(nameKey).onsuccess = event => {
      const existing = event.target.result;
      if (existing && existing.id !== ownId) this.chooseName(store, requested, ownId, done, suffix + 1);
      else done(name, nameKey);
    };
  }

  add(record) {
    return this.transaction('readwrite', (store, done) => {
      store.index('fingerprint').get(record.fingerprint).onsuccess = event => {
        if (event.target.result) {
          const existing=event.target.result,next=improvedGarageRecord(existing,record);
          if(next)store.put(next).onsuccess=()=>done({added:false,updated:true,record:next});
          else done({added:false,updated:false,record:existing});
          return;
        }
        this.chooseName(store, record.name, null, (name, nameKey) => {
          const next = {...record, name, nameKey};
          delete next.id;
          store.add(next).onsuccess = event => done({added: true, record: {...next, id: event.target.result}});
        });
      };
    });
  }

  rename(id, name) {
    return this.transaction('readwrite', (store, done) => {
      store.get(id).onsuccess = event => {
        const record = event.target.result;
        if (!record) { done(null); return; }
        this.chooseName(store, name, id, (finalName, nameKey) => {
          const next = {...record, name: finalName, nameKey};
          store.put(next).onsuccess = () => done(next);
        });
      };
    });
  }

  remove(id) {
    return this.transaction('readwrite', (store, done) => { store.delete(id).onsuccess = () => done(true); });
  }
}
