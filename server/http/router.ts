import { Router } from 'express';
import {
  renderLogin,
  joinRoomForm,
  renderRoom,
  serveAvatarSvg,
} from './controllers.js';

const router = Router();

router.get('/login', renderLogin);
router.post('/join', joinRoomForm);
router.get('/room/:room_id', renderRoom);
router.get('/avatar/:player_id/:frame.svg', serveAvatarSvg);

export default router;
