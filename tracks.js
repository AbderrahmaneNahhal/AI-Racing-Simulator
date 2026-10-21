let customRacingTrack = null;
const RACING_TRACKS = Object.freeze(Object.defineProperty({
  easy: { label: 'Facile', seed: 124, noiseMax: 1.5, pathWidth: 72, minRadius: 170 },
  medium: { label: 'Moyen', seed: 428, noiseMax: 4, pathWidth: 60, minRadius: 100 },
  hard: { label: 'Difficile', seed: 739, noiseMax: 6, pathWidth: 40, minRadius: 100 }
}, 'custom', {get:()=>customRacingTrack,enumerable:false}));

// All rendered edges and raycasting walls are built from these same vertices.
function trackGeometry(id, canvasWidth, canvasHeight, sampleNoise) {
  const preset = RACING_TRACKS[id];
  if (!preset) throw new Error('Circuit inconnu.');
  if(preset.geometry)return {inside:preset.geometry.inside.map(p=>({...p})),outside:preset.geometry.outside.map(p=>({...p}))};
  return geometryFromParameters(preset,canvasWidth,canvasHeight,sampleNoise);
}

function geometryFromParameters(preset,canvasWidth,canvasHeight,sampleNoise) {
  const inside = [], outside = [];
  const startX = preset.seed * .71, startY = preset.seed * .37;
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2;
    const xoff = (Math.cos(a) + 1) / 2 * preset.noiseMax + startX;
    const yoff = (Math.sin(a) + 1) / 2 * preset.noiseMax + startY;
    const sample = sampleNoise(xoff, yoff);
    const xr = preset.minRadius + sample * (canvasWidth / 2 - preset.minRadius);
    const yr = preset.minRadius + sample * (canvasHeight / 2 - preset.minRadius);
    inside.push({x: canvasWidth / 2 + (xr - preset.pathWidth) * Math.cos(a),
      y: canvasHeight / 2 + (yr - preset.pathWidth) * Math.sin(a)});
    outside.push({x: canvasWidth / 2 + (xr + preset.pathWidth) * Math.cos(a),
      y: canvasHeight / 2 + (yr + preset.pathWidth) * Math.sin(a)});
  }
  return { inside, outside };
}

class TrackRenderer {
  constructor(inner, outer, canvasWidth, canvasHeight, seed = 428) {
    this.padding=256; // Cached world beyond the unchanged simulation canvas.
    this.layer = createGraphics(canvasWidth+this.padding*2, canvasHeight+this.padding*2);
    // A single 2x backing store keeps asphalt/foliage readable when zoomed.
    this.layer.pixelDensity(2);
    Object.assign(this,createCircuitScenery(inner,outer,canvasWidth,canvasHeight,seed));
    this.rails = createCircuitRails(inner,outer,canvasWidth,canvasHeight);
    const ctx = this.layer.drawingContext;
    ctx.translate(this.padding,this.padding);ctx.lineCap='butt';
    const random = sceneryRandom(seed + 9001);
    const polygon = (points) => { ctx.beginPath(); sceneryPolygonPath(ctx, points); };
    const textured=typeof racingArtTile==='function';
    this.shore=textured?mediterraneanShore(outer,canvasHeight):[];
    this.seed=seed;
    this.paintBackdrop(ctx,{x:-this.padding,y:-this.padding,width:canvasWidth+2*this.padding,height:canvasHeight+2*this.padding});
    const shifted=points=>points.map(p=>({x:p.x+this.padding,y:p.y+this.padding}));
    const extensions=createScenery(shifted(inner),shifted(outer),canvasWidth+2*this.padding,canvasHeight+2*this.padding,seed+77,220)
      .map(p=>({...p,x:p.x-this.padding,y:p.y-this.padding}))
      .filter(p=>p.x<0||p.x>canvasWidth||p.y<0||p.y>canvasHeight);
    this.scenery.push(...extensions);
    const coastLimit=this.shore.length?Math.max(...this.shore.map(p=>p.x))+22:-Infinity;
    this.scenery=this.scenery.filter(p=>p.x-p.envelope>coastLimit);
    this.facilities=this.facilities.filter(p=>p.x-p.envelope>coastLimit);
    // Runoff is decorative and sits behind the exact road polygons.
    for (const points of [inner, outer]) {
      polygon(points); ctx.strokeStyle=textured?racingMaterial(ctx,'gravel','#c8b88c'):'#e6dcc3';ctx.lineWidth=15;ctx.lineJoin='round';ctx.stroke();
      ctx.strokeStyle='#526335';ctx.lineWidth=15;ctx.globalAlpha=.12;ctx.stroke();ctx.globalAlpha=1;
    }
    ctx.save(); ctx.beginPath(); sceneryPolygonPath(ctx, outer); sceneryPolygonPath(ctx, inner);
    ctx.clip('evenodd');
    const asphalt=ctx.createLinearGradient(0,0,canvasWidth,canvasHeight);
    asphalt.addColorStop(0,'#303d3f');asphalt.addColorStop(.5,'#2d393b');asphalt.addColorStop(1,'#344143');
    ctx.fillStyle=textured?racingMaterial(ctx,'asphalt',asphalt):asphalt;ctx.fillRect(0,0,canvasWidth,canvasHeight);
    if(textured){ctx.fillStyle='rgba(35,39,42,.62)';ctx.fillRect(0,0,canvasWidth,canvasHeight);}
    for (let i=0;i<4000;i++) {
      ctx.fillStyle=i%2?'rgba(211,219,219,.035)':'rgba(0,0,0,.055)';
      ctx.fillRect(random()*canvasWidth,random()*canvasHeight,.5+random(),.5+random());
    }
    // Subtle tarmac edge shading, clipped so grass never becomes asphalt.
    for (const points of [inner,outer]) { polygon(points);ctx.strokeStyle='rgba(0,0,0,.16)';ctx.lineWidth=10;ctx.stroke(); }
    // Rubber laid into the asphalt, clipped to the exact drivable polygon.
    for(let i=2;i<inner.length-2;i+=3) {
      const center=k=>({x:(inner[k].x+outer[k].x)/2,y:(inner[k].y+outer[k].y)/2});
      const a=center(i-1),b=center(i),c=center(i+1);
      const turn=Math.abs(Math.atan2((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x),(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)));
      if(turn<.22)continue;
      for(const offset of [-3,3]){ctx.beginPath();ctx.moveTo(a.x+offset,a.y);
        ctx.quadraticCurveTo(b.x+offset,b.y,c.x+offset,c.y);ctx.lineWidth=1.1;
        ctx.strokeStyle='rgba(8,10,12,.24)';ctx.stroke();}
    }
    for(let i=0;i<100;i++) {
      const x=random()*canvasWidth,y=random()*canvasHeight;
      ctx.strokeStyle='rgba(186,191,186,.04)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+20+random()*50,y+random()*3);ctx.stroke();
    }
    ctx.restore();
    for (const points of [inner,outer]) {
      polygon(points);ctx.strokeStyle='rgba(9,15,19,.4)';ctx.lineWidth=10;ctx.stroke();
      polygon(points);ctx.strokeStyle='#faf1d9';ctx.lineWidth=2;ctx.stroke();
      for (let i=0;i<points.length;i++) {
        const a=points[i],b=points[(i+1)%points.length];
        const prev=points[(i+points.length-1)%points.length];
        const turn=Math.abs(Math.atan2((a.x-prev.x)*(b.y-a.y)-(a.y-prev.y)*(b.x-a.x),
          (a.x-prev.x)*(b.x-a.x)+(a.y-prev.y)*(b.y-a.y)));
        if(turn<.085)continue; // Kerbs accent bends; straights retain a clean white edge.
        const segments=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/9));
        ctx.lineWidth=7;
        for(let k=0;k<segments;k++) {
          ctx.strokeStyle=(k+i)%2?'#faf4df':'#be3037';ctx.beginPath();
          ctx.moveTo(a.x+(b.x-a.x)*k/segments,a.y+(b.y-a.y)*k/segments);
          ctx.lineTo(a.x+(b.x-a.x)*(k+1)/segments,a.y+(b.y-a.y)*(k+1)/segments);ctx.stroke();
        }
      }
      // Raised kerb glint follows the identical vertices; no smoothing of walls.
      polygon(points);ctx.strokeStyle='rgba(255,249,225,.5)';ctx.lineWidth=.65;ctx.stroke();
    }
    // Narrow continuous edge markings sit inside the unchanged raycasting walls.
    for(const t of [.055,.945]) {
      ctx.beginPath();inner.forEach((p,i)=>{const x=p.x+(outer[i].x-p.x)*t,y=p.y+(outer[i].y-p.y)*t;
        if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();
      ctx.strokeStyle='rgba(248,245,225,.85)';ctx.lineWidth=1;ctx.stroke();
    }
    ctx.strokeStyle='rgba(243,241,221,.46)';ctx.lineWidth=1;ctx.setLineDash([7,13]);
    ctx.beginPath();
    inner.forEach((p,i)=>{const x=(p.x+outer[i].x)/2,y=(p.y+outer[i].y)/2;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
    ctx.closePath();ctx.stroke();ctx.setLineDash([]);
    const a=inner[0],b=outer[0],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    const nx=-dy/len,ny=dx/len;
    for(let row=0;row<2;row++) for(let i=0;i<24;i++) {
      ctx.beginPath();ctx.moveTo(a.x+dx*i/24+nx*(row-1)*3,a.y+dy*i/24+ny*(row-1)*3);
      ctx.lineTo(a.x+dx*(i+1)/24+nx*(row-1)*3,a.y+dy*(i+1)/24+ny*(row-1)*3);
      ctx.lineTo(a.x+dx*(i+1)/24+nx*row*3,a.y+dy*(i+1)/24+ny*row*3);
      ctx.lineTo(a.x+dx*i/24+nx*row*3,a.y+dy*i/24+ny*row*3);ctx.closePath();
      ctx.fillStyle=(row+i)%2?'#ecece2':'#172129';ctx.fill();
    }
    drawNaturalScenery(ctx,this.scenery);
    drawCircuitFacilities(ctx,this.facilities);
    // Guardrails are decorative; every painted sample must stay outside the road.
    for(const [index,rail] of this.rails.entries()) {
      const p=rail.a,q=rail.b;
      ctx.strokeStyle='rgba(6,17,21,.3)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(p.x+2,p.y+3);ctx.lineTo(q.x+2,q.y+3);ctx.stroke();
      ctx.strokeStyle='#5b654e';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
      ctx.strokeStyle='#dddcc5';ctx.lineWidth=.7;ctx.stroke();
      if(index%5===0) {
        const length=Math.hypot(q.x-p.x,q.y-p.y),count=Math.floor(length/5);
        for(let j=0;j<count;j++){
          const t=(j+.5)/count,x=p.x+(q.x-p.x)*t,y=p.y+(q.y-p.y)*t;
          ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fillStyle=j%3?'#22282a':'#cfcac0';ctx.fill();
          ctx.beginPath();ctx.arc(x,y,.9,0,Math.PI*2);ctx.fillStyle='#141a1e';ctx.fill();
        }
      }
    }
    // Direction boards are paint in the cached background, never simulated obstacles.
    for(let i=6;i<outer.length;i+=15) {
      const p=outer[i], vx=p.x-canvasWidth/2,vy=p.y-canvasHeight/2,m=Math.hypot(vx,vy);
      const sign={x:p.x+vx/m*34,y:p.y+vy/m*34,envelope:12};
      if(!sceneryIsSafe(sign,inner,outer,2))continue;
      ctx.fillStyle='#142e27';ctx.fillRect(sign.x-10,sign.y-6,20,12);
      ctx.strokeStyle='#e9d394';ctx.lineWidth=2;ctx.beginPath();
      for(let k=-5;k<=3;k+=7){ctx.moveTo(sign.x+k-2,sign.y-3);ctx.lineTo(sign.x+k+2,sign.y);ctx.lineTo(sign.x+k-2,sign.y+3);}ctx.stroke();
    }
    const logo={x:canvasWidth/2,y:canvasHeight/2,envelope:85};
    if(sceneryIsSafe(logo,inner,outer)&&this.facilities.every(p=>Math.hypot(p.x-logo.x,p.y-logo.y)>p.envelope+85)) {
      ctx.textAlign='center';ctx.fillStyle='rgba(42,62,39,.6)';ctx.font='600 13px system-ui';
      ctx.fillText('NICE CIRCUIT',canvasWidth/2,canvasHeight/2-6);
      ctx.fillStyle='rgba(42,62,39,.5)';ctx.font='9px system-ui';
      ctx.fillText('PERCEVOIR · DÉCIDER · ÉVOLUER',canvasWidth/2,canvasHeight/2+12);
    }
  }
  paintBackdrop(ctx,bounds) {
    if(typeof paintMediterraneanBackdrop==='function')paintMediterraneanBackdrop(ctx,bounds,this.shore,this.seed);
    else {ctx.fillStyle='#929568';ctx.fillRect(bounds.x,bounds.y,bounds.width,bounds.height);}
  }
  show() { image(this.layer, -this.padding, -this.padding); }
  dispose() { this.layer.remove(); }
}
