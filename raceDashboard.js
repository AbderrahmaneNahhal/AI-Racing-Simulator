class RaceDashboard {
  constructor(modes, root = document) {
    this.modes = modes; this.root = root; this.catalog = []; this.garageEntries = []; this.sequence = 0;
    this.speedPanel = this.element('speed-control').parentElement;
    this.speedHome = this.speedPanel.parentElement;
    this.speedNext = this.speedPanel.nextSibling;
    this.trainingHint = this.element('selection-hint').textContent;
    this.element('race-format').addEventListener('change', () => this.perform(() => {
      this.modes.race.setFormat(this.element('race-format').value);
      this.modes.publishRace();
      this.message('Format changé. Poids conservés ; départs et compteurs réinitialisés.');
    }));
    this.element('simulation-mode').addEventListener('change', () => this.perform(() => this.switchMode(this.element('simulation-mode').value)));
    this.element('race-brains').addEventListener('change', event => this.perform(async () => {
      try { await this.importFiles(event.target.files); }
      finally { event.target.value = ''; }
    }));
    this.element('race-track').addEventListener('change', () => this.perform(() => {
      this.modes.changeRaceTrack(this.element('race-track').value); syncCameraControls();
      this.message('Circuit changé. Préparez les nouveaux départs.');
    }));
    this.element('race-prepare').addEventListener('click', () => this.perform(() => {
      this.modes.prepareRace(this.selectedEntries()); syncCameraControls();
      this.message('Départs prêts. Start pour lancer le format sélectionné ; cerveaux figés.');
    }));
    this.element('race-start').addEventListener('click', () => this.perform(() => this.modes.race.start()));
    this.element('race-pause').addEventListener('click', () => this.modes.race.pause());
    this.element('race-restart').addEventListener('click', () => this.perform(() => {
      this.modes.race.restart(); this.modes.publishRace();
      this.message(this.modes.race.format==='simultaneous'?'Grille simultanée, compteurs et mêmes poids restaurés. Start pour repartir.':'Départs Training, compteurs et mêmes poids restaurés. Start pour repartir.');
    }));
  }
  element(id) { return this.root.getElementById(id); }
  message(text, error = false) {
    this.element('race-feedback').textContent = text;
    this.element('race-feedback').classList.toggle('error', error);
  }
  async perform(action) {
    try { await action(); }
    catch (error) {
      this.message(error.message, true);
      this.element('simulation-mode').value = this.modes.active;
    }
  }

  switchMode(target) {
    if (target === this.modes.active) return;
    if (target === 'race') {
      this.modes.enterRace(this.element('race-track').value);
      this.element('race-speed-slot').appendChild(this.speedPanel);
    } else {
      this.modes.leaveRace();
      this.speedHome.insertBefore(this.speedPanel, this.speedNext);
    }
    const racing = this.modes.active === 'race';
    if(this.root.body)this.root.body.dataset.mode=racing?'race':'training';
    this.element('simulation-mode').value = racing ? 'race' : 'training';
    this.element('training-panels').hidden = racing;
    this.element('race-panel').hidden = !racing;
    this.root.querySelector('.comparisons').hidden = racing;
    this.element('track-select').disabled = racing;
    this.element('track-select').value = currentTrack;
    this.element('show-sensors').checked = showSensors;
    this.element('show-checkpoints').checked = showCheckpoints;
    this.element('training-render-legend').hidden = racing;
    this.element('race-render-legend').hidden = !racing;
    this.element('selection-hint').textContent = racing ?
      'Cliquez sur un concurrent pour l’inspecter. Le format et ses règles sont indiqués dans le panneau Race.' : this.trainingHint;
    syncCameraControls();
    this.message('Training conservé en mémoire. Sélectionnez 2 à 8 cerveaux du Garage ou complétez avec des fichiers JSON.');
  }

  addDocument(name, value) {
    if (this.catalog.length >= 16) throw new Error('Bibliothèque limitée à 16 fichiers ; retirez un fichier avant un nouvel import.');
    const document = validateBrainDocument(value);
    // Exercise restoration on import, then retain data only, with no live tensors.
    const brain = restoreRacingBrain(document);
    try { brain.predict(Array(document.config.sensors).fill(0)); }
    finally { brain.dispose(); }
    this.catalog.push({id: ++this.sequence, name, document: JSON.parse(JSON.stringify(document)),
      selected: this.selectedEntries().length < 8});
    this.renderCatalog();
  }

  async importFiles(files) {
    const errors = []; let added = 0;
    for (const file of Array.from(files)) {
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error('maximum 2 Mo par fichier');
        this.addDocument(file.name, JSON.parse(await file.text())); added++;
      } catch (error) { errors.push(`${file.name} : ${error.message}`); }
    }
    this.message(`${added} cerveau(x) importé(s).${errors.length ? ' ' + errors.join(' · ') : ' Préparez les départs pour appliquer la sélection.'}`, errors.length > 0);
  }

  refreshGarage(records) {
    const previous = new Map(this.garageEntries.map(entry => [entry.garageId, entry.selected]));
    let count = this.catalog.filter(entry => entry.selected).length;
    this.garageEntries = records.map(record => {
      const selected = count < 8 && (previous.has(record.id) ? previous.get(record.id) : true);
      if (selected) count++;
      return {id: `garage-${record.id}`, garageId: record.id, name: record.name,
        document: cloneGarageDocument(record.document), selected};
    });
    this.renderCatalog();
  }
  selectedEntries() { return this.garageEntries.concat(this.catalog).filter(entry => entry.selected); }
  renderSelectionCount() {
    const summary=this.element('race-library-summary');
    if(summary)summary.textContent=`Concurrents · ${this.selectedEntries().length} sélectionné(s) / 8`;
  }
  renderCatalog() {
    this.renderSelectionCount();
    const list = this.element('race-library'); list.replaceChildren();
    if (!this.garageEntries.length && !this.catalog.length) {
      const empty = document.createElement('p'); empty.className = 'hint';
      empty.textContent = 'Aucun cerveau disponible. Ajoutez un champion au Garage en Training, ou utilisez les options JSON complémentaires.';
      list.appendChild(empty);
    }
    for (const entry of this.garageEntries.concat(this.catalog)) {
      const row = document.createElement('div'); row.className = 'race-entry';
      const label = document.createElement('label'); const check = document.createElement('input');
      check.type = 'checkbox'; check.checked = entry.selected;
      check.addEventListener('change', () => {
        if (check.checked && this.selectedEntries().length >= 8) {
          check.checked = false; this.message('Maximum 8 concurrents sélectionnés.', true); return;
        }
        entry.selected = check.checked;
        this.renderSelectionCount();
      });
      const text = document.createElement('span'); text.textContent = entry.name;
      const details = document.createElement('small');
      details.textContent = `${entry.garageId ? 'Garage persistant' : 'Fichier temporaire'} · ${entry.document.topology.join(' → ')} · vision ${entry.document.config.sight} px`;
      label.append(check, text, details);
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Retirer';
      remove.setAttribute('aria-label', `Retirer ${entry.name}`);
      remove.addEventListener('click', () => { this.catalog = this.catalog.filter(item => item.id !== entry.id); this.renderCatalog(); });
      row.appendChild(label);
      if (!entry.garageId) row.appendChild(remove);
      list.appendChild(row);
    }
  }

  render(session) {
    const simultaneous = session.format === 'simultaneous';
    const ruleSummary=this.element('race-rules-summary');
    if(ruleSummary)ruleSummary.textContent=simultaneous?'Délais : 150/25 pas · trafic borné (60/180)':'Référence Training · 25 pas sans trafic';
    const states = {empty:'Sélectionnez les concurrents',ready:'Départs prêts',running:'Contre-la-montre en cours',paused:'Compétition en pause',finished:'Compétition terminée'};
    this.element('race-status').textContent = simultaneous && session.state === 'running' ? 'Course simultanée en cours' : (session.error || states[session.state]);
    this.element('mode-label').textContent = simultaneous ? 'RACE · SIMULTANÉE · CONTACTS PHYSIQUES · 1 TOUR' : 'RACE · CONTRE-LA-MONTRE FANTÔME · 1 TOUR';
    this.element('race-format').value = session.format;
    this.element('race-format').disabled = session.state === 'running';
    this.element('race-rules').textContent = simultaneous ?
      'Grille orientée dans le sens des checkpoints, départ immobile sans vitesse ajoutée. Capteurs et pilotage utilisent le cap tangent même à vitesse nulle. Avant le premier checkpoint, la force interdit la marche arrière ; aucun guidage vers une trajectoire. Premier checkpoint : 150 pas (élimination au 151e sans progression), puis règle originale de 25 pas. Aucun checkpoint offert. Dépassement seulement si le couloir est libre ; sinon suivi et freinage. Disques de rayon 8 : contrainte continue avant déplacement, arrêt inélastique sans téléportation. Une voiture arrivée ou éliminée reste visible et solide pendant 6 pas avec la mention RETRAIT, puis quitte la piste. Trafic prouvé (contact, freinage ou file) : compteur de checkpoints suspendu au plus 60 pas consécutifs sans checkpoint et 180 pas cumulés ; le temps de course continue. Blocage au-delà : élimination explicite.' :
      'Contre-la-montre fantôme : aucune collision ni interaction. Départs Training exacts, décalés de 18 unités de dégagement. Attente sans simulation ; règle originale de 25 pas. Classement par pas actifs, indépendamment du FPS et de ×1–×10.';
    this.element('race-interactions').textContent = simultaneous ?
      `Pas trafic neutralisés : ${session.vehicles.reduce((sum,car)=>sum+(session.resultFor(car).trafficHeldSteps||0),0)} · Risques écartés : ${session.interactions.avoided} · Contacts bloqués : ${session.interactions.collisions} · Suivi : ${session.visibleVehicles.filter(car=>session.resultFor(car).maneuver==='follow').length} · Dépassement : ${session.visibleVehicles.filter(car=>(session.resultFor(car).maneuver||'').startsWith('pass-')).length}. Risques écartés : estimation, pas preuve causale.` : '';
    this.element('simulation-status').textContent = simultaneous && session.state === 'running' ? 'Course simultanée en cours' : states[session.state];
    this.element('speed-value').textContent = `×${speedSlider.value()}`;
    this.element('race-start').disabled = !['ready','paused'].includes(session.state);
    this.element('race-pause').disabled = session.state !== 'running';
    this.element('race-restart').disabled = session.vehicles.length === 0;
    this.element('race-prepare').disabled = session.state === 'running';
    this.element('race-track').disabled = session.state === 'running';
    this.element('race-brains').disabled = session.state === 'running';
    const standings = session.standings();
    this.element('race-live').textContent = `${session.visibleVehicles.length} ${simultaneous&&session.state==='ready'?'sur grille':'en piste'} · ${simultaneous?0:standings.pending.filter(result => result.state === 'waiting').length} en attente / ${session.vehicles.length}`;
    const body = this.element('race-participants'); body.replaceChildren();
    const eliminated = this.element('race-eliminated'); eliminated.replaceChildren();
    const causes = {'traffic-timeout':'Trafic bloqué (> 60 pas sans checkpoint)','traffic-budget-exhausted':'Budget trafic épuisé (180 pas)',wall:'Mur',collision:'Collision résiduelle (retrait)', 'checkpoint-timeout':simultaneous?'Absence de checkpoint (150 au départ, puis 25 pas)':'Absence de checkpoint (> 25 pas)',exception:'Erreur de simulation',other:'Autre cause'};
    for (const result of [...standings.finishers, ...standings.pending, ...standings.eliminated]) {
      const car = result.car;
      const row = document.createElement('tr');
      const state = result.state === 'finished' ? 'Arrivée' : result.state === 'waiting' ? simultaneous?'Sur grille':'En attente' : result.state === 'running' ?
        result.maneuver==='contact'?'Contact : mouvement bloqu?':result.maneuver==='follow'?'Suit devant':(result.maneuver||'').startsWith('pass-')?'Dépassement':'En piste' : causes[result.cause];
      const cells = [`#${car.number}`, car.name, `${car.fitness} / 60`, result.activeSteps, state];
      if (result.state !== 'eliminated') cells.unshift(result.rank || '—');
      for (const text of cells) {
        const cell = document.createElement('td'); cell.textContent = text; row.appendChild(cell);
      }
      row.children[result.state === 'eliminated' ? 0 : 1].style.color = car.color;
      if (result.error) row.title = result.error;
      else if(simultaneous)row.title=JSON.stringify({trafficHeldSteps:result.trafficHeldSteps||0,firstTrafficHold:result.firstTrafficHold,firstIntervention:result.firstIntervention});
      (result.state === 'eliminated' ? eliminated : body).appendChild(row);
    }
    this.element('selected-car').textContent = selectedVehicle ? `Concurrent #${selectedVehicle.number} · ${selectedVehicle.name}` : 'Sélectionnez une voiture';
    const outputs = selectedVehicle && selectedVehicle.brain.lastOutputs;
    this.element('network-decision').textContent = outputs && outputs.length ?
      `Direction ${(outputs[0] * 360 - 180).toFixed(0)}° · vitesse désirée ${(outputs[1] * selectedVehicle.maxspeed).toFixed(2)} px/pas` : 'En attente du départ';
  }
}
