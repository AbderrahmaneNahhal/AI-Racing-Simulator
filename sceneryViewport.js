// DOM rendering surface, not a world entity. The p5 simulation stays 1200 x 800.
class SceneryViewport {
  constructor(viewport,worldCanvas) {
    this.viewport=viewport;this.worldCanvas=worldCanvas;
    this.canvas=document.createElement('canvas');this.canvas.className='scenery-viewport';
    this.canvas.setAttribute('aria-hidden','true');viewport.appendChild(this.canvas);
    this.context=this.canvas.getContext('2d');this.cache=document.createElement('canvas');this.key=null;
  }
  resize(width,height,display,worldWidth=1200,offset=0) {
    if(width<=0||height<=0)return;
    this.width=width;this.height=height;this.displayScale=display.width/worldWidth;
    this.offset=offset;
    this.density=Math.min(2,window.devicePixelRatio||1);
    const w=Math.round(width*this.density),h=Math.round(height*this.density);
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.cache.width=w;this.cache.height=h;}
    this.key=null;
  }
  draw(renderer,camera,scene={}) {
    if(!renderer||!this.width)return;
    const key=[camera.center.x,camera.center.y,camera.scale,this.width,this.height].join(',');
    const s=this.displayScale*camera.scale,d=this.density;
    const project=c=>{c.setTransform(d,0,0,d,0,0);c.translate(this.width/2+this.offset,this.height/2);c.scale(s,s);c.translate(-camera.center.x,-camera.center.y);};
    const bounds={x:camera.center.x-(this.width/2+this.offset)/s,y:camera.center.y-this.height/(2*s),
      width:this.width/s,height:this.height/s};
    if(this.renderer!==renderer||this.key!==key){
      this.renderer=renderer;this.key=key;
      const c=this.cache.getContext('2d');project(c);
      renderer.paintBackdrop(c,bounds);
      c.drawImage(renderer.layer.canvas,-renderer.padding,-renderer.padding,renderer.layer.width,renderer.layer.height);
    }
    const c=this.context;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.canvas.width,this.canvas.height);c.drawImage(this.cache,0,0);project(c);
    c.strokeStyle='#80b7ff';c.lineWidth=1;
    for(const cp of scene.checkpoints||[]){c.beginPath();c.moveTo(cp.a.x,cp.a.y);c.lineTo(cp.b.x,cp.b.y);c.stroke();}
    for(const car of scene.vehicles||[]){
      car.drawCar(false,c);
      const result=scene.race&&scene.race.resultFor(car);
      if(result&&(result.state==='finished'||result.state==='eliminated')){
        car.drawHalo('#f9e5ad',9,c);c.fillStyle='#fff4cf';c.font='bold 4px system-ui';c.textAlign='center';c.fillText('RETRAIT',car.pos.x,car.pos.y-12);
      }else if(result&&result.maneuver==='contact')car.drawHalo('#ffbd57',9,c);
    }
    if(scene.leader)scene.leader.drawHalo(scene.race?'#ffd383':'#74f2ba',8,c);
    if(scene.selected){scene.selected.showSelection(c);if(scene.sensors)scene.selected.showSensors(c);}
    // Present one complete scene, not a rectangle composited over another image.
    this.worldCanvas.classList.add('world-proxy');
  }
}
