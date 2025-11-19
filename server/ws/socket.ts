import { Server, Socket } from 'socket.io';
import { rooms, sidMap, playerMeta } from '../core/state.js';
import { cleanInputString, removePlayerFromState } from '../core/helpers.js';
import { FOLDERS } from '../config/constants.js';
import * as crypto from 'node:crypto';

export function registerSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    socket.on('join', (data) => {
      const room = cleanInputString(data.room, '');

      if (!room) return;

      const playerId = crypto.randomUUID();
      const folder = FOLDERS[data.color] ? data.color : Object.keys(FOLDERS)[0];

      playerMeta[playerId] = {
        name: cleanInputString(data.name, 'Player'),
        folder,
        colorHex: FOLDERS[folder] || '#000000',
      };

      sidMap[socket.id] = { room, playerId };

      socket.join(room);

      const x = parseFloat(data.x ?? 0) || 0;
      const y = parseFloat(data.y ?? 0) || 0;

      rooms[room] ??= {};
      rooms[room][playerId] = { x, y, ...playerMeta[playerId] };

      socket.emit('joined', { player_id: playerId, players: rooms[room] });

      socket.to(room).emit('player_joined', {
        player_id: playerId,
        x,
        y,
        ...playerMeta[playerId],
      });
    });

    socket.on('pos_update', (data) => {
      const { room, player_id } = data;

      const player = rooms[room]?.[player_id];

      if (!player) return;

      player.x = parseFloat(data.x ?? player.x);
      player.y = parseFloat(data.y ?? player.y);

      socket.to(room).emit('player_moved', {
        player_id,
        x: player.x,
        y: player.y,
        facingRight: data.facingRight,
        currentFrame: data.currentFrame,
      });
    });

    socket.on('leave', ({ room, player_id }) => {
      removePlayerFromState(room, player_id);

      socket.leave(room);

      socket.to(room).emit('player_left', { player_id });
    });

    socket.on('disconnect', () => {
      const entry = sidMap[socket.id];

      if (!entry) return;

      const { room, playerId } = entry;

      removePlayerFromState(room, playerId);

      socket.to(room).emit('player_left', { player_id: playerId });
    });
  });
}
