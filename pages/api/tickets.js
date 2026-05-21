import { createTicket, getTickets } from '../../lib/ticket-store';

export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json(getTickets());
  }

  if (req.method === 'POST') {
    const { title, description, status } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required.' });
    }

    const ticket = createTicket({ title, description, status });
    const io = res.socket.server.io;

    if (io) {
      io.emit('ticket:created', ticket);
    }

    return res.status(201).json(ticket);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
