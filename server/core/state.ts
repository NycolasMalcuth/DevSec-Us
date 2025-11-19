/* eslint-disable @typescript-eslint/no-explicit-any */
export const rooms: Record<string, Record<string, any>> = {};
export const sidMap: Record<string, { room: string; playerId: string }> = {};
export const playerMeta: Record<
  string,
  { name: string; folder: string; colorHex: string }
> = {};
