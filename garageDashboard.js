class GarageDashboard {
  constructor(service, race, root = document) {
    this.service = service; this.race = race; this.root = root; this.records = [];
    this.busy = false;
    this.element('garage-open').addEventListener('click', () => { this.element('garage-panel').querySelector('details').open = true; });
    this.element('garage-save-champion').addEventListener('click', () => this.perform(() => this.saveChampion()));
    this.element('garage-import').addEventListener('change', event => this.perform(async () => {
      try { await this.importFiles(event.target.files); }
      finally { event.target.value = ''; }
    }));
    this.ready = this.refresh().then(() => this.message(`Garage prêt : ${this.records.length} cerveau(x) disponible(s).`))
      .catch(error => { this.message(error.message, true); });
  }
  element(id) { return this.root.getElementById(id); }
  message(text, error = false) {
    for (const id of ['garage-feedback','garage-capture-feedback']) {
      this.element(id).textContent = text; this.element(id).classList.toggle('error', error);
    }
  }
  async perform(action) {
    if (this.busy) return;
    this.busy = true; this.element('garage-save-champion').disabled = true;
    this.element('garage-import').disabled = true;
    try { await action(); }
    catch (error) { this.message(error.message, true); }
    finally { this.busy = false; this.element('garage-save-champion').disabled = false; this.element('garage-import').disabled = false; }
  }
  async refresh() {
    const records = await this.service.list();
    this.records = records;
    this.race.refreshGarage(records);
    this.render();
    this.updateQuota();
  }
  async updateQuota() {
    const element = this.element('garage-storage');
    if (!navigator.storage || !navigator.storage.estimate) { element.textContent = 'Quota non communiqué par ce navigateur.'; return; }
    try {
      const estimate = await navigator.storage.estimate();
      const mb = value => (value / 1024 / 1024).toFixed(1);
      element.textContent = Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) ?
        `Stockage du site : ${mb(estimate.usage)} Mo utilisés / quota estimé ${mb(estimate.quota)} Mo. Ce quota n’est pas réservé au Garage.` : 'Quota non communiqué par ce navigateur.';
    } catch { element.textContent = 'Estimation du stockage indisponible.'; }
  }
  async saveChampion() {
    const snapshot = captureGarageChampion({mode, championDocument,
      vehicles: population.concat(savedVehicles), generation: generationCount,
      track: currentTrack, trackSeed: RACING_TRACKS[currentTrack].seed,
      checkpointCount: checkpoints.length, date: new Date().toISOString()});
    const metadata = garageMetadata(snapshot);
    const defaultName = `Champion G${metadata.generation || '?'} — ${RACING_TRACKS[metadata.track] ? RACING_TRACKS[metadata.track].label : 'circuit inconnu'}`;
    const result = await this.service.add(snapshot, this.element('garage-champion-name').value || defaultName, 'training');
    // Store.add only resolves after IndexedDB's transaction.oncomplete.
    this.message(result.added ? `Champion « ${result.record.name} » enregistré dans le Garage. Disponible directement en Race.` :
      result.updated?`Champion « ${result.record.name} » actualisé : meilleure progression enregistrée, mêmes poids.`:
      `Ce cerveau est déjà dans le Garage sous le nom « ${result.record.name} ». Aucun doublon créé.`);
    await this.refresh();
  }
  async importFiles(files) {
    let added = 0, duplicates = 0; const errors = [];
    for (const file of Array.from(files)) {
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error('maximum 2 Mo par fichier');
        const name = Array.from(file.name.replace(/\.json$/i, '').trim() || 'Cerveau importé').slice(0, 80).join('');
        const result = await this.service.add(JSON.parse(await file.text()), name, 'json');
        if (result.added) added++; else duplicates++;
      } catch (error) { errors.push(`${file.name} : ${error.message}`); }
    }
    this.message(`${added} cerveau(x) enregistré(s), ${duplicates} doublon(s) ignoré(s).${errors.length ? ' ' + errors.join(' · ') : ' Disponibles en Race.'}`, errors.length > 0);
    await this.refresh();
  }
  async rename(record, name) {
    const updated = await this.service.rename(record.id, name);
    this.message(`Cerveau renommé « ${updated.name} ».`); await this.refresh();
  }
  async remove(record, confirmation = text => window.confirm(text)) {
    if (!confirmation(`Supprimer « ${record.name} » du Garage local ? Cette suppression est définitive. Exportez-le d’abord si vous souhaitez le conserver.`)) return false;
    await this.service.remove(record.id);
    this.message(`« ${record.name} » supprimé du Garage. Les courses déjà préparées conservent leur copie.`);
    await this.refresh(); return true;
  }
  exportRecord(record) {
    const value = this.service.exportDocument(record);
    downloadBrainJSON(value, record.name);
    this.message(`Export de « ${record.name} » : restauration et équivalence des prédictions vérifiées.`);
  }
  render() {
    this.element('garage-count').textContent = `${this.records.length} cerveau(x)`;
    const list = this.element('garage-list'); list.replaceChildren();
    if (!this.records.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'Le Garage est vide. Ajoutez un champion depuis Training ou importez un JSON.'; list.appendChild(empty); }
    for (const record of this.records) {
      const card = document.createElement('article'); card.className = 'garage-card';
      const name = document.createElement('strong'); name.textContent = record.name;
      const meta = garageMetadata(record.document);
      const track = meta.track && RACING_TRACKS[meta.track] ? RACING_TRACKS[meta.track].label : meta.track || 'inconnu';
      const generation = meta.generation === null ? 'inconnue' : meta.generation;
      const status = meta.captureStatus === 'completed' ? 'Génération terminée' : meta.captureStatus === 'in-progress' ? 'Capture en cours de génération' : 'État de génération non précisé';
      const summary = document.createElement('p'); summary.className = 'hint';
      summary.textContent = `Génération : ${generation} · Circuit : ${track} · ${status}. Progression : ${meta.progress === null ? 'inconnue' : meta.progress}${meta.checkpointCount === null ? ' (total de checkpoints inconnu)' : ' / ' + meta.checkpointCount}. Score : ${meta.score === null ? 'non renseigné' : meta.score + (meta.scoreUnit ? ' checkpoints' : ' (unité non précisée)')}.`;
      const network = document.createElement('p'); network.className = 'hint';
      network.textContent = `${record.document.config.sensors} capteurs · vision ${record.document.config.sight} px · réseau ${record.document.topology.join(' → ')}. Capture : ${meta.capturedAt ? new Date(meta.capturedAt).toLocaleString('fr-FR') : 'date inconnue'}. Ajout local : ${new Date(record.createdAt).toLocaleString('fr-FR')}.`;
      const controls = document.createElement('div'); controls.className = 'garage-actions';
      const input = document.createElement('input'); input.type = 'text'; input.maxLength = 80; input.value = record.name; input.setAttribute('aria-label', `Nouveau nom de ${record.name}`);
      const button = (text, action) => { const element = document.createElement('button'); element.type = 'button'; element.textContent = text; element.addEventListener('click', () => this.perform(action)); return element; };
      controls.append(input, button('Renommer', () => this.rename(record, input.value)),
        button('Export JSON', () => this.exportRecord(record)), button('Supprimer', () => this.remove(record)));
      card.append(name, summary, network, controls); list.appendChild(card);
    }
  }
}

function downloadBrainJSON(value, name) {
  const blob = new Blob([JSON.stringify(value)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 100) + '.json';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
