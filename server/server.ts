import express from 'express';
import * as http from 'node:http';
import { Server } from 'socket.io';
import * as path from 'node:path';
import router from './http/router.js';
import { registerSocket } from './ws/socket.js';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 8080;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

registerSocket(io);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(router);

app.get('/', (_req, res) => {
  res.send('DevSec-Us Server is running!');
});

server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
