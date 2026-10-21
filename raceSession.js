function createRaceScene(id) {
  const preset = RACING_TRACKS[id];
  if (!preset) throw new Error('Circuit inconnu.');
  noiseSeed(preset.seed);
  const geometry = trackGeometry(id, width, height, noise);
  const inner = geometry.inside.map(p => createVector(p.x, p.y));
  const outer = geometry.outside.map(p => createVector(p.x, p.y));
  const checkpoints = inner.map((p, i) => new Boundary(p.x, p.y, outer[i].x, outer[i].y));
  const walls = [];
  for (let i = 0; i < inner.length; i++) {
    const next = (i + 1) % inner.length;
    for (const points of [inner, outer]) walls.push(new Boundary(points[i].x, points[i].y, points[next].x, points[next].y));
  }
  const camera = new RacingCamera(width, height); camera.fit(inner.concat(outer));
  return {id, inner, outer, checkpoints, walls, start: checkpoints[0].midpoint(),
    end: checkpoints[checkpoints.length - 1].midpoint(), camera,
    renderer: new TrackRenderer(inner, outer, width, height, preset.seed)};
}

class RaceSession {
  constructor(scene) {
    this.scene = scene;
    this.vehicles = []; this.entries = []; this.state = 'empty';
    this.results = new Map();
    this.format = 'time-trial';
    this.interactions = {avoided:0, collisions:0};
    this.risks = new Set();
    this.contactPairs = new Set(); this.raceTicks = 0;
  }

  setFormat(format) {
    if (!['time-trial', 'simultaneous'].includes(format)) throw new Error('Format inconnu.');
    if (this.state === 'running') throw new Error('Mettez la course en pause avant de changer de format.');
    const previous = this.format;
    this.format = format;
    try {if (this.entries.length) this.prepare(this.entries);}
    catch (error) {this.format = previous; throw error;}
  }

  prepare(entries) {
    if (!Array.isArray(entries) || entries.length < 2 || entries.length > 8) {
      throw new Error('Une compétition exige 2 à 8 concurrents.');
    }
    const next = [];
    const slots = this.format === 'simultaneous' ? createRaceGrid(this.scene.inner, this.scene.outer, entries.length) : null;
    try {
      withRaceSpawn(this.scene, () => {
        entries.forEach((entry, i) => {
          const car = new CompetitionVehicle(entry, slots ? slots[i] : this.scene.start, i + 1);
          next.push(car);
          // Explicit simultaneous-only first-checkpoint budget: 150 steps, then
          // the inherited counter resets to zero and the original 25-step rule resumes.
          if (slots) car.counter = -(150 - LIFESPAN);
        });
      });
    } catch (error) { disposePopulation(next, []); throw error; }
    // Each model keeps the exact Training constructor state. Waiting is managed
    // outside Vehicle: no perception, force, checkpoint check or update while queued.
    disposePopulation(this.vehicles, []);
    this.vehicles = next;
    this.entries = entries.slice();
    this.results = new Map();
    next.forEach(car => this.resultFor(car));
    this.interactions = {avoided:0, collisions:0}; this.risks.clear();
    this.contactPairs.clear(); this.raceTicks = 0;
    this.error = null; this.state = 'ready';
  }

  start() {
    if (this.state === 'empty') throw new Error('Sélectionnez 2 à 8 cerveaux puis préparez les départs.');
    if (this.state === 'finished') throw new Error('La course est terminée. Utilisez Restart.');
    this.state = 'running';
  }
  pause() { if (this.state === 'running') this.state = 'paused'; }
  restart() { this.prepare(this.entries); }

  resultFor(car) {
    if (!this.results.has(car)) this.results.set(car, {car, state: 'waiting', activeSteps: 0, cause: null});
    return this.results.get(car);
  }

  get visibleVehicles() {
    return this.vehicles.filter(car => this.resultFor(car).state === 'running' ||
      this.format === 'simultaneous' && (this.state === 'ready' || this.resultFor(car).retireAt > this.raceTicks));
  }

  standings() {
    const results = this.vehicles.map(car => this.resultFor(car));
    const finishers = results.filter(result => result.state === 'finished')
      .sort((a, b) => a.activeSteps - b.activeSteps || a.car.number - b.car.number);
    let rank = 0;
    return {
      finishers: finishers.map((result, index) => {
        if (!index || result.activeSteps !== finishers[index - 1].activeSteps) rank = index + 1;
        return {...result, rank};
      }),
      pending: results.filter(result => ['running', 'waiting'].includes(result.state)),
      eliminated: results.filter(result => result.state === 'eliminated')
        .sort((a, b) => b.car.fitness - a.car.fitness || a.car.number - b.car.number)
    };
  }

  step() {
    if (this.state !== 'running') return;
    if (this.format === 'simultaneous') {this.stepSimultaneous(); return;}
    // 18 world units exceed the combined rendering envelopes. Only live runners
    // occupy the release zone; terminal cars are hidden and cannot block the queue.
    const zoneFree = this.visibleVehicles.every(car =>
      Math.hypot(car.pos.x - this.scene.start.x, car.pos.y - this.scene.start.y) >= 18);
    if (zoneFree) {
      const next = this.vehicles.find(car => this.resultFor(car).state === 'waiting');
      if (next) this.resultFor(next).state = 'running';
    }
    for (const car of this.visibleVehicles) {
      const result = this.resultFor(car);
      result.activeSteps++;
      try {
        const force = car.look(this.scene.walls);
        const hitWall = car.dead;
        car.applyForce(force);
        // Exactly the Training order, including the terminal decision/check cycle.
        car.check(this.scene.checkpoints); car.update();
        if (car.finished) result.state = 'finished';
        else if (car.dead) {
          result.state = 'eliminated';
          result.cause = hitWall ? 'wall' : car.counter > LIFESPAN ? 'checkpoint-timeout' : 'other';
        }
      } catch (error) {
        result.state = 'eliminated'; result.cause = 'exception';
        result.error = String(error.message || error);
      }
    }
    if (this.vehicles.every(car => ['finished', 'eliminated'].includes(this.resultFor(car).state))) this.state = 'finished';
  }

  stepSimultaneous() {
    this.raceTicks++;
    for (const car of this.vehicles) if (this.resultFor(car).state === 'waiting') this.resultFor(car).state = 'running';
    const active = this.vehicles.filter(car=>this.resultFor(car).state==='running');
    const snapshots = this.visibleVehicles.map(car => ({number:car.number,pos:car.pos.copy(),
      vel:this.resultFor(car).state==='running'?car.vel.copy():createVector(0,0),heading:car.simultaneousHeading,maxspeed:car.maxspeed,maxforce:car.maxforce}));
    const liveRisks = new Set();
    for (let i=0;i<snapshots.length;i++) for(let j=i+1;j<snapshots.length;j++) {
      const key = `${snapshots[i].number}:${snapshots[j].number}`;
      if (racePairRisk(snapshots[i],snapshots[j]).threat) liveRisks.add(key);
      else if (this.risks.has(key)) this.interactions.avoided++;
    }
    this.risks = liveRisks;
    const decisions=new Map();
    for (const car of active) {
      const result = this.resultFor(car); result.activeSteps++;
      if(Math.hypot(car.vel.x,car.vel.y)>.01)car.contactHeading=Math.atan2(car.vel.y,car.vel.x);
      try {
        const neural = car.look(this.scene.walls);
        const hitWall = car.dead;
        const avoidance = raceTrafficSteering(snapshots.find(snapshot=>snapshot.number===car.number),snapshots,this.scene.walls);
        result.maneuver = avoidance.maneuver;
        const forward=Number.isFinite(car.simultaneousHeading)&&(car.fitness===0||avoidance.threats)?
          raceTrackForward({x:car.pos.x+car.vel.x,y:car.pos.y+car.vel.y},this.scene.inner,this.scene.outer,true):null;
        const force = raceSafeTrafficForce(car,neural,avoidance,this.scene.walls,forward);
        const neuralBaseline=raceSafeTrafficForce(car,neural,{threats:0},this.scene.walls,forward);
        decisions.set(car,{neural,neuralBaseline,force,avoidance});
        if(!result.firstIntervention&&Math.hypot(force.x-neural.x,force.y-neural.y)>1e-7)
          result.firstIntervention={step:result.activeSteps,stage:Math.hypot(force.x-neuralBaseline.x,force.y-neuralBaseline.y)>1e-7?'traffic-steering':'launch-guard',
            maneuver:avoidance.maneuver,neural:[neural.x,neural.y],neuralBaseline:[neuralBaseline.x,neuralBaseline.y],force:[force.x,force.y],
            position:[car.pos.x,car.pos.y],checkpoint:car.index,counter:car.counter};
        car.lastForce = force.copy(); car.applyForce(force);
        car.check(this.scene.checkpoints);
        if (car.finished) result.state = 'finished';
        else if (hitWall) {result.state='eliminated';result.cause='wall';}
      } catch(error) {result.state='eliminated';result.cause='exception';result.error=String(error.message||error);}
    }
    // Terminal bodies remain visible AND solid for six simulation steps, then
    // are explicitly withdrawn. Waiting/retirement never changes activeSteps.
    for(const car of active)if(this.resultFor(car).state!=='running')this.retireCar(car);
    const bodies=this.visibleVehicles.map(car=>({number:car.number,pos:car.pos,vel:car.vel,
      stationary:this.resultFor(car).state!=='running'}));
    let constraint;
    try {constraint=raceConstrainMotions(bodies);}
    catch(error) {this.state='paused';this.error=error.message;return;}
    // Count contact episodes, not each attempted displacement at the same contact.
    for(const key of Array.from(this.contactPairs)) {
      const [a,b]=key.split(':').map(Number),pa=this.vehicles.find(c=>c.number===a),pb=this.vehicles.find(c=>c.number===b);
      if(!bodies.some(c=>c.number===a)||!bodies.some(c=>c.number===b)||Math.hypot(pa.pos.x-pb.pos.x,pa.pos.y-pb.pos.y)>20)this.contactPairs.delete(key);
    }
    for(const key of constraint.contacts)if(!this.contactPairs.has(key)) {
      this.contactPairs.add(key);this.interactions.collisions++;
    }
    for(const car of active) {
      const result=this.resultFor(car);
      if(result.state!=='running') continue;
      if(constraint.blocked.has(car.number)) {
        // Inelastic contact: cancel the unsafe increment, without moving the car.
        // Keep the bounded steering acceleration so it can leave laterally or
        // reverse on the next step. All motion still uses the inherited update.
        car.vel.x=0;car.vel.y=0;
        if(Number.isFinite(car.simultaneousHeading)) {
          // Contact changed the velocity AFTER steering. Revalidate acceleration
          // against the now stationary state, otherwise braking becomes reverse.
          const forward=raceTrackForward(car.pos,this.scene.inner,this.scene.outer,true);
          const force=raceSafeTrafficForce(car,car.acc,{threats:0},[],forward);
          car.acc.set(0,0);car.applyForce(force);car.lastForce=force.copy();
        }
        result.contactSteps=(result.contactSteps||0)+1;result.maneuver='contact';
      }
      try {
        const decision=decisions.get(car),snapshot=snapshots.find(other=>other.number===car.number);
        const delay=raceTrafficDelay(snapshot,snapshots,decision.neuralBaseline,decision.force,decision.avoidance,constraint.blocked.has(car.number));
        if(!this.applyTrafficBudget(car,delay)){this.retireCar(car);continue;}
        car.update();
        if(car.dead){result.state='eliminated';result.cause=car.counter>LIFESPAN?'checkpoint-timeout':'other';}
      } catch(error){result.state='eliminated';result.cause='exception';result.error=String(error.message||error);}
      if(result.state!=='running')this.retireCar(car);
    }
    if(this.vehicles.every(car=>['finished','eliminated'].includes(this.resultFor(car).state)) && !this.visibleVehicles.length) this.state='finished';
  }

  applyTrafficBudget(car,reason) {
    const result=this.resultFor(car);
    if(result.trafficProgress!==car.fitness)result.trafficHoldStreak=0;
    result.trafficProgress=car.fitness;
    result.trafficReason=reason;
    if(!reason){result.trafficHoldStreak=0;return true;}
    const streak=result.trafficHoldStreak||0,total=result.trafficHeldSteps||0;
    if(streak>=RACE_INTERACTIONS.trafficConsecutive||total>=RACE_INTERACTIONS.trafficTotal) {
      car.dead=true;result.state='eliminated';
      result.cause=streak>=RACE_INTERACTIONS.trafficConsecutive?'traffic-timeout':'traffic-budget-exhausted';
      return false;
    }
    // Compensate exactly the increment about to occur in inherited update().
    // Never revive a dead car, offer progress, or change Training's LIFESPAN.
    car.counter--;result.trafficHeldSteps=total+1;result.trafficHoldStreak=streak+1;
    if(!result.firstTrafficHold)result.firstTrafficHold={step:result.activeSteps,reason,checkpoint:car.index};
    return true;
  }

  retireCar(car) {
    const result=this.resultFor(car);
    if(result.retireAt===undefined)result.retireAt=this.raceTicks+6;
    car.vel.x=0;car.vel.y=0;
  }

  dispose() {
    disposePopulation(this.vehicles, []); this.vehicles = []; this.entries = []; this.state = 'empty';
    this.results.clear();
    this.risks.clear();
    this.contactPairs.clear();
    this.scene.renderer.dispose();
  }
}
