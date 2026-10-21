// Raster rendering resources only. No p5.random/noise, entities or simulation state.
const RACING_ART = {sources:{}, tiles:new Map(), failed:[]};
const RACING_ART_FILES = Object.freeze({
  materials:'assets/mediterranean-materials-v2.png',
  scenery:'assets/mediterranean-scenery-v1.png',
  gt3:'assets/gt3-overhead-v1.png'
});
const RACING_ART_FRAMES = Object.freeze({
  asphalt:['materials',0,0,2,2], terrain:['materials',1,0,2,2],
  gravel:['materials',0,1,2,2], water:['materials',1,1,2,2],
  pine:['scenery',0,0,3,2], olive:['scenery',1,0,3,2], palm:['scenery',2,0,3,2],
  shrub:['scenery',0,1,3,2], limestone:['scenery',1,1,3,2], roof:['scenery',2,1,3,2],
  gt3:['gt3',0,0,1,1]
});
function preloadRacingArt() {
  for(const [key,url] of Object.entries(RACING_ART_FILES)) {
    loadImage(url,image=>{RACING_ART.sources[key]=image.canvas;},()=>{
      RACING_ART.failed.push(url);
      console.warn('Texture indisponible : '+url+' ; rendu de secours conservé.');
    });
  }
}
function racingArtRect(name,width,height) {
  const frame=RACING_ART_FRAMES[name];
  if(!frame)return null;
  const [,column,row,columns,rows]=frame;
  // Inset prevents filtering from bleeding an adjacent atlas cell into the stamp.
  return {x:Math.round(column*width/columns)+2,y:Math.round(row*height/rows)+2,
    width:Math.floor(width/columns)-4,height:Math.floor(height/rows)-4};
}
function racingArtTile(name) {
  if(RACING_ART.tiles.has(name))return RACING_ART.tiles.get(name);
  const frame=RACING_ART_FRAMES[name],source=frame&&RACING_ART.sources[frame[0]];
  if(!source)return null;
  const rect=racingArtRect(name,source.width,source.height);
  const tile=document.createElement('canvas');
  if(frame[0]!=='materials') {
    // Trim transparent atlas padding once, never per car/frame. Keep the alpha
    // edge and baked foliage shadows; no stretching of transparent cell margins.
    const crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;
    const c=crop.getContext('2d');c.drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
    const data=c.getImageData(0,0,crop.width,crop.height).data;
    let left=crop.width,top=crop.height,right=0,bottom=0;
    for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++)if(data[(y*crop.width+x)*4+3]>24){
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
    }
    if(left<=right){rect.x+=left;rect.y+=top;rect.width=right-left+1;rect.height=bottom-top+1;}
    tile.width=384;tile.height=Math.max(1,Math.round(384*rect.height/rect.width));
  } else tile.width=tile.height=name==='asphalt'||name==='gravel'?128:name==='terrain'?768:384;
  tile.getContext('2d').drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,tile.width,tile.height);
  if(frame[0]==='materials') {
    let material=tile;
    if(name==='terrain') {
      // A non-mirrored, irregular photographic mosaic first; the much larger
      // repeat then lies beyond most of the visible world, rather than every 384u.
      material=document.createElement('canvas');material.width=material.height=1024;
      const m=material.getContext('2d');m.fillStyle=m.createPattern(tile,'repeat');m.fillRect(0,0,1024,1024);
      const random=sceneryRandom(43191),patch=document.createElement('canvas');patch.width=patch.height=384;
      const p=patch.getContext('2d');
      for(let i=0;i<24;i++){
        p.clearRect(0,0,384,384);p.save();p.translate(192,192);p.rotate(random()*Math.PI*2);
        p.drawImage(tile,-272,-272,544,544);p.restore();
        const fade=p.createRadialGradient(192,192,145,192,192,192);fade.addColorStop(0,'#fff');fade.addColorStop(1,'#fff0');
        p.globalCompositeOperation='destination-in';p.fillStyle=fade;p.fillRect(0,0,384,384);p.globalCompositeOperation='source-over';
        m.drawImage(patch,random()*1150-200,random()*1150-200);
      }
    }
    // Reflected repeats meet at identical border texels even if the generated
    // source was not perfectly seamless. This is a one-time atlas preparation.
    const repeat=document.createElement('canvas');repeat.width=material.width*2;repeat.height=material.height*2;
    const c=repeat.getContext('2d');
    for(let row=0;row<2;row++)for(let col=0;col<2;col++){
      c.save();c.translate(col?repeat.width:0,row?repeat.height:0);c.scale(col?-1:1,row?-1:1);
      c.drawImage(material,0,0);c.restore();
    }
    RACING_ART.tiles.set(name,repeat);return repeat;
  }
  RACING_ART.tiles.set(name,tile);return tile;
}
const RACING_NATURE_VARIANTS=new Map();
function drawRacingNature(ctx,name,item) {
  const source=racingArtTile(name);if(!source)return false;
  const variant=Math.min(3,Math.floor(item.variant*4)),key=name+variant;
  if(!RACING_NATURE_VARIANTS.has(key)){
    const tile=document.createElement('canvas');tile.width=source.width;tile.height=source.height;
    const c=tile.getContext('2d');c.filter=`saturate(${.85+variant*.12}) brightness(${.88+variant*.075})`;
    c.drawImage(source,0,0);RACING_NATURE_VARIANTS.set(key,tile);
  }
  ctx.save();ctx.translate(item.x,item.y);ctx.rotate((item.variant-.5)*.42);
  ctx.drawImage(RACING_NATURE_VARIANTS.get(key),-item.radius*1.15,-item.radius*1.15,item.radius*2.3,item.radius*2.3);
  ctx.restore();return true;
}
function racingMaterial(ctx,name,fallback) {
  const tile=racingArtTile(name);
  return tile?ctx.createPattern(tile,'repeat'):fallback;
}
function drawRacingArt(ctx,name,x,y,w,h,angle=0) {
  const tile=racingArtTile(name);if(!tile)return false;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(tile,-w/2,-h/2,w,h);ctx.restore();return true;
}

// Same world-space material field for the central cache and its screen margins.
function paintMediterraneanBackdrop(ctx,bounds,shore,seed) {
  const {x,y,width,height}=bounds;
  ctx.save();ctx.fillStyle=racingMaterial(ctx,'terrain','#929568');ctx.fillRect(x,y,width,height);
  for(let gx=Math.floor(x/300)-1;gx<=Math.ceil((x+width)/300);gx++)for(let gy=Math.floor(y/300)-1;gy<=Math.ceil((y+height)/300);gy++) {
    const random=sceneryRandom(seed+Math.imul(gx,73856093)+Math.imul(gy,19349663));
    const px=gx*300+random()*150,py=gy*300+random()*150,r=130+random()*80;
    const g=ctx.createRadialGradient(px,py,0,px,py,r);
    const color=random()<.5?'113,130,61':'181,163,116';
    g.addColorStop(0,`rgba(${color},.23)`);g.addColorStop(1,`rgba(${color},0)`);
    ctx.fillStyle=g;ctx.fillRect(px-r,py-r,2*r,2*r);
  }
  if(shore.length) {
    const coast=[];for(let j=Math.floor(y/25)-1;j<=Math.ceil((y+height)/25)+1;j++)
      coast.push({x:shore[0].x+7*Math.sin(j*.8)+4*Math.sin(j*1.9),y:j*25});
    ctx.beginPath();ctx.moveTo(x-30,coast[0].y);for(const p of coast)ctx.lineTo(p.x,p.y);
    ctx.lineTo(x-30,coast.at(-1).y);ctx.closePath();ctx.fillStyle=racingMaterial(ctx,'water','#187b89');ctx.fill();
    ctx.beginPath();coast.forEach((p,i)=>i?ctx.lineTo(p.x+5,p.y):ctx.moveTo(p.x+5,p.y));
    ctx.strokeStyle=racingMaterial(ctx,'gravel','#d0c49f');ctx.lineWidth=12;ctx.stroke();
    ctx.beginPath();coast.forEach((p,i)=>i?ctx.lineTo(p.x-5,p.y):ctx.moveTo(p.x-5,p.y));
    ctx.strokeStyle='rgba(223,245,237,.35)';ctx.lineWidth=4;ctx.stroke();
    for(let j=Math.floor(y/50);j<Math.ceil((y+height)/50);j++){
      const random=sceneryRandom(seed+Math.imul(j,7669)),k=j*2,size=18+random()*18;
      drawRacingArt(ctx,'limestone',shore[0].x+7*Math.sin(k*.8)+4*Math.sin(k*1.9)+5,j*50+random()*18,size,size*.85,random()*.8);
    }
  }ctx.restore();
}
// The sea is allowed only in the vacant left margin, at least 40 units from
// every outer vertex. It never substitutes a different road or collision wall.
function mediterraneanShore(outer,height) {
  const width=Math.min(110,Math.min(...outer.map(p=>p.x))-55);
  if(width<24)return [];
  return Array.from({length:33},(_,i)=>({x:width+7*Math.sin(i*.8)+4*Math.sin(i*1.9),y:i*height/32}));
}
function drawMediterraneanCoast(ctx,shore,width,height) {
  if(!shore.length)return;
  ctx.save();ctx.beginPath();ctx.moveTo(0,0);
  for(const p of shore)ctx.lineTo(p.x,p.y);
  ctx.lineTo(0,height);ctx.closePath();ctx.fillStyle=racingMaterial(ctx,'water','#187b89');ctx.fill();
  ctx.clip();ctx.strokeStyle='rgba(217,245,232,.42)';ctx.lineWidth=8;
  ctx.beginPath();shore.forEach((p,i)=>i?ctx.lineTo(p.x-4,p.y):ctx.moveTo(p.x-4,p.y));ctx.stroke();ctx.restore();
  ctx.save();ctx.beginPath();shore.forEach((p,i)=>i?ctx.lineTo(p.x+8,p.y):ctx.moveTo(p.x+8,p.y));
  ctx.strokeStyle=racingMaterial(ctx,'gravel','#b7ac86');ctx.lineWidth=18;ctx.stroke();ctx.restore();
  for(let i=1;i<shore.length;i+=2)drawRacingArt(ctx,'limestone',shore[i].x+5,shore[i].y,27,27);
}
