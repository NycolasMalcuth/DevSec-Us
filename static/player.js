// static/player.js
class Player {
  constructor(map, options = {}) {
    this.map = map;
    this.playerId = options.playerId || null;
    this.name = options.name || 'Player';
    this.radius = options.radius || 26;
    this.speed = options.speed || 320;
    this.playerSize = options.playerSize || 75;
    this.color = options.color || '#C50A0A';

    this.x = (this.map.width || 1000) / 2;
    this.y = (this.map.height || 800) / 2;
    this.findSafeSpawn?.();

    this.facingRight = true;
    this.wasMoving = false;
    this.animationTime = 0;
    this.frameDuration = 0.12;
    this.walkingFrames = ['direito', 'meio', 'esquerdo', 'meio'];
    this.frameIndex = 0;
    this.currentFrame = 'meio';

    this.frames = {};
    ['meio', 'direito', 'esquerdo'].forEach((k) => {
      this.frames[k] = new Image();

      if (this.playerId) {
        this.frames[k].src = `/avatar/${this.playerId}/${k}.svg`;
      } else {
        this.frames[k].src = `/static/personagem/${k}.svg`;
      }
    });
  }

  findSafeSpawn() {
    if (!this.map || typeof this.map.isWalkable !== 'function') return;

    const step = 15;

    for (let y = 200; y < (this.map.height || 1000) - 200; y += step) {
      for (let x = 200; x < (this.map.width || 1000) - 200; x += step) {
        if (this.map.isWalkable(x, y, this.radius + 10)) {
          this.x = x;
          this.y = y;
          return;
        }
      }
    }
  }

  // quando o servidor nos der um playerId, atualiza os src das imagens para servir colorizaçãovia /avatar/
  setPlayerId(playerId) {
    if (!playerId) return;
    this.playerId = playerId;
    ['meio', 'direito', 'esquerdo'].forEach((k) => {
      const img = this.frames[k] || (this.frames[k] = new Image());
      img.src = `/avatar/${this.playerId}/${k}.svg`;
    });
  }

  update(dt, keys) {
    let dx = 0,
      dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;

    const isMoving = dx !== 0 || dy !== 0;
    if (isMoving) {
      const len = Math.hypot(dx, dy) || 1;
      const moveX = (dx / len) * this.speed * dt;
      const moveY = (dy / len) * this.speed * dt;
      if (!this.map || this.map.isWalkable(this.x + moveX, this.y, this.radius))
        this.x += moveX;
      if (!this.map || this.map.isWalkable(this.x, this.y + moveY, this.radius))
        this.y += moveY;
    }

    if (dx !== 0) this.facingRight = dx > 0;

    if (isMoving) {
      if (!this.wasMoving) {
        this.currentFrame = 'direito';
        this.frameIndex = 0;
        this.animationTime = 0;
      }
      this.animationTime += dt;
      while (this.animationTime >= this.frameDuration) {
        this.animationTime -= this.frameDuration;
        this.frameIndex = (this.frameIndex + 1) % this.walkingFrames.length;
        this.currentFrame = this.walkingFrames[this.frameIndex];
      }
    } else {
      this.currentFrame = 'meio';
    }
    this.wasMoving = isMoving;
  }

  draw(ctx, cameraX, cameraY) {
    const screenX = this.x - cameraX;
    const screenY = this.y - cameraY;

    const img = this.frames[this.currentFrame];

    // nome acima da cabeça
    const nameY = screenY - this.playerSize / 2 - 12;
    ctx.save();
    ctx.font = '16px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.strokeText(this.name, screenX, nameY);
    ctx.fillStyle = '#fff';
    ctx.fillText(this.name, screenX, nameY);
    ctx.restore();

    if (img && img.complete && img.naturalWidth !== 0) {
      ctx.save();
      ctx.translate(screenX, screenY);
      if (!this.facingRight) ctx.scale(-1, 1);
      const size = this.playerSize;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      // fallback: círculo
      ctx.save();
      ctx.fillStyle = '#ff4785';
      ctx.beginPath();
      ctx.arc(screenX, screenY, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// export global
window.Player = Player;
