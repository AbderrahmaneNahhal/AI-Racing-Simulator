// Race-only steering. These functions never move a vehicle or change its brain.
const RACE_INTERACTIONS = Object.freeze({radius:8, perception:100, separation:24, horizon:15,
  trafficConsecutive:60,trafficTotal:180});

function racePairRisk(a, b, horizon = RACE_INTERACTIONS.horizon, clearance = 20) {
  const x = b.pos.x - a.pos.x, y = b.pos.y - a.pos.y;
  const vx = b.vel.x - a.vel.x, vy = b.vel.y - a.vel.y;
  const speed2 = vx * vx + vy * vy;
  const time = speed2 ? Math.max(0, Math.min(horizon, -(x * vx + y * vy) / speed2)) : 0;
  const distance = Math.hypot(x, y), closest = Math.hypot(x + vx * time, y + vy * time);
  return {distance, closest, time, threat: distance <= RACE_INTERACTIONS.perception &&
    (distance <= RACE_INTERACTIONS.separation || time > 0 && closest <= clearance)};
}

function raceAvoidanceForce(car, neighbours) {
  const desired = createVector(0, 0);
  let threats = 0;
  for (const other of neighbours) {
    if (other.number === car.number) continue;
    const risk = racePairRisk(car, other);
    if (!risk.threat) continue;
    let direction;
    if (risk.distance <= RACE_INTERACTIONS.separation) {
      direction = p5.Vector.sub(car.pos, other.pos);
      if (direction.mag() === 0) direction = createVector(car.number < other.number ? -1 : 1, 0);
    } else {
      // Reciprocal right-hand avoidance; head-on drivers choose opposite world sides.
      direction = car.vel.mag() ? createVector(-car.vel.y, car.vel.x) : p5.Vector.sub(car.pos, other.pos);
    }
    direction.setMag(1 / Math.max(1, risk.distance));
    desired.add(direction); threats++;
  }
  if (!threats) return {force:createVector(0,0), threats:0};
  desired.setMag(car.maxspeed);
  return {force:p5.Vector.sub(desired, car.vel).limit(car.maxforce), threats};
}

function composeRaceForces(neuralForce, avoidance, maxforce) {
  if (!avoidance.threats) return neuralForce.copy();
  const neural=neuralForce.copy();
  if(avoidance.followDirection) {
    const direction=avoidance.followDirection,forward=neural.x*direction.x+neural.y*direction.y;
    // Keep neuronal cornering, but do not let positive throttle cancel following brakes.
    if(forward>0){neural.x-=direction.x*forward;neural.y-=direction.y*forward;}
  }
  return neural.mult(.35).add(avoidance.force).limit(maxforce);
}

function racePassingLaneClear(car, side, neighbours, walls) {
  const speed=car.vel.mag();if(speed<.1)return false;
  const fx=car.vel.x/speed,fy=car.vel.y/speed;
  // A tested free-space corridor, not a replacement driving trajectory.
  for(let i=0;i<=12;i++) {
    const forward=i/12*32,lateral=Math.min(1,forward/16)*22*side;
    const point={x:car.pos.x+fx*forward-fy*lateral,y:car.pos.y+fy*forward+fx*lateral};
    if(walls.some(wall=>scenerySegmentDistance(point,wall.a,wall.b)<11))return false;
    const t=forward/Math.max(1,speed);
    if(neighbours.some(other=>other.number!==car.number&&Math.hypot(
      point.x-other.pos.x-other.vel.x*t,point.y-other.pos.y-other.vel.y*t)<18))return false;
  }
  return true;
}

function raceTrafficSteering(car, neighbours, walls) {
  const avoidance=raceAvoidanceForce(car,neighbours),speed=car.vel.mag();
  // A safe stationary grid is not a pile-up. Do not let symmetric separation
  // choose the launch direction before the neural controller has even accelerated.
  if(speed<.1&&Number.isFinite(car.heading)&&neighbours.every(other=>other.vel.mag()<.1))
    return {force:createVector(0,0),threats:0,maneuver:'launch'};
  if(speed<.1)return {...avoidance,maneuver:avoidance.threats?'separate':'cruise'};
  const fx=car.vel.x/speed,fy=car.vel.y/speed;
  let leader=null,gap=Infinity;
  for(const other of neighbours) {
    if(other.number===car.number)continue;
    const dx=other.pos.x-car.pos.x,dy=other.pos.y-car.pos.y;
    const ahead=dx*fx+dy*fy,lateral=Math.abs(-dx*fy+dy*fx),otherSpeed=other.vel.mag();
    const aligned=otherSpeed<.1||(other.vel.x*fx+other.vel.y*fy)/otherSpeed>.7;
    if(aligned&&ahead>0&&ahead<60&&lateral<18&&ahead<gap){leader=other;gap=ahead;}
  }
  if(!leader)return {...avoidance,maneuver:avoidance.threats?'avoid':'cruise'};
  const leadSpeed=Math.max(0,leader.vel.x*fx+leader.vel.y*fy);
  if(gap>28&&speed>leadSpeed+.25)for(const side of [1,-1]) {
    if(!racePassingLaneClear(car,side,neighbours,walls))continue;
    const desired=createVector(fx*32-fy*22*side,fy*32+fx*22*side).setMag(car.maxspeed);
    return {force:p5.Vector.sub(desired,car.vel).limit(car.maxforce),threats:Math.max(1,avoidance.threats),maneuver:side===1?'pass-right':'pass-left'};
  }
  const safeSpeed=Math.max(0,Math.min(car.maxspeed,leadSpeed+(gap-26)/6));
  const desired=createVector(fx*safeSpeed,fy*safeSpeed);
  return {force:p5.Vector.sub(desired,car.vel).limit(car.maxforce),threats:Math.max(1,avoidance.threats),
    maneuver:'follow',followDirection:{x:fx,y:fy},leader:leader.number};
}

// Evidence for a traffic delay, rather than merely proximity or a weak network.
function raceTrafficDelay(car,neighbours,neural,force,avoidance,blocked) {
  if(blocked)return 'contact';
  if(avoidance.maneuver==='follow'&&neighbours.some(other=>other.number===avoidance.leader)) {
    const f=avoidance.followDirection;
    const intent=(car.vel.x+neural.x)*f.x+(car.vel.y+neural.y)*f.y;
    const actual=(car.vel.x+force.x)*f.x+(car.vel.y+force.y)*f.y;
    if(intent>.05&&intent-actual>.01)return 'braking';
  }
  if(car.vel.mag()>.5||neural.mag()<.02)return null;
  const heading=Number.isFinite(car.heading)?car.heading:Math.atan2(neural.y,neural.x);
  const fx=Math.cos(heading),fy=Math.sin(heading);
  if(neural.x*fx+neural.y*fy<=.02)return null;
  if(neighbours.some(other=>{
    if(other.number===car.number)return false;
    const dx=other.pos.x-car.pos.x,dy=other.pos.y-car.pos.y,ahead=dx*fx+dy*fy;
    return ahead>0&&ahead<=26&&Math.abs(-dx*fy+dy*fx)<16&&other.vel.mag()<=.5;
  }))return 'queue';
  return null;
}

function raceSafeTrafficForce(car,neural,avoidance,walls,forward) {
  let force=composeRaceForces(neural,avoidance,car.maxforce);
  const constrain=force=>{
    const result=force.copy();
    if(forward) {
      const backwards=(car.vel.x+result.x)*forward.x+(car.vel.y+result.y)*forward.y;
      if(backwards<0){result.x-=backwards*forward.x;result.y-=backwards*forward.y;}
      // Do not turn a rejected reverse decision into a purely sideways launch.
      // Keep the proposed forward speed, trim excessive lateral motion (±63°),
      // and never manufacture forward propulsion from a sideways/backward output.
      const ahead=Math.max(0,backwards),side=-(car.vel.x+result.x)*forward.y+(car.vel.y+result.y)*forward.x;
      const lateral=Math.max(-2*ahead,Math.min(2*ahead,side));
      result.x=forward.x*ahead-forward.y*lateral-car.vel.x;
      result.y=forward.y*ahead+forward.x*lateral-car.vel.y;
    }
    result.limit(car.maxforce);
    if(forward) {
      // Limiting the whole cone correction can undo its forward constraint.
      // Intersect the force disk with the admissible forward half-plane instead.
      // Feasible corrections retain maxForce and cancel reverse speed exactly.
      const minimum=-(car.vel.x*forward.x+car.vel.y*forward.y);
      const along=result.x*forward.x+result.y*forward.y;
      if(along<minimum&&minimum<=car.maxforce) {
        const side=-result.x*forward.y+result.y*forward.x;
        const room=Math.sqrt(Math.max(0,car.maxforce*car.maxforce-minimum*minimum));
        const lateral=Math.max(-room,Math.min(room,side));
        result.x=minimum*forward.x-lateral*forward.y;
        result.y=minimum*forward.y+lateral*forward.x;
      }
    }
    return result;
  };
  force=constrain(force);
  if(!avoidance.threats||!walls.length)return force;
  // Prediction only. Reject an interaction that reduces wall clearance below
  // the safety envelope compared with neural-only driving. Never move an entity.
  const clearance=force=>{
    const v=createVector(car.vel.x+force.x,car.vel.y+force.y).limit(car.maxspeed);
    let nearest=Infinity;
    for(let t=.5;t<=6;t+=.5){
      const point={x:car.pos.x+car.vel.x+v.x*t,y:car.pos.y+car.vel.y+v.y*t};
      for(const wall of walls)nearest=Math.min(nearest,scenerySegmentDistance(point,wall.a,wall.b));
    }
    return nearest;
  };
  const neuralOnly=constrain(neural),safe=clearance(force);
  if(safe<10&&clearance(neuralOnly)>safe+1e-9)return neuralOnly;
  return force;
}

// Continuous disk test over the EXACT next inherited position increment (pos += vel).
// Acceleration changes the following velocity, so it cannot avert this step's contact.
function raceSweptContact(a, b) {
  return racePairRisk(a, b, 1, RACE_INTERACTIONS.radius * 2).closest <= RACE_INTERACTIONS.radius * 2;
}

// Conservative continuous contact constraint, separate from steering. Vehicle.update
// integrates its CURRENT velocity, not the newly applied acceleration. Check these
// exact swept disks BEFORE that integration. Radius 8 encloses the complete 12.8x8
// sprite in every orientation (half diagonal < 8).
// Stopping one body can expose a rear-end collision with a third: recheck the whole
// batch until no further body is stopped. At most N bodies can be stopped, so this
// terminates in N+1 passes. Never edits positions or duplicates Vehicle locomotion.
function raceConstrainMotions(bodies) {
  const blocked = new Set(), contacts = new Set(), diameter = RACE_INTERACTIONS.radius * 2;
  for (let pass = 0; pass <= bodies.length; pass++) {
    let changed = false;
    for (let i=0;i<bodies.length;i++) for(let j=i+1;j<bodies.length;j++) {
      const a=bodies[i], b=bodies[j];
      const x=b.pos.x-a.pos.x, y=b.pos.y-a.pos.y;
      if(Math.hypot(x,y)<diameter-1e-7) throw new Error('Volumes de collision initialement superposés.');
      const av=blocked.has(a.number)||a.stationary?{x:0,y:0}:a.vel;
      const bv=blocked.has(b.number)||b.stationary?{x:0,y:0}:b.vel;
      const vx=bv.x-av.x,vy=bv.y-av.y,speed2=vx*vx+vy*vy;
      if(!speed2 || x*vx+y*vy>=0)continue; // resting/sliding/receding contact is legal
      const t=Math.max(0,Math.min(1,-(x*vx+y*vy)/speed2));
      if(Math.hypot(x+vx*t,y+vy*t)>diameter+1e-7)continue;
      contacts.add(`${Math.min(a.number,b.number)}:${Math.max(a.number,b.number)}`);
      for(const body of [a,b])if(!body.stationary&&!blocked.has(body.number)) {
        blocked.add(body.number);changed=true;
      }
    }
    if(!changed)break;
  }
  return {blocked,contacts};
}
