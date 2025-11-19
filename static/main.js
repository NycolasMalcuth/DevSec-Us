// main.js
// Simples engine: carrega um SVG de /static/map.svg (você pode trocar o nome do arquivo)
// Gerencia jogador local e jogadores remotos via socket.io

class GameMap {
  constructor(svgPath = '/public/map.svg') {
    this.svgPath = svgPath;
    this.img = new Image();
    this.ready = false;
  }
  load() {
    return new Promise((resolve, reject) => {
      this.img.onload = () => {
        this.ready = true;
        resolve();
      };
      this.img.onerror = reject;
      this.img.src = this.svgPath + '?_=' + Date.now();
    });
  }
  draw(ctx, camX, camY) {
    if (!this.ready) return;
    // desenha centering simples: desenhar a imagem com deslocamento de câmera
    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.drawImage(this.img, 0, 0);
    ctx.restore();
  }
}

class Player {
  constructor(gameMap, socket, room, id = null) {
    this.map = gameMap;
    this.socket = socket;
    this.room = room;
    this.id = id;
    this.x = 100;
    this.y = 100;
    this.radius = 12;
    this.speed = 240; // px/s
    this.otherPlayers = {}; // player_id -> {x,y}
    this._lastEmit = 0;
  }

  update(dt, keys) {
    let moved = false;
    if (keys['w'] || keys['arrowup']) {
      this.y -= this.speed * dt;
      moved = true;
    }
    if (keys['s'] || keys['arrowdown']) {
      this.y += this.speed * dt;
      moved = true;
    }
    if (keys['a'] || keys['arrowleft']) {
      this.x -= this.speed * dt;
      moved = true;
    }
    if (keys['d'] || keys['arrowright']) {
      this.x += this.speed * dt;
      moved = true;
    }

    // Limites simples (para não sair do mapa muito longe)
    if (this.x < 0) this.x = 0;
    if (this.y < 0) this.y = 0;

    // envia atualização de posição a cada 80ms quando houver movimento
    this._lastEmit += dt * 1000;
    if (moved && this._lastEmit > 80 && this.socket && this.id) {
      this.socket.emit('pos_update', {
        room: this.room,
        player_id: this.id,
        x: this.x,
        y: this.y,
      });
      this._lastEmit = 0;
    }
  }

  draw(ctx, camX, camY) {
    // jogador local
    ctx.save();
    ctx.translate(-camX, -camY);

    // desenha jogadores remotos
    for (const pid in this.otherPlayers) {
      const p = this.otherPlayers[pid];
      ctx.beginPath();
      ctx.fillStyle = '#f00';
      ctx.arc(p.x, p.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText(pid.slice(0, 4), p.x - this.radius, p.y - this.radius - 6);
    }

    // desenha jogador local
    ctx.beginPath();
    ctx.fillStyle = '#0f0';
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = '12px monospace';
    ctx.fillText('Você', this.x - this.radius, this.y - this.radius - 6);

    ctx.restore();
  }

  handleServerEvent(name, data) {
    if (name === 'player_joined') {
      this.otherPlayers[data.player_id] = { x: data.x, y: data.y };
    } else if (name === 'player_moved') {
      if (this.otherPlayers[data.player_id]) {
        this.otherPlayers[data.player_id].x = data.x;
        this.otherPlayers[data.player_id].y = data.y;
      }
    } else if (name === 'player_left') {
      delete this.otherPlayers[data.player_id];
    } else if (name === 'joined') {
      // resposta inicial do servidor com id do jogador e lista de players ativos
      this.id = data.player_id;
      // copia os players (exceto nós mesmos)
      for (const pid in data.players) {
        if (pid === this.id) continue;
        this.otherPlayers[pid] = {
          x: data.players[pid].x,
          y: data.players[pid].y,
        };
      }
      console.log('Entrou na sala como', this.id);
    }
  }
}

// função principal que inicializa tudo (chamada por room.html)
function startGame(roomId) {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const info = document.getElementById('info');
  const roomLabel = document.getElementById('roomLabel');
  roomLabel.textContent = roomId;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const keys = {};
  window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
  window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

  const gameMap = new GameMap('/public/map.svg');
  const socket = io(); // conecta ao servidor
  const player = new Player(gameMap, socket, roomId);

  // Eventos socket
  socket.on('connect', () => {
    info.textContent =
      'Conectado ao servidor. Entrando na sala ' + roomId + '...';
    // pede para entrar na sala; envia posição inicial
    socket.emit('join', { room: roomId, x: player.x, y: player.y });
  });

  socket.on('joined', (data) => {
    // passado ao player
    player.handleServerEvent('joined', data);
    info.textContent =
      'Use WASD ou setas para andar. Jogadores na sala: ' +
      Object.keys(player.otherPlayers).length;
  });

  socket.on('player_joined', (data) => {
    player.handleServerEvent('player_joined', data);
    info.textContent =
      'Novo jogador entrou — total: ' +
      (1 + Object.keys(player.otherPlayers).length);
  });

  socket.on('player_moved', (data) => {
    player.handleServerEvent('player_moved', data);
  });

  socket.on('player_left', (data) => {
    player.handleServerEvent('player_left', data);
    info.textContent =
      'Um jogador saiu — total: ' +
      (1 + Object.keys(player.otherPlayers).length);
  });

  socket.on('disconnect', () => {
    info.textContent = 'Desconectado do servidor.';
  });

  // carrega mapa e inicia loop
  gameMap
    .load()
    .then(() => {
      info.textContent = 'Mapa carregado. Use WASD ou setas para andar.';
      let lastTime = 0;
      let camera = { x: 0, y: 0 };

      function loop(time) {
        if (!lastTime) lastTime = time;
        const dt = (time - lastTime) / 1000;
        lastTime = time;

        player.update(dt, keys);
        // câmera suave seguindo jogador
        camera.x += (player.x - canvas.width / 2 - camera.x) * 0.12;
        camera.y += (player.y - canvas.height / 2 - camera.y) * 0.12;

        // render
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (gameMap.ready) {
          gameMap.draw(ctx, camera.x, camera.y);
          player.draw(ctx, camera.x, camera.y);
        }

        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    })
    .catch((err) => {
      info.textContent = 'Erro ao carregar mapa: ' + err;
      console.error(err);
    });

  // antes de fechar a página, envia leave
  window.addEventListener('beforeunload', () => {
    if (socket && player.id) {
      socket.emit('leave', { room: roomId, player_id: player.id });
      socket.disconnect();
    }
  });
}
