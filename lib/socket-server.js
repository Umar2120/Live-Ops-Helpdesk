import { Server } from 'socket.io';
import {
  getTicket,
  getTickets,
  lockTicket,
  unlockTicket,
  unlockTicketsForSocket,
  updateTicket,
} from './ticket-store';

export function initSocket(server) {
  const io = new Server(server, {
    path: '/api/socket',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  server.io = io;
  io.on('connection', (socket) => {
    socket.data.agentName = 'Unknown Agent';
    socket.emit('ticket:list', getTickets());

    socket.on('agent:identify', ({ agentName }) => {
      socket.data.agentName = agentName || 'Unknown Agent';
    });

    socket.on('lock_ticket', ({ ticketId, agentName }, acknowledge = () => {}) => {
      socket.data.agentName = agentName || socket.data.agentName;
      const ticket = lockTicket(ticketId, {
        agentName: socket.data.agentName,
        socketId: socket.id,
      });

      if (ticket) {
        io.emit('ticket:locked', ticket);
        acknowledge({
          ok: ticket.lock?.socketId === socket.id,
          ticket,
          lockedBy: ticket.lock?.lockedBy || null,
        });
        return;
      }

      acknowledge({ ok: false, error: 'Ticket not found.' });
    });

    socket.on('unlock_ticket', ({ ticketId }) => {
      const ticket = unlockTicket(ticketId, { socketId: socket.id });

      if (ticket) {
        io.emit('ticket:unlocked', ticket);
      }
    });

    socket.on('update_ticket', ({ ticketId, title, description, status }, acknowledge = () => {}) => {
      const ticket = getTicket(ticketId);

      if (!ticket) {
        acknowledge({ ok: false, error: 'Ticket not found.' });
        return;
      }

      if (ticket.lock?.socketId && ticket.lock.socketId !== socket.id) {
        acknowledge({ ok: false, error: `Ticket is locked by ${ticket.lock.lockedBy}.` });
        return;
      }

      const updatedTicket = updateTicket(ticketId, { title, description, status });
      io.emit('ticket:updated', updatedTicket);
      acknowledge({ ok: true, ticket: updatedTicket });
    });

    socket.on('disconnect', () => {
      const unlockedTickets = unlockTicketsForSocket(socket.id);
      unlockedTickets.forEach((ticket) => {
        io.emit('ticket:unlocked', ticket);
      });
      console.log('Socket disconnected:', socket.id);
    });
  });

  console.log('Socket.io server initialized');
}
