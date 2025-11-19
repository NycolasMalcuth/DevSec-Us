import { Router } from 'express';
import {
  renderLogin,
  joinRoomForm,
  renderRoom,
  serveAvatarSvg,
} from './controllers.js';

const router = Router();

router.get('/login', renderLogin);

router.get('/room/:room_id', renderRoom);

router.get('/avatar/:player_id/:frame.svg', serveAvatarSvg);

router.post('/join', joinRoomForm);

export default router;
