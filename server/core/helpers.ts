/* eslint-disable @typescript-eslint/no-explicit-any */
import { playerMeta, rooms, sidMap } from './state.js';

export const cleanInputString = (value: any, fallback: string): string =>
  typeof value === 'string' ? value.trim() : fallback;

export const getPlayerMeta = (playerId: string) => playerMeta[playerId];

export const removePlayerFromState = (room: string, playerId: string) => {
  if (rooms[room]?.[playerId]) {
    delete rooms[room][playerId];
    if (!Object.keys(rooms[room]).length) delete rooms[room];
  }

  for (const sid in sidMap)
    if (sidMap[sid]?.room === room && sidMap[sid]?.playerId === playerId)
      delete sidMap[sid];

  delete playerMeta[playerId];
};
