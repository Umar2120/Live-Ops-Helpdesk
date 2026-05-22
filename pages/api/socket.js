import { initSocket } from '../../lib/socket-server';
import { applyCors } from '../../lib/http-cors';

export default function handler(req, res) {
  if (applyCors(req, res)) return;

  if (!res.socket.server.io) {
    initSocket(res.socket.server);
  }

  res.status(200).json({ message: 'Socket initialized' });
}
