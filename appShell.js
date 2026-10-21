// DOM navigation and display sizing only. The simulation world remains 1200×800.
function fitSimulationDisplay(availableWidth,availableHeight,worldWidth,worldHeight) {
  if(![availableWidth,availableHeight,worldWidth,worldHeight].every(Number.isFinite)||
    Math.min(availableWidth,availableHeight,worldWidth,worldHeight)<=0)return null;
  const scale=Math.min(availableWidth/worldWidth,availableHeight/worldHeight);
  return {width:worldWidth*scale,height:worldHeight*scale,scale};
}

class RacingAppShell {
  constructor({root=document,canvas,worldWidth,worldHeight,pause,switchMode,activeMode,render,startLoop,stopLoop}) {
    Object.assign(this,{root,canvas,worldWidth,worldHeight,pause,switchMode,activeMode,render,startLoop,stopLoop});
    this.page='home';this.home=root.getElementById('home-screen');this.simulation=root.getElementById('simulation-screen');
    this.viewport=root.getElementById('circuit');
    if(typeof SceneryViewport!=='undefined')this.surroundings=new SceneryViewport(this.viewport,canvas);
    root.querySelectorAll('[data-open-mode]').forEach(button=>{
      button.disabled=false;button.addEventListener('click',()=>this.enter(button.dataset.openMode));
    });
    root.getElementById('app-home').addEventListener('click',()=>this.showHome());
    this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(this.viewport);
    root.getElementById('home-status').textContent='Choisissez votre prochaine session.';
    this.showHome(false);
  }
  showHome(focus=true) {
    this.pause();this.stopLoop();this.page='home';
    this.simulation.hidden=true;this.home.hidden=false;this.root.body.dataset.page='home';
    if(focus)this.root.querySelector('[data-open-mode]').focus();
  }
  enter(target) {
    if(!['training','race'].includes(target))throw Error('Mode inconnu.');
    // Home never changes the active session. Returning to the same mode preserves
    // population, camera, prepared competitors, selections and Garage records.
    this.pause();if(this.activeMode()!==target)this.switchMode(target);
    this.pause();this.page='simulation';this.home.hidden=true;this.simulation.hidden=false;
    this.root.body.dataset.page='simulation';this.root.body.dataset.mode=target;
    this.layout();this.render();this.startLoop();
    this.root.getElementById('app-home').focus({preventScroll:true});
  }
  layout() {
    const display=fitSimulationDisplay(this.viewport.clientWidth-8,this.viewport.clientHeight-8,this.worldWidth,this.worldHeight);
    if(!display)return;
    this.canvas.style.setProperty('--display-width',display.width+'px');
    this.canvas.style.setProperty('--display-height',display.height+'px');
    const offset=Math.min(36,Math.max(0,(this.viewport.clientWidth-display.width)/2-4));
    this.canvas.style.transform=`translateX(${offset}px)`;
    if(this.surroundings)this.surroundings.resize(this.viewport.clientWidth,this.viewport.clientHeight,display,this.worldWidth,offset);
  }
}
