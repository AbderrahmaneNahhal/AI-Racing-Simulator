// Start poses only: no vehicle contacts or corrective forces are implemented here.
function raceGridPointIsSafe(point, inner, outer, clearance = 9) {
  return pointInSceneryPolygon(point, outer) && !pointInSceneryPolygon(point, inner) &&
    sceneryClearance(point, inner, outer) >= clearance;
}

function createRaceGrid(inner, outer, count) {
  if (!Number.isInteger(count) || count < 2 || count > 8) throw new Error('Une course exige 2 à 8 concurrents.');
  if (inner.length !== outer.length || inner.length < 3) throw new Error('Circuit invalide pour la grille.');
  const slots = [];
  // Prefer the approach to the start, then the short section before checkpoint 1.
  // All entrants initially target checkpoint 1, with zero credited progress.
  const sections = [inner.length - 1, 0, inner.length - 2];
  for (const section of sections) {
    const next = (section + 1) % inner.length;
    const a = {x: (inner[section].x + outer[section].x) / 2, y: (inner[section].y + outer[section].y) / 2};
    const b = {x: (inner[next].x + outer[next].x) / 2, y: (inner[next].y + outer[next].y) / 2};
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const rows = Math.max(2, Math.ceil(length / 6));
    for (let row = 0; row <= rows; row++) {
      const u = section === 0 ? .12 + row / rows * .7 : .88 - row / rows * .76;
      const left = {x: inner[section].x + (inner[next].x - inner[section].x) * u,
        y: inner[section].y + (inner[next].y - inner[section].y) * u};
      const right = {x: outer[section].x + (outer[next].x - outer[section].x) * u,
        y: outer[section].y + (outer[next].y - outer[section].y) * u};
      const width = Math.hypot(right.x - left.x, right.y - left.y);
      // Physical spacing in world units, rather than a fixed number of columns.
      const offsets = [0, -18, 18, -36, 36, -54, 54];
      for (const offset of offsets) {
        const v = .5 + offset / width;
        if (v <= 0 || v >= 1) continue;
        const point = {x: left.x + (right.x - left.x) * v, y: left.y + (right.y - left.y) * v};
        if (raceGridPointIsSafe(point, inner, outer) &&
            slots.every(slot => Math.hypot(slot.x - point.x, slot.y - point.y) >= 18)) {
          // Increasing checkpoint indices define the real forward direction.
          const dx=(inner[next].x-inner[section].x)*(1-v)+(outer[next].x-outer[section].x)*v;
          const dy=(inner[next].y-inner[section].y)*(1-v)+(outer[next].y-outer[section].y)*v;
          slots.push({...point,heading:Math.atan2(dy,dx),section});
          if (slots.length === count) return slots;
        }
      }
    }
  }
  throw new Error('Pas assez de place pour cette grille sur le circuit choisi.');
}

// Local forward half-plane only, not a target or a replacement driving path.
function raceTrackForward(point,inner,outer,checkpointNormal=false) {
  let distance=Infinity,forward=null;
  for(let i=0;i<inner.length;i++) {
    const j=(i+1)%inner.length;
    const a={x:(inner[i].x+outer[i].x)/2,y:(inner[i].y+outer[i].y)/2};
    const b={x:(inner[j].x+outer[j].x)/2,y:(inner[j].y+outer[j].y)/2};
    // Wide inside lanes can be nearer to an unrelated centreline segment.
    // Prefer the actual road cell containing the point, then its lane tangent.
    if(pointInSceneryPolygon(point,[inner[i],outer[i],outer[j],inner[j]])) {
      const dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
      const u=length2?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length2)):0;
      const left={x:inner[i].x+(inner[j].x-inner[i].x)*u,y:inner[i].y+(inner[j].y-inner[i].y)*u};
      const rx=outer[i].x+(outer[j].x-outer[i].x)*u-left.x,ry=outer[i].y+(outer[j].y-outer[i].y)*u-left.y;
      const v=Math.max(0,Math.min(1,((point.x-left.x)*rx+(point.y-left.y)*ry)/(rx*rx+ry*ry)));
      const tx=(inner[j].x-inner[i].x)*(1-v)+(outer[j].x-outer[i].x)*v;
      const ty=(inner[j].y-inner[i].y)*(1-v)+(outer[j].y-outer[i].y)*v,m=Math.hypot(tx,ty);
      if(m) {
        if(checkpointNormal) {
          const width=Math.hypot(rx,ry),sign=(-ry*tx+rx*ty)>=0?1:-1;
          return {x:-ry/width*sign,y:rx/width*sign};
        }
        return {x:tx/m,y:ty/m};
      }
    }
    const d=scenerySegmentDistance(point,a,b),length=Math.hypot(b.x-a.x,b.y-a.y);
    if(length&&d<distance){
      distance=d;forward={x:(b.x-a.x)/length,y:(b.y-a.y)/length};
      if(checkpointNormal) {
        const rx=outer[i].x-inner[i].x,ry=outer[i].y-inner[i].y,m=Math.hypot(rx,ry);
        const sign=(-ry*forward.x+rx*forward.y)>=0?1:-1;
        forward={x:-ry/m*sign,y:rx/m*sign};
      }
    }
  }
  return forward;
}
