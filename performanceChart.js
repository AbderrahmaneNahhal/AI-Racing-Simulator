class PerformanceChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.version = '';
  }
  render(history, checkpointCount, track) {
    const version = `${track}:${history.length}`;
    if (version === this.version) return;
    this.version = version;
    const canvas = this.canvas, ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    const left = 32, top = 14, right = width - 12, bottom = height - 28;
    ctx.clearRect(0, 0, width, height);
    ctx.font = '11px system-ui'; ctx.fillStyle = '#a5b3c8'; ctx.strokeStyle = '#29384b';
    for (let i = 0; i <= 3; i++) {
      const y = bottom - i / 3 * (bottom - top);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.fillText(String(Math.round(i / 3 * checkpointCount)), 3, y + 4);
    }
    const points = history.slice(-60);
    if (!points.length) {
      ctx.fillText('En attente de la première génération', 46, 87);
    } else {
      const x = i => left + (points.length === 1 ? .5 : i / (points.length - 1)) * (right - left);
      for (const [key, color] of [['bestProgress', '#74f2ba'], ['meanProgress', '#80b7ff']]) {
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
        ctx.beginPath();
        points.forEach((point, i) => {
          const y = bottom - point[key] / checkpointCount * (bottom - top);
          if (i === 0) ctx.moveTo(x(i), y); else ctx.lineTo(x(i), y);
        });
        ctx.stroke();
        if (points.length === 1) {
          ctx.beginPath(); ctx.arc(x(0), bottom - points[0][key] / checkpointCount * (bottom - top), 3, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.fillStyle = '#a5b3c8';
      ctx.fillText(`G${points[0].generation}`, left, height - 6);
      ctx.textAlign = 'right'; ctx.fillText(`G${points[points.length - 1].generation}`, right, height - 6); ctx.textAlign = 'left';
    }
    canvas.setAttribute('aria-label', `Progression en checkpoints, ${history.length} générations terminées. Courbes du meilleur score et de la moyenne. Dernières 60 générations affichées.`);
  }
}
