// Rendering coordinates only. No reference to velocities, brains or locomotion.
class RacingCamera {
  constructor(width, height) {
    this.width = width; this.height = height;
    this.center = {x: width / 2, y: height / 2};
    this.home = {...this.center}; this.baseScale = 1; this.zoom = 1; this.follow = false;
    this.followAcquired = false;
  }
  fit(points, padding = 28) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    this.baseScale = Math.min((this.width - 2 * padding) / Math.max(1, maxX - minX),
      (this.height - 2 * padding) / Math.max(1, maxY - minY));
    this.home = {x: (minX + maxX) / 2, y: (minY + maxY) / 2};
    this.reset();
  }
  get scale() { return this.baseScale * this.zoom; }
  reset() { this.zoomTarget=null;this.zoom = 1; this.follow = false; this.followAcquired = false; this.center = {...this.home}; }
  startFollow() {
    this.zoomTarget=this.zoom===1?3:this.zoom;
    this.follow=true;this.followAcquired=true; // Ease acquisition instead of snapping.
  }
  worldToScreen(point) {
    return {x: (point.x - this.center.x) * this.scale + this.width / 2,
      y: (point.y - this.center.y) * this.scale + this.height / 2};
  }
  screenToWorld(point) {
    return {x: (point.x - this.width / 2) / this.scale + this.center.x,
      y: (point.y - this.height / 2) / this.scale + this.center.y};
  }
  setZoom(value, anchor = {x: this.width / 2, y: this.height / 2}) {
    if (!Number.isFinite(value)) return;
    this.zoomTarget=null;
    const before = this.screenToWorld(anchor);
    this.zoom = Math.max(1, Math.min(6, value));
    const after = this.screenToWorld(anchor);
    this.center.x += before.x - after.x; this.center.y += before.y - after.y;
    if (this.zoom === 1) { this.follow = false; this.center = {...this.home}; }
  }
  pan(dx, dy) {
    this.zoomTarget=null;
    if (this.zoom === 1) return; // Global view always retains the whole track.
    this.follow = false;
    this.center.x -= dx / this.scale; this.center.y -= dy / this.scale;
  }
  update(target, elapsedMs = 1000/60) {
    if(this.follow&&target&&this.zoomTarget!=null) {
      const alpha=1-Math.exp(-Math.max(0,Math.min(100,Number.isFinite(elapsedMs)?elapsedMs:1000/60))/180);
      this.zoom+=(this.zoomTarget-this.zoom)*alpha;
      if(Math.abs(this.zoomTarget-this.zoom)<.001){this.zoom=this.zoomTarget;this.zoomTarget=null;}
    }
    if(this.zoom===1&&this.zoomTarget==null){this.center.x=this.home.x;this.center.y=this.home.y;this.follow=false;this.followAcquired=false;return;}
    if (!this.follow || !target) {this.followAcquired=false;return;}
    // Acquisition is exact; subsequent motion/selection changes ease in camera space.
    const alpha=this.followAcquired ? 1-Math.exp(-Math.max(0,Math.min(100,Number.isFinite(elapsedMs)?elapsedMs:1000/60))/110) : 1;
    this.center.x+=(target.pos.x-this.center.x)*alpha;
    this.center.y+=(target.pos.y-this.center.y)*alpha;
    this.followAcquired=true;
  }
  begin() {
    push(); translate(this.width / 2, this.height / 2); scale(this.scale);
    translate(-this.center.x, -this.center.y);
  }
  end() { pop(); }
}

function canvasPoint(event, box, width, height) {
  return {x: (event.clientX - box.left) * width / box.width,
    y: (event.clientY - box.top) * height / box.height};
}

function pickRacingVehicle(vehicles, screen, camera, radius = 14) {
  const world = camera.screenToWorld(screen);
  let closest = null, distance = radius / camera.scale;
  for (const vehicle of vehicles) {
    const d = Math.hypot(world.x - vehicle.pos.x, world.y - vehicle.pos.y);
    if (d < distance) { closest = vehicle; distance = d; }
  }
  return closest;
}
