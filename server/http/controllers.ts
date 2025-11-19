/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import {
  FOLDERS,
  PERSONAGEM_DIR,
  ALLOWED_FRAMES,
  FOLDER_REGEX,
} from '../config/constants.js';
import { getPlayerMeta } from '../core/helpers.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

export const renderLogin = (_: Request, res: Response) => {
  res.render('login', { folders: Object.keys(FOLDERS).sort() });
};

export const joinRoomForm = (req: Request, res: Response) => {
  const { room, name, hat_color } = req.body;

  if (!room) return res.redirect('/login');

  return res.redirect(`/room/${room}?name=${name}&color=${hat_color}`);
};

export const renderRoom = (req: Request, res: Response) => {
  const { room_id } = req.params;
  const { name = 'Player', color = '' } = req.query;

  res.render('room', {
    room_id,
    name,
    color,
    folders: Object.keys(FOLDERS).sort(),
  });
};

export const serveAvatarSvg = (req: Request, res: Response) => {
  const { player_id, frame } = req.params;

  if (!player_id) {
    return res.status(404).send({ message: 'Parameter player_id is required' });
  }

  if (!ALLOWED_FRAMES.includes(frame as any)) {
    return res.status(404).send({ message: 'not found' });
  }

  const meta = getPlayerMeta(player_id);

  if (!meta || !meta.folder.match(FOLDER_REGEX)) {
    return res.status(404).send({ message: 'not found' });
  }

  const filePath = path.join(PERSONAGEM_DIR, meta.folder, `${frame}.svg`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send({ message: 'not found' });
  }

  return res.sendFile(filePath);
};
