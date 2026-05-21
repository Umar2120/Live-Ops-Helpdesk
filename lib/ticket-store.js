import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'tickets.json');
const seedTickets = [
  {
    id: '1',
    title: 'Billing portal returns a blank page',
    description: 'Customer can sign in, but the billing portal renders empty after checkout redirect.',
    status: 'open',
    createdAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    lock: null,
  },
  {
    id: '2',
    title: 'Priority customer cannot reset password',
    description: 'Reset email arrives, but the token is rejected as expired immediately.',
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    lock: null,
  },
];
const tickets = loadTickets();
let nextId = getNextId(tickets);

function loadTickets() {
  try {
    if (!fs.existsSync(dataFile)) {
      saveTickets(seedTickets);
      return seedTickets;
    }

    const savedTickets = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return savedTickets.map((ticket) => ({ ...ticket, lock: null }));
  } catch (error) {
    console.error('Failed to load local tickets:', error);
    return seedTickets;
  }
}

function saveTickets(currentTickets) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const serializableTickets = currentTickets.map(({ lock, ...ticket }) => ({
      ...ticket,
      lock: null,
    }));

    fs.writeFileSync(dataFile, JSON.stringify(serializableTickets, null, 2));
  } catch (error) {
    console.error('Failed to save local tickets:', error);
  }
}

function getNextId(currentTickets) {
  const highestId = currentTickets.reduce((highest, ticket) => {
    const numericId = Number(ticket.id);
    return Number.isFinite(numericId) ? Math.max(highest, numericId) : highest;
  }, 0);

  return highestId + 1;
}

export function getTickets() {
  return tickets;
}

export function getTicket(ticketId) {
  return tickets.find((ticket) => ticket.id === String(ticketId));
}

export function createTicket({ title, description, status = 'open' }) {
  const ticket = {
    id: String(nextId++),
    title,
    description,
    status,
    createdAt: new Date().toISOString(),
    lock: null,
  };
  tickets.unshift(ticket);
  saveTickets(tickets);
  return ticket;
}

export function updateTicket(ticketId, updates) {
  const ticket = getTicket(ticketId);
  if (!ticket) return null;

  ticket.title = updates.title || ticket.title;
  ticket.description = updates.description || ticket.description;
  ticket.status = updates.status || ticket.status;
  ticket.updatedAt = new Date().toISOString();
  saveTickets(tickets);
  return ticket;
}

export function lockTicket(ticketId, { agentName, socketId }) {
  const ticket = getTicket(ticketId);
  if (!ticket) return null;

  const currentLock = ticket.lock;
  if (currentLock && currentLock.socketId !== socketId) {
    return ticket;
  }

  ticket.lock = {
    lockedBy: agentName,
    socketId,
    lockedAt: new Date().toISOString(),
  };
  return ticket;
}

export function unlockTicket(ticketId, { socketId } = {}) {
  const ticket = getTicket(ticketId);
  if (!ticket) return null;

  if (ticket.lock && (!socketId || ticket.lock.socketId === socketId)) {
    ticket.lock = null;
  }

  return ticket;
}

export function unlockTicketsForSocket(socketId) {
  return tickets.filter((ticket) => {
    if (ticket.lock?.socketId === socketId) {
      ticket.lock = null;
      return true;
    }

    return false;
  });
}
