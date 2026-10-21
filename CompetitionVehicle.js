const COMPETITION_COLORS = ['#72a8e9','#e9b664','#b79bdc','#df7d89','#69bdac','#c8df73','#f3a477','#95d8ef'];
const COMPETITION_SPRITES = new Map();

class CompetitionVehicle extends RacingVehicle {
  constructor(entry, slot, number) {
    const document = validateBrainDocument(entry.document);
    const source = restoreRacingBrain(document);
    try { super(document.config, source, number - 1); }
    finally { source.dispose(); }
    this.number = number;
    this.name = entry.name;
    this.color = COMPETITION_COLORS[number - 1];
    // Explicit scene initialization only; motion is inherited after Start.
    this.pos.set(slot.x, slot.y);
    this.previousPos.set(this.pos);
    this.vel.set(0, 0); this.acc.set(0, 0);
    if(Number.isFinite(slot.heading)) {
      this.simultaneousHeading=slot.heading;
      this.contactHeading=slot.heading;
      this.rays.forEach(ray=>ray.rotate(slot.heading));
    }
  }

  mutate() { throw new Error('Mutation interdite en compétition.'); }
  calculateFitness() { throw new Error('Fitness génétique interdite en compétition.'); }

  look(trackWalls) {
    if(!Number.isFinite(this.simultaneousHeading))return withRaceSight(this.sight, () => super.look(trackWalls));
    const heading=this.drivingHeading();
    this.rays.forEach(ray=>ray.rotate(heading));
    // Vehicle.look uses vel.heading() even at rest. Scope the heading override to
    // this vector and this call; keep vel=(0,0), and restore even on NN exceptions.
    const own=Object.prototype.hasOwnProperty.call(this.vel,'heading'),original=this.vel.heading;
    try {
      this.vel.heading=()=>heading;
      return withRaceSight(this.sight, () => super.look(trackWalls));
    } finally {
      if(own)this.vel.heading=original;else delete this.vel.heading;
    }
  }

  drivingHeading() {
    return Math.hypot(this.vel.x,this.vel.y)>1e-9?Math.atan2(this.vel.y,this.vel.x):this.simultaneousHeading;
  }

  update() {
    if(!Number.isFinite(this.simultaneousHeading)){super.update();return;}
    this.simultaneousHeading=this.drivingHeading();
    super.update(); // exactly one inherited locomotion, no position correction
    this.simultaneousHeading=this.drivingHeading();
    this.contactHeading=this.simultaneousHeading;
    this.rays.forEach(ray=>ray.rotate(this.simultaneousHeading));
  }

  drawCar(_leader = false,ctx = drawingContext) { drawRacingMotion(ctx,this); this.paintCompetitionCar(ctx, this.pos.x, this.pos.y, 1, this.vel.mag()>.01?this.vel.heading():(this.contactHeading||0)); drawRacingMotion(ctx,this,true); }

  paintCompetitionCar(ctx, x, y, zoom, heading, visualScale = getCarVisualScale()) {
    if (!COMPETITION_SPRITES.has(this.number)) {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 160;
      const context = canvas.getContext('2d');
      // Eight bounded shared display assets, independent of neuronal resources.
      context.filter = `hue-rotate(${[0,0,0,0,0,65,-30,155][this.number - 1]}deg)`;
      context.drawImage(racingCarSprite(this.identity), 0, 0);
      const pixel = context.getImageData(118, 54, 1, 1).data;
      canvas.raceColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
      COMPETITION_SPRITES.set(this.number, canvas);
    }
    this.color = COMPETITION_SPRITES.get(this.number).raceColor;
    ctx.save(); ctx.translate(x, y); ctx.rotate(heading); ctx.scale(zoom*visualScale, zoom*visualScale);
    ctx.drawImage(COMPETITION_SPRITES.get(this.number), -6.4, -4, 12.8, 8);
    ctx.fillStyle = '#f2f5ef'; ctx.beginPath(); ctx.arc(-.2, 0, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#152434'; ctx.font = 'bold 1.8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(this.number), -.2, .05); ctx.restore();
  }

  preview(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#172839'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.paintCompetitionCar(ctx, 140, 72, 20, 0, 1);
    ctx.fillStyle = '#c3d4dd'; ctx.font = '11px system-ui'; ctx.fillText(`#${this.number} · ${this.name.slice(0, 30)}`, 12, 146);
  }
}
