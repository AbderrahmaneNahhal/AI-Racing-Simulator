// Display preference only: never read by perception, steering or locomotion.
const CAR_VISUAL_SCALE = 2;
function getCarVisualScale() { return CAR_VISUAL_SCALE; }

class RacingVehicle extends Vehicle {
  constructor(config, brain = null, identity = 0) {
    // Vehicle already calls brain.copy(): this factory avoids an unused default NN.
    super(brain || { copy: () => new RacingBrain(config) });
    this.config = { ...config };
    this.identity = identity;
    this.sight = config.sight;
    if (config.sensors !== this.rays.length) {
      this.rays = Array.from({ length: config.sensors }, (_, i) =>
        new Ray(this.pos, radians(-45 + i * 90 / config.sensors)));
    }
    this.sensorReadings = [];
    this.lastForce = null;
  }

  mutate() { this.brain.mutate(this.config.mutation); }

  look(trackWalls) {
    const force = super.look(trackWalls);
    // Capture the perception used for this decision, before inherited locomotion.
    this.sensorReadings = this.rays.map((ray, index) => {
      const distance = (1 - this.brain.lastInputs[index]) * this.sight;
      return { x: this.pos.x, y: this.pos.y,
        endX: this.pos.x + ray.dir.x * distance, endY: this.pos.y + ray.dir.y * distance };
    });
    this.lastForce = force.copy();
    return force;
  }

  show() { this.drawCar(false); }
  highlight() { this.drawHalo('#74f2ba', 8); }

  drawCar(leader,ctx = drawingContext) {
    drawRacingMotion(ctx,this);
    ctx.save(); ctx.translate(this.pos.x, this.pos.y); ctx.rotate(this.vel.heading());
    ctx.scale(getCarVisualScale(),getCarVisualScale());
    ctx.drawImage(racingCarSprite(this.identity), -6.4, -4, 12.8, 8);
    ctx.restore();
    drawRacingMotion(ctx,this,true);
    if (leader) this.highlight();
  }

  drawHalo(color, radius,ctx = drawingContext) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, radius, 0, Math.PI * 2); ctx.stroke();ctx.restore();
  }

  showSelection(ctx = drawingContext) { this.drawHalo('#b6dcff', Math.max(10,7.4*getCarVisualScale()),ctx); }

  showSensors(ctx = drawingContext) {
    ctx.save();ctx.strokeStyle='#74f2ba';ctx.lineWidth=1;
    for (const ray of this.sensorReadings) {ctx.beginPath();ctx.moveTo(ray.x,ray.y);ctx.lineTo(ray.endX,ray.endY);ctx.stroke();}
    if (this.lastForce) {
      ctx.strokeStyle='#ffc879';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(this.pos.x,this.pos.y);
      ctx.lineTo(this.pos.x+this.lastForce.x*100,this.pos.y+this.lastForce.y*100);ctx.stroke();
    }
    ctx.restore();
  }
}

// Five shared raster variants, with the previous drawing as offline fallback.
const RACING_CAR_SPRITES = new Map();
function racingCarSprite(identity) {
  const colors = ['#5ba9e5', '#e9bb46', '#9470ce', '#e35b62', '#51b89c'];
  const key = identity % colors.length;
  if (RACING_CAR_SPRITES.has(key)) return RACING_CAR_SPRITES.get(key);
  const canvas = document.createElement('canvas');canvas.width=256;canvas.height=160;
  const photo=typeof racingArtTile==='function'&&racingArtTile('gt3');
  if(photo) {
    const paint=canvas.getContext('2d');
    paint.filter=`hue-rotate(${[0,190,65,135,280][key]}deg)`;
    // Baked rim light improves contrast without a per-frame blur/filter.
    paint.shadowColor='rgba(231,242,255,.65)';paint.shadowBlur=3;
    // Same 10.8 x 5.6 visual footprint inside the existing 12.8 x 8 stamp.
    // Sprite nose +X, so the unchanged vel.heading() rotation is authoritative.
    paint.drawImage(photo,20,24,216,112);
    RACING_CAR_SPRITES.set(key,canvas);return canvas;
  }
  const c=canvas.getContext('2d');c.translate(128,80);c.scale(20,20);
  const rounded=(x,y,w,h,r)=>{c.beginPath();c.roundRect(x,y,w,h,r);};
  c.fillStyle='#10161b';
  for(const x of [-3,2.7])for(const y of [-3,2.15]){rounded(x-1,y,2,.85,.18);c.fill();
    c.fillStyle='#56616b';c.fillRect(x-.65,y+.12,1.3,.15);c.fillStyle='#10161b';}
  c.beginPath();c.moveTo(-4.9,-1.85);c.quadraticCurveTo(-4.9,-2.5,-3.9,-2.5);
  c.lineTo(3.5,-2.5);c.quadraticCurveTo(5,-2.35,5,-1.35);c.lineTo(5,1.35);
  c.quadraticCurveTo(5,2.35,3.5,2.5);c.lineTo(-3.9,2.5);c.quadraticCurveTo(-4.9,2.5,-4.9,1.85);c.closePath();
  const paint=c.createLinearGradient(0,-2.5,0,2.5);paint.addColorStop(0,'#dbe8ed');paint.addColorStop(.15,colors[key]);paint.addColorStop(.7,colors[key]);paint.addColorStop(1,'#314358');
  c.fillStyle=paint;c.fill();c.strokeStyle='rgba(4,16,28,.7)';c.lineWidth=.18;c.stroke();
  c.fillStyle='#20394c';rounded(-2.7,-1.95,4.9,3.9,.7);c.fill();
  const glass=c.createLinearGradient(-2,-2,2,2);glass.addColorStop(0,'#a2c8d2');glass.addColorStop(.45,'#436779');glass.addColorStop(1,'#172f43');
  c.fillStyle=glass;rounded(-2.5,-1.75,1.2,3.5,.3);c.fill();rounded(1,-1.75,1.1,3.5,.3);c.fill();
  c.fillStyle=colors[key];rounded(-1.3,-1.65,2.25,3.3,.35);c.fill();
  c.fillStyle='rgba(210,233,245,.65)';c.fillRect(-1,-1.75,1.7,.15);c.fillRect(-1,1.6,1.7,.12);
  c.fillStyle='#b2d2da';c.fillRect(-1,-2.13,1.7,.25);c.fillRect(-1,1.88,1.7,.25);
  c.fillStyle=colors[key];rounded(1.4,-2.85,.7,.55,.2);c.fill();rounded(1.4,2.3,.7,.55,.2);c.fill();
  c.strokeStyle='rgba(7,29,42,.4)';c.lineWidth=.08;
  for(const y of [-1.65,1.65]){c.beginPath();c.moveTo(2.3,y);c.lineTo(4.4,y*.7);c.stroke();}
  c.fillStyle='#f4eccc';rounded(4.45,-1.85,.38,1,.12);c.fill();rounded(4.45,.85,.38,1,.12);c.fill();
  c.fillStyle='#e24650';c.fillRect(-4.8,-1.95,.35,.9);c.fillRect(-4.8,1.05,.35,.9);
  c.fillStyle='#111f2a';rounded(4.6,-.65,.28,1.3,.1);c.fill();c.fillRect(-4.7,-.7,.2,1.4);
  c.strokeStyle='rgba(238,247,248,.5)';c.lineWidth=.07;c.beginPath();c.moveTo(-4,-2.3);c.lineTo(3,-2.3);c.stroke();
  c.fillStyle='rgba(247,244,222,.88)';c.fillRect(2.3,-.72,1.8,.22);c.fillRect(2.3,.5,1.8,.22);
  // GT detailing remains baked into the shared sprite, never rebuilt per frame.
  c.fillStyle='#12222b';rounded(-5.15,-2.25,.4,4.5,.12);c.fill();
  c.fillStyle='#344851';c.fillRect(-4.55,-1.4,.22,2.8);
  c.fillStyle='rgba(237,244,230,.85)';c.fillRect(2.2,-.35,2.15,.24);c.fillRect(2.2,.1,2.15,.24);
  c.fillStyle='rgba(10,30,39,.55)';
  for(let x=2.5;x<3.8;x+=.22){c.fillRect(x,-1.25,.1,.52);c.fillRect(x,.73,.1,.52);}
  c.strokeStyle='rgba(223,241,243,.55)';c.lineWidth=.06;
  c.beginPath();c.moveTo(1.12,-1.6);c.lineTo(1.85,1.6);c.stroke();
  c.fillStyle='rgba(4,19,31,.5)';c.fillRect(-2.5,-1.4,.1,2.8);
  c.fillStyle='#b4c8cc';c.fillRect(-.8,-2.02,.5,.08);c.fillRect(-.8,1.94,.5,.08);
  c.fillStyle='#e1f7ed';c.fillRect(4.7,-1.7,.15,.7);c.fillRect(4.7,1,.15,.7);
  RACING_CAR_SPRITES.set(key,canvas);return canvas;
}

// Read-only cosmetic effects. No particles, timers, history buffers or inference.
function drawRacingMotion(ctx, car, overlay = false) {
  const speed=Math.hypot(car.vel.x,car.vel.y),heading=speed>.01?car.vel.heading():(car.contactHeading||0);
  if(!overlay){ctx.save();ctx.translate(car.pos.x+.6,car.pos.y+.9);ctx.rotate(heading);
    ctx.scale(getCarVisualScale(),getCarVisualScale());
    ctx.fillStyle='rgba(5,15,20,.35)';ctx.beginPath();ctx.roundRect(-5.1,-2.7,10.2,5.4,.8);ctx.fill();ctx.restore();}
  if(speed<.1)return;
  const braking=car.lastForce&&(car.lastForce.x*car.vel.x+car.lastForce.y*car.vel.y)<-.025;
  if(!overlay&&braking&&car.previousPos&&Math.hypot(car.pos.x-car.previousPos.x,car.pos.y-car.previousPos.y)<=car.maxspeed+1) {
    const nx=-car.vel.y/speed*2,ny=car.vel.x/speed*2;
    ctx.save();ctx.strokeStyle='rgba(5,12,17,.26)';ctx.lineWidth=.65;
    for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(car.previousPos.x+nx*side,car.previousPos.y+ny*side);ctx.lineTo(car.pos.x+nx*side,car.pos.y+ny*side);ctx.stroke();}ctx.restore();
  }
  ctx.save();ctx.translate(car.pos.x,car.pos.y);ctx.rotate(heading);
  ctx.scale(getCarVisualScale(),getCarVisualScale());
  if(!overlay&&speed>3){ctx.strokeStyle='rgba(207,232,230,.16)';ctx.lineWidth=.3;
    for(const y of [-2.6,2.6]){ctx.beginPath();ctx.moveTo(-6,y);ctx.lineTo(-6-speed*.65,y);ctx.stroke();}}
  if(overlay){ctx.fillStyle='#ff6367';
    if(braking){ctx.fillRect(-4.9,-1.95,.4,.9);ctx.fillRect(-4.9,1.05,.4,.9);}
    ctx.fillStyle='rgba(192,212,209,.45)';
    const phase=(car.counter%3)*.18;
    for(const x of [-3,2.7])for(const y of [-2.8,2.6])ctx.fillRect(x-.4+phase,y,.35,.16);}
  ctx.restore();
}

function drawRacingCarPreview(canvas, vehicle) {
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const bg=ctx.createLinearGradient(0,0,canvas.width,canvas.height);bg.addColorStop(0,'#1d3042');bg.addColorStop(1,'#101c29');
  ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#2a4256';ctx.lineWidth=1;
  for(let x=0;x<canvas.width;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
  if(vehicle)ctx.drawImage(racingCarSprite(vehicle.identity),12,-8,256,160);
  ctx.fillStyle='#91adbf';ctx.font='10px system-ui';ctx.fillText(vehicle?'VUE RAPPROCHÉE · ÉCHELLE ×20':'AUCUNE VOITURE ACTIVE',12,canvas.height-12);
}
