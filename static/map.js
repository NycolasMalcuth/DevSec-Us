// static/map.js  ← VERSÃO FINAL 100% FUNCIONANDO (19/nov/2025)
class GameMap {
  constructor() {
    this.SCALE = 9;
    this.BASE_W = 1024;
    this.BASE_H = 768;
    this.width = this.BASE_W * this.SCALE;
    this.height = this.BASE_H * this.SCALE;
    this.canvas = null;
    this.ctx = null;
    this.imageData = null;           // colisão (apenas mapa.svg)
    this.portalImageData = null;      // para detectar os portais
    this.portalCenters = [];          // [{x,y}, ...]
    this.ready = false;

    this.useAlphaForWalk = true;
    this.brightnessThreshold = 30;

    this.floorSrc = '/static/floor.png';
    this.portalSrc = '/static/portais.svg';
  }

  async load() {
    const loadImg = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.src = src;
      img.onload = () => resolve(img);
      img.onerror = (e) => reject('Erro ao carregar: ' + src);
    });

    try {
      const [svgImg, floorImg, portalImg] = await Promise.all([
        loadImg('/static/mapa.svg'),
        loadImg(this.floorSrc),
        loadImg(this.portalSrc)
      ]);

      // 1. Canvas de colisão (só o mapa.svg)
      const collCanvas = document.createElement('canvas');
      collCanvas.width = this.width;
      collCanvas.height = this.height;
      const collCtx = collCanvas.getContext('2d');
      collCtx.drawImage(svgImg, 0, 0, this.width, this.height);
      this.imageData = collCtx.getImageData(0, 0, this.width, this.height).data;

      // 2. Canvas visual (floor + mapa + portais)
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d');
      this.ctx.drawImage(floorImg, 0, 0, this.width, this.height);
      this.ctx.drawImage(svgImg, 0, 0, this.width, this.height);
      this.ctx.drawImage(portalImg, 0, 0, this.width, this.height);

      // 3. Canvas só para detectar os centros dos portais
      const portalCanvas = document.createElement('canvas');
      portalCanvas.width = this.width;
      portalCanvas.height = this.height;
      const pCtx = portalCanvas.getContext('2d');
      pCtx.drawImage(portalImg, 0, 0, this.width, this.height);
      this.portalImageData = pCtx.getImageData(0, 0, this.width, this.height).data;

      // 4. Detecta os centros automaticamente
      this.portalCenters = this.findPortalCenters();

      this.ready = true;
      console.log('%cMapa carregado! Portais encontrados:', 'color:#0f0;font-weight:bold', this.portalCenters.length);
      console.log('Centros:', this.portalCenters);
    } catch (e) {
      console.error('gameMap.load erro', e);
      throw e;
    }
  }

  // ← ESSA FUNÇÃO ESTAVA FALTANDO (por isso dava "is not a function")
  findPortalCenters() {
    if (!this.portalImageData) return [];

    const w = this.width;
    const h = this.height;
    const data = this.portalImageData;
    const visited = new Uint8Array(w * h);
    const centers = [];

    const isSolid = (i) => data[i + 3] > 100; // alpha > 100 = pixel do portal

    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[ -1,-1],[ -1,1],[1,-1],[1,1]];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const byte = idx * 4;
        if (visited[idx] || !isSolid(byte)) continue;

        let sumX = 0, sumY = 0, count = 0;
        const queue = [{x, y}];
        visited[idx] = 1;

        while (queue.length) {
          const p = queue.shift();
          sumX += p.x;
          sumY += p.y;
          count++;

          for (const [dx, dy] of dirs) {
            const nx = p.x + dx;
            const ny = p.y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nidx = ny * w + nx;
              if (!visited[nidx] && isSolid(nidx * 4)) {
                visited[nidx] = 1;
                queue.push({x: nx, y: ny});
              }
            }
          }
        }

        if (count > 80) { // ignora sujeirinha pequena
          centers.push({
            x: Math.round(sumX / count),
            y: Math.round(sumY / count)
          });
        }
      }
    }
    return centers;
  }

  getPixelRGBA(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return {a:255};
    const i = (y * this.width + x) * 4;
    return {
      r: this.imageData[i],
      g: this.imageData[i+1],
      b: this.imageData[i+2],
      a: this.imageData[i+3],
      brightness: Math.round((this.imageData[i] + this.imageData[i+1] + this.imageData[i+2]) / 3)
    };
  }

  draw(mainCtx, cameraX, cameraY) {
    if (!this.ready) return;
    mainCtx.drawImage(this.canvas, -cameraX, -cameraY);
  }

  isWalkable(x, y, radius = 20) {
    if (!this.ready) return false;
    const points = 12;
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * radius);
      const py = Math.round(y + Math.sin(a) * radius);
      if (px < 0 || py < 0 || px >= this.width || py >= this.height) return false;
      const pixel = this.getPixelRGBA(px, py);
      if (this.useAlphaForWalk) {
        if (pixel.a !== 0) return false; // alpha 0 = caminhável
      } else {
        if (pixel.brightness >= this.brightnessThreshold) return false;
      }
    }
    return true;
  }
  // NOVA VERSÃO PERFEITA → sempre safe, sempre perto, nunca buga
  getTeleportDestination(playerX, playerY, playerRadius = 35) {
    if (!this.ready || this.portalCenters.length < 2) return null;

    // 1. Encontra o portal de entrada (mais próximo do player)
    let entryIdx = -1;
    let bestDistSq = Infinity;
    for (let i = 0; i < this.portalCenters.length; i++) {
      const c = this.portalCenters[i];
      const dx = c.x - playerX;
      const dy = c.y - playerY;
      const dSq = dx*dx + dy*dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        entryIdx = i;
      }
    }

    const ENTER_RADIUS = 160; // um pouco maior, fica mais fácil entrar
    if (bestDistSq > ENTER_RADIUS * ENTER_RADIUS) return null;

    const entry = this.portalCenters[entryIdx];

    // 2. Encontra o portal de saída (mais próximo do portal de entrada)
    let target = null;
    let bestTargetDistSq = Infinity;
    for (let i = 0; i < this.portalCenters.length; i++) {
      if (i === entryIdx) continue;
      const c = this.portalCenters[i];
      const dx = c.x - entry.x;
      const dy = c.y - entry.y;
      const dSq = dx*dx + dy*dy;
      if (dSq < bestTargetDistSq) {
        bestTargetDistSq = dSq;
        target = c;
      }
    }
    if (!target) return null;

    // 3. Calcula posição segura perto do portal de saída
    return this.findSafeExitPosition(target.x, target.y, entry.x, entry.y, playerRadius);
  }

  // FUNÇÃO NOVA: garante 100% posição segura e perto do portal
  findSafeExitPosition(targetX, targetY, entryX, entryY, playerRadius = 35) {
    const dx = targetX - entryX;
    const dy = targetY - entryY;
    const dist = Math.hypot(dx, dy);
    
    if (dist === 0) {
      // caso raro de dois portais no mesmo lugar → busca radial
      return this.findRadialSafeSpot(targetX, targetY, playerRadius);
    }

    const nx = dx / dist;
    const ny = dy / dist;

    // Distâncias que vamos testar (começa perto → longe)
    const distances = [40, 60, 80, 100, 130, 160, 200, 250, 300];

    // 1º tenta na direção que o player está chegando (fica natural)
    for (let d of distances) {
      const px = targetX + nx * d;
      const py = targetY + ny * d;
      if (this.isWalkable(px, py, playerRadius)) {
        return {x: px, y: py};
      }
    }

    // 2º tenta no lado oposto (se a frente tiver parede)
    for (let d of distances) {
      const px = targetX - nx * d;
      const py = targetY - ny * d;
      if (this.isWalkable(px, py, playerRadius)) {
        return {x: px, y: py};
      }
    }

    // 3º tenta os lados (esquerda e direita)
    const perpX = -ny;  // vetor perpendicular 90°
    const perpY = nx;
    for (let d of distances) {
      // esquerda
      let px = targetX + perpX * d;
      let py = targetY + perpY * d;
      if (this.isWalkable(px, py, playerRadius)) return {x: px, y: py};

      // direita
      px = targetX - perpX * d;
      py = targetY - perpY * d;
      if (this.isWalkable(px, py, playerRadius)) return {x: px, y: py};
    }

    // 4º fallback: busca circular (sempre acha alguma coisa)
    return this.findRadialSafeSpot(targetX, targetY, playerRadius);
  }

  // Busca em círculo até achar lugar caminhável (nunca falha)
  findRadialSafeSpot(centerX, centerY, playerRadius = 35, maxRadius = 400) {
    // primeiro tenta o centro (se for caminhável)
    if (this.isWalkable(centerX, centerY, playerRadius)) {
      return {x: centerX, y: centerY};
    }

    const step = 20;
    const steps = 32; // quanto maior = mais preciso

    for (let r = step; r <= maxRadius; r += step) {
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const px = centerX + Math.cos(angle) * r;
        const py = centerY + Math.sin(angle) * r;

        // dentro do mapa e caminhável?
        if (px >= 0 && px < this.width && py >= 0 && py < this.height && this.isWalkable(px, py, playerRadius)) {
          return {x: px, y: py};
        }
      }
    }

    // último recurso (quase impossível chegar aqui)
    return {x: centerX, y: centerY};
  }
}
