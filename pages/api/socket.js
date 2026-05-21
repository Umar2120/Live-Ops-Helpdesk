import { initSocket } from '../../lib/socket-server';

export default function handler(req, res) {
  if (!res.socket.server.io) {
    initSocket(res.socket.server);
  }

  res.status(200).json({ message: 'Socket initialized' });
}
