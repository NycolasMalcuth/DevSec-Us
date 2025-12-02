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

        // NOVO: sistema de carregamento do portal (5 segundos)
        this.portalCharging = 0;        // 0 a 5 (segundos)
        this.teleportCooldown = 0;      // evita spam após teletransporte

        // posição inicial
        this.x = (this.map.width || 1000) / 2;
        this.y = (this.map.height || 800) / 2;
        this.findSafeSpawn?.();

        // animação
        this.facingRight = true;
        this.wasMoving = false;
        this.animationTime = 0;
        this.frameDuration = 0.12;
        this.walkingFrames = ['direito', 'meio', 'esquerdo', 'meio'];
        this.frameIndex = 0;
        this.currentFrame = 'meio';

        // frames do personagem
        this.frames = {};
        ['meio','direito','esquerdo'].forEach(k => {
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
                    this.x = x; this.y = y; return;
                }
            }
        }
    }

    setPlayerId(playerId) {
        if (!playerId) return;
        this.playerId = playerId;
        ['meio','direito','esquerdo'].forEach(k => {
            const img = this.frames[k] || (this.frames[k] = new Image());
            img.src = `/avatar/${this.playerId}/${k}.svg`;
        });
    }

    update(dt, keys) {
        let dx = 0, dy = 0;
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;

        const isMoving = dx !== 0 || dy !== 0;
        if (isMoving) {
            const len = Math.hypot(dx, dy) || 1;
            const moveX = (dx / len) * this.speed * dt;
            const moveY = (dy / len) * this.speed * dt;
            if (!this.map || this.map.isWalkable(this.x + moveX, this.y, this.radius)) this.x += moveX;
            if (!this.map || this.map.isWalkable(this.x, this.y + moveY, this.radius)) this.y += moveY;
        }

        if (dx !== 0) this.facingRight = dx > 0;

        // Animação de caminhada
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

        // ================================================
        // PORTAL: 5 segundos de carregamento + barra visual
        // ================================================
        if (this.map?.getTeleportDestination) {
            // cooldown após teletransporte
            if (this.teleportCooldown > 0) {
                this.teleportCooldown -= dt;
                if (this.teleportCooldown < 0) this.teleportCooldown = 0;
            }

            const destination = this.map.getTeleportDestination(this.x, this.y);

            if (destination && this.teleportCooldown <= 0) {
                // está dentro do raio do portal → carrega
                this.portalCharging += dt;

                if (this.portalCharging >= 5.0) {
                    // TELEPORTA!
                    this.x = destination.x;
                    this.y = destination.y;
                    this.portalCharging = 0;
                    this.teleportCooldown = 1.5;
                    console.log('%cTELEPORTADO COM SUCESSO!', 'background:#00ff00;color:#000;font-size:18px;font-weight:bold');
                }
            } else {
                // saiu do portal antes de completar → cancela
                if (this.portalCharging > 0) {
                    this.portalCharging = 0;
                }
            }
        }
    }

    draw(ctx, cameraX, cameraY) {
        const screenX = this.x - cameraX;
        const screenY = this.y - cameraY;
        const img = this.frames[this.currentFrame];

        // === BARRA DE CARREGAMENTO DO PORTAL (5 segundos) ===
        if (this.portalCharging > 0) {
            const progress = Math.min(this.portalCharging / 5.0, 1);
            const barWidth = 120;
            const barHeight = 14;
            const barY = screenY - this.playerSize/2 - 45;

            // fundo preto
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(screenX - barWidth/2, barY, barWidth, barHeight);

            // barra de progresso (verde → amarelo → vermelho conforme enche)
            const r = progress < 0.5 ? 255 : Math.floor(255 * (1 - progress) * 2);
            const g = 255;
            ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
            ctx.fillRect(screenX - barWidth/2, barY, barWidth * progress, barHeight);

            // borda branca
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.strokeRect(screenX - barWidth/2, barY, barWidth, barHeight);

            // texto "Teleportando..."
            ctx.font = 'bold 15px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Teleportando...', screenX, barY - 15);
        }

        // Nome do jogador
        const nameY = screenY - this.playerSize/2 - 12;
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

        // Desenha o personagem
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.save();
            ctx.translate(screenX, screenY);
            if (!this.facingRight) ctx.scale(-1, 1);
            const size = this.playerSize;
            ctx.drawImage(img, -size/2, -size/2, size, size);
            ctx.restore();
        } else {
            ctx.save();
            ctx.fillStyle = "#ff4785";
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

// export global
window.Player = Player;
