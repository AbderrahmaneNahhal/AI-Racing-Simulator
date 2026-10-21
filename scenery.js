// Independent deterministic random stream: drawing never consumes p5.random/noise.
function sceneryRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function pointInSceneryPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function scenerySegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function sceneryClearance(point, inner, outer) {
  let distance = Infinity;
  for (const polygon of [inner, outer]) {
    polygon.forEach((a, i) => { distance = Math.min(distance,
      scenerySegmentDistance(point, a, polygon[(i + 1) % polygon.length])); });
  }
  return distance;
}
function sceneryIsSafe(item, inner, outer, margin = 12) {
  const onRoad = pointInSceneryPolygon(item, outer) && !pointInSceneryPolygon(item, inner);
  return !onRoad && sceneryClearance(item, inner, outer) > item.envelope + margin;
}
function createScenery(inner, outer, width, height, seed, count = 115) {
  const random = sceneryRandom(seed);
  const items = [];
  for (let i = 0; i < 3600 && items.length < count; i++) {
    const radius = 5 + random() * 12;
    const item = {x: random() * width, y: random() * height, radius,
      envelope: radius * 1.7, type: random() < .65 ? 'tree' : random() < .7 ? 'bush' : 'rock', variant: random()};
    if (Math.hypot(item.x - width / 2, item.y - height / 2) < 85) continue;
    if (item.x < item.envelope || item.y < item.envelope || item.x > width - item.envelope || item.y > height - item.envelope) continue;
    if (sceneryIsSafe(item, inner, outer) && items.every(p => Math.hypot(item.x - p.x, item.y - p.y) > (item.radius + p.radius) * .9)) items.push(item);
  }
  return items;
}

function sceneryPolygonPath(ctx, points) {
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
}
function drawNaturalScenery(ctx, items) {
  for (const item of items) {
    const {x, y, radius: r, type, variant} = item;
    if(typeof drawRacingArt==='function') {
      const sprite=type==='rock'?'limestone':type==='bush'?'shrub':variant<.15?'palm':variant<.53?'olive':'pine';
      if(typeof drawRacingNature==='function'&&drawRacingNature(ctx,sprite,item))continue;
      if(drawRacingArt(ctx,sprite,x,y,2.3*r,2.3*r))continue;
    }
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(46,59,26,.2)';
    ctx.beginPath(); ctx.ellipse(r * .32, r * .45, r * 1.04, r * .85, .3, 0, Math.PI * 2); ctx.fill();
    if (type === 'rock') {
      ctx.fillStyle = '#727d48'; ctx.beginPath();
      ctx.moveTo(-r*.7, r*.2); ctx.lineTo(-r*.4,-r*.4); ctx.lineTo(r*.4,-r*.55);
      ctx.lineTo(r*.75,r*.1); ctx.lineTo(r*.2,r*.6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#485332';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle = '#9a9f68'; ctx.beginPath();ctx.moveTo(-r*.4,-r*.4);ctx.lineTo(r*.4,-r*.55);ctx.lineTo(0,r*.1);ctx.closePath();ctx.fill();
    } else {
      // Faceted canopies viewed strictly from above, like the supplied illustration.
      // No perspective transform: sensors, picking and world coordinates stay aligned.
      const colors=type==='tree'?['#526327','#728437','#8b9b46']:['#617333','#849345','#a1ac5d'];
      ctx.beginPath();
      for(let k=0;k<12;k++) {
        const a=k*Math.PI/6+variant,rr=r*(k%2?.75:1);
        const px=Math.cos(a)*rr,py=Math.sin(a)*rr;
        if(k)ctx.lineTo(px,py);else ctx.moveTo(px,py);
      }
      ctx.closePath();ctx.fillStyle=colors[1];ctx.fill();
      ctx.strokeStyle='#465728';ctx.lineWidth=Math.max(.7,r*.09);ctx.lineJoin='round';ctx.stroke();
      ctx.fillStyle=colors[0];ctx.beginPath();ctx.ellipse(r*.32,r*.2,r*.4,r*.5,-.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=colors[2];ctx.beginPath();ctx.ellipse(-r*.24,-r*.3,r*.45,r*.36,-.5,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
}

// Facilities are paint in the static background, not simulated obstacles/entities.
function createCircuitFacilities(inner, outer, width, height, seed, nature = []) {
  const random=sceneryRandom(seed+1977),items=[];
  for(let i=0;i<500&&items.length<6;i++) {
    const type=i%3===0?'paddock':i%3===1?'grandstand':'service';
    const envelope=type==='paddock'?48:type==='grandstand'?40:29;
    const item={x:i===0?width/2-55:random()*width,y:i===0?height/2-15:random()*height,
      envelope,type,angle:Math.round(random()*3)*Math.PI/2};
    if(item.x<envelope+10||item.y<envelope+10||item.x>width-envelope-10||item.y>height-envelope-10)continue;
    if(sceneryIsSafe(item,inner,outer,18)&&nature.every(p=>Math.hypot(p.x-item.x,p.y-item.y)>p.envelope+envelope+5)&&
      items.every(p=>Math.hypot(p.x-item.x,p.y-item.y)>p.envelope+envelope+10))items.push(item);
  }
  return items;
}

function createCircuitRails(inner, outer, width, height) {
  const rails=[];
  for(const points of [inner,outer])for(let i=0;i<points.length;i++) {
    const side=points===outer?1:-1;
    const offset=p=>{const x=p.x-width/2,y=p.y-height/2,m=Math.hypot(x,y);
      return m?{x:p.x+x/m*25*side,y:p.y+y/m*25*side}:null;};
    const a=offset(points[i]),b=offset(points[(i+1)%points.length]);
    if(!a||!b)continue;
    const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/4));
    let safe=true;
    for(let j=0;j<=count&&safe;j++)safe=sceneryIsSafe({x:a.x+(b.x-a.x)*j/count,y:a.y+(b.y-a.y)*j/count,envelope:3},inner,outer,3);
    if(safe)rails.push({a,b});
  }
  return rails;
}

// Reserve safe building/parking footprints first so the vegetation cannot hide
// them. Both streams are deterministic and independent of the learning RNG.
function createCircuitScenery(inner, outer, width, height, seed) {
  const facilities=createCircuitFacilities(inner,outer,width,height,seed);
  const scenery=createScenery(inner,outer,width,height,seed,235).filter(tree=>
    facilities.every(p=>Math.hypot(tree.x-p.x,tree.y-p.y)>tree.envelope+p.envelope+5));
  return {facilities,scenery};
}

function drawCircuitFacilities(ctx, items) {
  for(const item of items) {
    ctx.save();ctx.translate(item.x,item.y);
    const w=item.type==='paddock'?72:item.type==='grandstand'?58:34;
    const h=item.type==='paddock'?34:item.type==='grandstand'?24:24;
    if(typeof racingArtTile==='function'&&racingArtTile('roof')&&item.type!=='grandstand') {
      // The service apron, paths and roof all stay inside the reserved envelope.
      ctx.rotate(item.angle);ctx.fillStyle=racingMaterial(ctx,'gravel','#b4a984');
      ctx.fillRect(-w/2-4,-h/2-4,w+8,h+8);
      ctx.fillStyle='rgba(34,30,22,.26)';ctx.fillRect(-w/2+3,-h/2+4,w,h);
      drawRacingArt(ctx,'roof',0,0,w,h);
      ctx.fillStyle=racingMaterial(ctx,'gravel','#b4a984');ctx.fillRect(-12,h/2+3,24,5);
      ctx.fillRect(-w/2+5,h/2+10,w-10,3); // Small service path inside the safe plot.
      const paddock=item.type==='paddock';
      ctx.fillStyle='#192024';ctx.fillRect(paddock?-30:-16,h/2+3,paddock?60:32,paddock?8:5);
      ctx.fillStyle='#ede5d2';ctx.font=`bold ${paddock?6:3}px system-ui`;ctx.textAlign='center';
      ctx.save();ctx.translate(0,h/2+(paddock?7:5.5));
      if(item.angle>Math.PI*.75)ctx.rotate(Math.PI);
      ctx.textBaseline='middle';ctx.fillText(paddock?'NICE CIRCUIT':'SERVICE',0,0);ctx.restore();
      ctx.restore();continue;
    }
    ctx.save();ctx.translate(4,6);ctx.rotate(item.angle);
    ctx.fillStyle='rgba(8,18,24,.28)';ctx.fillRect(-w/2,-h/2,w,h);ctx.restore();
    ctx.rotate(item.angle);
    ctx.fillStyle=typeof racingMaterial==='function'?racingMaterial(ctx,'asphalt','#273a39'):'#273a39';ctx.fillRect(-w/2,-h/2,w,h);
    if(item.type==='grandstand') {
      // Small service parking courts: dark asphalt and ivory individual bays.
      ctx.strokeStyle='#c9d2b1';ctx.lineWidth=.8;ctx.strokeRect(-w/2,-h/2,w,h);
      for(let bay=0;bay<5;bay++) {
        ctx.beginPath();ctx.roundRect(-w/2+4+bay*10,-h/2+4,6,12,1.4);ctx.stroke();
      }
    } else {
      const paddock=item.type==='paddock';
      ctx.fillStyle=paddock?'#b8222e':'#6650aa';ctx.fillRect(-w/2,-h/2,w,h);
      ctx.fillStyle=paddock?'#d52a32':'#7d65bc';ctx.beginPath();
      ctx.moveTo(-w/2,-h/2);ctx.lineTo(w/2,-h/2);ctx.lineTo(w/2-8,0);ctx.lineTo(-w/2+8,0);ctx.closePath();ctx.fill();
      ctx.fillStyle=paddock?'#9f202a':'#594596';ctx.beginPath();
      ctx.moveTo(w/2,-h/2);ctx.lineTo(w/2,h/2);ctx.lineTo(w/2-8,0);ctx.closePath();ctx.fill();
      ctx.strokeStyle=paddock?'#91232a':'#51448a';ctx.lineWidth=1;ctx.strokeRect(-w/2,-h/2,w,h);
    }
    ctx.restore();
  }
}
