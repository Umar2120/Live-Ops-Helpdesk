import { updateTicket } from '../../../lib/ticket-store';

export default function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const { title, description, status } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required.' });
    }

    const ticket = updateTicket(id, { title, description, status });
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const io = res.socket.server.io;
    if (io) {
      io.emit('ticket:updated', ticket);
    }

    return res.status(200).json(ticket);
  }

  res.setHeader('Allow', ['PUT']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
