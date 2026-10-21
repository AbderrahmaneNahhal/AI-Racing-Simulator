// A parametric generator + exact vertex interchange, not a graphical road editor.
function validateTrackParameters(value) {
  if(!value||!Number.isInteger(value.seed)||value.seed<1||value.seed>2147483647||
    !Number.isFinite(value.noiseMax)||value.noiseMax<1||value.noiseMax>6||
    !Number.isFinite(value.pathWidth)||value.pathWidth<40||value.pathWidth>80||
    !Number.isFinite(value.minRadius)||value.minRadius<100||value.minRadius>200)throw new Error('Circuit : graine entière positive, complexité 1–6, demi-largeur 40–80, rayon 100–200.');
  return {seed:value.seed,noiseMax:value.noiseMax,pathWidth:value.pathWidth,minRadius:value.minRadius};
}
function trackSegmentsIntersect(a,b,c,d) {
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);
  if(p*q<0&&r*s<0)return true;
  const on=(a,b,c)=>Math.abs(cross(a,b,c))<1e-8&&c.x>=Math.min(a.x,b.x)-1e-8&&c.x<=Math.max(a.x,b.x)+1e-8&&c.y>=Math.min(a.y,b.y)-1e-8&&c.y<=Math.max(a.y,b.y)+1e-8;
  return on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
function validateTrackDocument(value) {
  if(!value||value.format!=='ai-racing-track'||value.version!==1||value.width!==1200||value.height!==800||value.checkpointCount!==60)
    throw new Error('Circuit JSON incompatible : format ai-racing-track v1, monde 1200×800, 60 checkpoints.');
  const parameters=validateTrackParameters(value.parameters);
  const geometry={};
  for(const key of ['inside','outside']) {
    const points=value.geometry&&value.geometry[key];
    if(!Array.isArray(points)||points.length!==60)throw new Error('Circuit : 60 sommets requis pour chaque bordure.');
    geometry[key]=points.map(p=>{
      if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<4||p.x>1196||p.y<4||p.y>796)throw new Error('Circuit : sommet invalide ou hors du monde.');
      return {x:p.x,y:p.y};
    });
    let area=0;
    for(let i=0;i<60;i++) {
      const a=geometry[key][i],b=geometry[key][(i+1)%60];area+=a.x*b.y-b.x*a.y;
      if(Math.hypot(b.x-a.x,b.y-a.y)<1)throw new Error('Circuit : segment trop court.');
      for(let j=i+1;j<60;j++)if(j!==i+1&&!(i===0&&j===59)&&trackSegmentsIntersect(a,b,points[j],points[(j+1)%60]))
        throw new Error('Circuit : bordure auto-intersectée.');
    }
    if(area<=0)throw new Error('Circuit : ordre des sommets inversé ou aire nulle.');
  }
  const inner=geometry.inside,outer=geometry.outside;
  for(let i=0;i<60;i++) {
    if(!pointInSceneryPolygon(inner[i],outer))throw new Error('Circuit : bordure intérieure hors de la bordure extérieure.');
    if(Math.hypot(inner[i].x-outer[i].x,inner[i].y-outer[i].y)<30)throw new Error('Circuit : checkpoint trop étroit.');
    for(let j=0;j<60;j++) {
      if(trackSegmentsIntersect(inner[i],inner[(i+1)%60],outer[j],outer[(j+1)%60]))throw new Error('Circuit : bordures croisées.');
      if(j>i&&trackSegmentsIntersect(inner[i],outer[i],inner[j],outer[j]))throw new Error('Circuit : checkpoints croisés.');
    }
    for(const t of [.1,.5,.9]) {
      const p={x:inner[i].x*(1-t)+outer[i].x*t,y:inner[i].y*(1-t)+outer[i].y*t};
      if(!pointInSceneryPolygon(p,outer)||pointInSceneryPolygon(p,inner))throw new Error('Circuit : checkpoint hors de la chaussée.');
    }
  }
  const name=typeof value.name==='string'?value.name.trim().slice(0,80):'';
  if(!name)throw new Error('Circuit : nom manquant.');
  return {format:'ai-racing-track',version:1,name,width:1200,height:800,checkpointCount:60,parameters,geometry};
}
function registerCustomTrack(document) {
  const value=validateTrackDocument(document);
  customRacingTrack={...value.parameters,label:value.name,geometry:value.geometry,document:value};
  return value;
}
function generateTrackDocument(parameters,name,sampleNoise) {
  const settings=validateTrackParameters(parameters);
  return validateTrackDocument({format:'ai-racing-track',version:1,name,width:1200,height:800,checkpointCount:60,
    parameters:settings,geometry:geometryFromParameters(settings,1200,800,sampleNoise)});
}
function currentTrackDocument() {
  return validateTrackDocument({format:'ai-racing-track',version:1,name:RACING_TRACKS[currentTrack].label,width:1200,height:800,
    checkpointCount:checkpoints.length,parameters:RACING_TRACKS[currentTrack],geometry:{inside,outside}});
}
function refreshCustomTrackOptions() {
  for(const id of ['track-select','race-track']) {
    const select=document.getElementById(id);let option=select.querySelector('option[value=custom]');
    if(customRacingTrack){if(!option){option=document.createElement('option');option.value='custom';select.appendChild(option);}option.textContent='Personnel · '+customRacingTrack.label;}
  }
}
function useTrackDocument(value) {
  if(mode==='race')throw new Error('Revenez en Training avant de remplacer le circuit personnel.');
  const validated=registerCustomTrack(value);refreshCustomTrackOptions();changeTrack('custom');
  dashboard.message(`Circuit « ${validated.name} » restauré : 60 checkpoints validés. Session en pause.`);
  return validated;
}
function initializeTrackStorage() {
  try{const saved=localStorage.getItem('ai-racing-track-v1');if(saved){registerCustomTrack(JSON.parse(saved));refreshCustomTrackOptions();}}
  catch(error){dashboard.message('Circuit enregistré non chargé : '+error.message,true);}
}
function circuitActions() {
  return {
    'track-generate':reportAction(()=>{
      const base=RACING_TRACKS[document.getElementById('variant-base').value];
      const parameters={...base,seed:Number(document.getElementById('variant-seed').value),
        noiseMax:Number(document.getElementById('variant-complexity').value),pathWidth:Number(document.getElementById('variant-width').value)};
      noiseSeed(parameters.seed);
      useTrackDocument(generateTrackDocument(parameters,'Variante '+parameters.seed,noise));
    }),
    'track-save':reportAction(()=>{const value=currentTrackDocument();localStorage.setItem('ai-racing-track-v1',JSON.stringify(value));dashboard.message(`Circuit « ${value.name} » enregistré dans ce navigateur.`);}),
    'track-restore':reportAction(()=>{const text=localStorage.getItem('ai-racing-track-v1');if(!text)throw new Error('Aucun circuit enregistré.');useTrackDocument(JSON.parse(text));}),
    'track-export':reportAction(()=>{downloadBrainJSON(currentTrackDocument(),'nice-circuit');dashboard.message('Circuit exporté : paramètres et géométrie exacte.');}),
    'track-file':reportAction(async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>256*1024)throw new Error('Circuit trop volumineux (maximum 256 Ko).');useTrackDocument(JSON.parse(await file.text()));}finally{event.target.value='';}})
  };
}
