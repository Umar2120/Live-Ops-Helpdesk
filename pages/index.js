import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || apiBaseUrl || '/';
const socketPath = process.env.NEXT_PUBLIC_SOCKET_PATH || '/api/socket';
const statuses = ['open', 'pending', 'resolved'];
const subjectOptions = [
  'Billing portal issue',
  'Login or password problem',
  'Subscription upgrade request',
  'API integration failure',
  'Performance degradation',
  'Security review question',
];

function makeAgentName() {
  return `Agent ${Math.floor(100 + Math.random() * 900)}`;
}

function apiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

export default function Home() {
  const [agentName, setAgentName] = useState('');
  const [tickets, setTickets] = useState([]);
  const [connectionLost, setConnectionLost] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [newTicketId, setNewTicketId] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [lockMessage, setLockMessage] = useState('');
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', status: 'open' });
  const [draft, setDraft] = useState({ title: '', description: '', status: 'open' });
  const socketRef = useRef(null);
  const agentNameRef = useRef('');
  const cursorDotRef = useRef(null);
  const cursorRingRef = useRef(null);

  useEffect(() => {
    let mouseX = 0;
    let mouseY = 0;
    let ringX = 0;
    let ringY = 0;
    let frameId = 0;

    const moveCursor = (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;

      if (cursorDotRef.current) {
        cursorDotRef.current.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      }
    };

    const animateRing = () => {
      ringX += (mouseX - ringX) * 0.16;
      ringY += (mouseY - ringY) * 0.16;

      if (cursorRingRef.current) {
        cursorRingRef.current.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      }

      frameId = window.requestAnimationFrame(animateRing);
    };

    const setCursorActive = (event) => {
      const target = event.target;
      const isInteractive = target.closest?.('button, a, input, textarea, select, .ticket-row');
      document.body.classList.toggle('cursor-active', Boolean(isInteractive));
    };

    window.addEventListener('mousemove', moveCursor);
    window.addEventListener('mouseover', setCursorActive);
    animateRing();

    return () => {
      window.removeEventListener('mousemove', moveCursor);
      window.removeEventListener('mouseover', setCursorActive);
      window.cancelAnimationFrame(frameId);
      document.body.classList.remove('cursor-active');
    };
  }, []);

  useEffect(() => {
    const storedName = window.localStorage.getItem('agentName') || makeAgentName();
    window.localStorage.setItem('agentName', storedName);
    agentNameRef.current = storedName;
    setAgentName(storedName);
  }, []);

  useEffect(() => {
    agentNameRef.current = agentName;
  }, [agentName]);

  useEffect(() => {
    const initialAgentName =
      window.localStorage.getItem('agentName') || agentNameRef.current || makeAgentName();
    window.localStorage.setItem('agentName', initialAgentName);
    agentNameRef.current = initialAgentName;
    setAgentName(initialAgentName);

    async function loadTickets() {
      const res = await fetch(apiUrl('/api/tickets'));
      const data = await res.json();
      setTickets(data);
    }

    async function initSocket() {
      await fetch(apiUrl('/api/socket'));
      const socket = io(socketUrl, {
        path: socketPath,
        reconnection: true,
        transports: ['websocket', 'polling'],
        withCredentials: true,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setConnectionLost(false);
        setSocketId(socket.id);
        socket.emit('agent:identify', { agentName: agentNameRef.current });
      });

      socket.on('disconnect', () => {
        setSocketId(null);
        setConnectionLost(true);
      });

      socket.on('connect_error', () => {
        setConnectionLost(true);
      });

      socket.on('ticket:list', (incomingTickets) => {
        setTickets(incomingTickets);
      });

      socket.on('ticket:created', (ticket) => {
        setTickets((current) => [ticket, ...current.filter((item) => item.id !== ticket.id)]);
        setNewTicketId(ticket.id);
        window.setTimeout(() => setNewTicketId(null), 450);
      });

      socket.on('ticket:updated', (ticket) => {
        setTickets((current) => current.map((item) => (item.id === ticket.id ? ticket : item)));
      });

      socket.on('ticket:locked', (ticket) => {
        setTickets((current) => current.map((item) => (item.id === ticket.id ? ticket : item)));
      });

      socket.on('ticket:unlocked', (ticket) => {
        setTickets((current) => current.map((item) => (item.id === ticket.id ? ticket : item)));
      });
    }

    loadTickets();
    initSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const sortedTickets = useMemo(
    () => [...tickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [tickets]
  );

  const activeTicket = tickets.find((ticket) => ticket.id === activeTicketId);
  const activeLockIsMine =
    Boolean(activeTicket?.lock?.socketId && activeTicket.lock.socketId === socketId) ||
    Boolean(activeTicket?.lock?.lockedBy && activeTicket.lock.lockedBy === agentName);

  function updateTicketInState(ticket) {
    setTickets((current) => current.map((item) => (item.id === ticket.id ? ticket : item)));
  }

  async function handleCreate(event) {
    event.preventDefault();
    setCreateError('');

    if (!form.title.trim() || !form.description.trim()) {
      setCreateError('Subject and description are required.');
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch(apiUrl('/api/tickets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          status: form.status,
        }),
      });

      if (!response.ok) {
        setCreateError('Ticket could not be created. Please try again.');
        return;
      }

      const createdTicket = await response.json();
      setTickets((current) => [
        createdTicket,
        ...current.filter((ticket) => ticket.id !== createdTicket.id),
      ]);
      setNewTicketId(createdTicket.id);
      window.setTimeout(() => setNewTicketId(null), 450);
      setForm({ title: '', description: '', status: 'open' });
      setSubjectMenuOpen(false);
    } catch (error) {
      setCreateError('Ticket could not be created. Check the server connection.');
    } finally {
      setIsCreating(false);
    }
  }

  async function openTicket(ticket) {
    setLockMessage('');
    setActiveTicketId(ticket.id);
    setDraft({
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
    });

    if (!socketRef.current?.connected) {
      setLockMessage('Waiting for the socket connection before editing.');
      return;
    }

    const result = await new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        resolve({ ok: false, error: 'Lock request timed out.' });
      }, 4000);

      socketRef.current.emit(
        'lock_ticket',
        {
          ticketId: ticket.id,
          agentName: agentNameRef.current,
        },
        (response) => {
          window.clearTimeout(timer);
          resolve(response);
        }
      );
    });

    if (result.ticket) {
      updateTicketInState(result.ticket);
      setDraft({
        title: result.ticket.title,
        description: result.ticket.description,
        status: result.ticket.status,
      });
    }

    if (!result.ok) {
      setLockMessage(result.lockedBy ? `Read only: locked by ${result.lockedBy}.` : result.error || 'Unable to lock ticket.');
    }
  }

  function closeTicket() {
    if (activeTicketId && activeLockIsMine) {
      socketRef.current?.emit('unlock_ticket', {
        ticketId: activeTicketId,
        agentName: agentNameRef.current,
      });
    }
    setLockMessage('');
    setActiveTicketId(null);
  }

  async function saveTicket() {
    if (!activeTicket || !activeLockIsMine) return;

    const payload = {
      ticketId: activeTicket.id,
      title: draft.title.trim(),
      description: draft.description.trim(),
      status: draft.status,
    };

    if (socketRef.current?.connected) {
      const result = await new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          resolve({ ok: false, error: 'Socket update timed out.' });
        }, 5000);

        socketRef.current.emit('update_ticket', payload, (response) => {
          window.clearTimeout(timer);
          resolve(response);
        });
      });

      if (result.ok) {
        updateTicketInState(result.ticket);
        socketRef.current?.emit('unlock_ticket', {
          ticketId: activeTicket.id,
          agentName: agentNameRef.current,
        });
        setActiveTicketId(null);
      }

      return;
    }

    const response = await fetch(apiUrl(`/api/tickets/${activeTicket.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.title.trim(),
        description: draft.description.trim(),
        status: draft.status,
      }),
    });

    if (response.ok) {
      const updatedTicket = await response.json();
      updateTicketInState(updatedTicket);
      socketRef.current?.emit('unlock_ticket', {
        ticketId: activeTicket.id,
        agentName: agentNameRef.current,
      });
      setActiveTicketId(null);
    }
  }

  function handleAgentNameChange(event) {
    const nextName = event.target.value;
    agentNameRef.current = nextName;
    setAgentName(nextName);
    window.localStorage.setItem('agentName', nextName);
    socketRef.current?.emit('agent:identify', { agentName: nextName });
  }

  return (
    <>
      <Head>
        <title>Live Ticket Board</title>
        <meta
          name="description"
          content="A reactive Socket.io support dashboard with live ticket locking and connection state."
        />
      </Head>

      <div className="cursor-dot" ref={cursorDotRef} />
      <div className="cursor-ring" ref={cursorRingRef} />

      <main className="page">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        {connectionLost && (
          <div className="connection-banner">Connection Lost: Reconnecting...</div>
        )}

        <header className="topbar">
          <div>
            <p className="eyebrow">Global Support Operations</p>
            <h1>Live Ticket Board</h1>
            <p className="hero-copy">
              Real-time queue control with Socket.io presence, edit locks, and instant global updates.
            </p>
          </div>
          <label className="agent-field">
            Agent Name
            <input value={agentName} onChange={handleAgentNameChange} />
          </label>
        </header>

        <section className="layout">
          <form className="panel create-panel" onSubmit={handleCreate}>
            <div>
              <p className="section-label">Create Ticket</p>
              <h2>Open a new support case</h2>
            </div>

            <label>
              Subject
              <div className="subject-combobox">
                <input
                  value={form.title}
                  onBlur={() => window.setTimeout(() => setSubjectMenuOpen(false), 120)}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  onFocus={() => setSubjectMenuOpen(true)}
                  placeholder="Choose or type a subject"
                />
                {subjectMenuOpen && (
                  <div className="subject-options">
                    {subjectOptions.map((subject) => (
                      <button
                        key={subject}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setForm((current) => ({ ...current, title: subject }));
                          setSubjectMenuOpen(false);
                        }}
                      >
                        {subject}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            <label>
              Description
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Describe the issue and current impact"
              />
            </label>

            <label>
              Status
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            {createError && <p className="form-error">{createError}</p>}

            <button className="primary-button" type="submit" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create ticket'}
            </button>
          </form>

          <section className="panel board-panel">
            <div className="board-header">
              <div>
                <p className="section-label">Active Queue</p>
                <h2>{sortedTickets.length} tickets live</h2>
              </div>
              <div className="board-tools">
                <span className="metric-pill">{sortedTickets.filter((ticket) => ticket.lock).length} locked</span>
                <span className="live-pill">Socket.io connected</span>
              </div>
            </div>

            <div className="ticket-list">
              {sortedTickets.length === 0 ? (
                <p className="empty-state">No tickets yet. Create one to broadcast it instantly.</p>
              ) : (
                sortedTickets.map((ticket) => {
                  const lockedBy = ticket.lock?.lockedBy;
                  const lockedByMe = lockedBy === agentName;
                  const lockedByOther = Boolean(lockedBy && !lockedByMe);

                  return (
                    <article
                      className={`ticket-row ${lockedByOther ? 'locked' : ''} ${
                        ticket.id === newTicketId ? 'slide-in' : ''
                      }`}
                      key={ticket.id}
                      onClick={() => openTicket(ticket)}
                    >
                      <div className="ticket-main">
                        <div className="ticket-title-line">
                          <h3>{ticket.title}</h3>
                          {lockedBy && <span className="lock-icon" aria-label="locked">🔒</span>}
                        </div>
                        <p>{ticket.description}</p>
                        {lockedBy && (
                          <span className="lock-copy">
                            Locked by {lockedByMe ? `${lockedBy} (you)` : lockedBy}
                          </span>
                        )}
                      </div>

                      <div className="ticket-actions">
                        <span className={`status ${ticket.status}`}>{ticket.status}</span>
                        <button
                          type="button"
                          disabled={lockedByOther}
                          onClick={(event) => {
                            event.stopPropagation();
                            openTicket(ticket);
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </section>

        {activeTicket && (
          <div className="modal-backdrop" role="presentation">
            <section className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
              <div className="editor-header">
                <div>
                  <p className="section-label">{activeLockIsMine ? 'Editing' : 'Read Only'}</p>
                  <h2 id="editor-title">{activeTicket.title}</h2>
                </div>
                {activeTicket.lock?.lockedBy && (
                  <span className="editor-lock">Locked by {activeTicket.lock.lockedBy}</span>
                )}
              </div>

              {lockMessage && <p className="lock-message">{lockMessage}</p>}

              <label>
                Subject
                <input
                  disabled={!activeLockIsMine}
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                />
              </label>

              <label>
                Description
                <textarea
                  disabled={!activeLockIsMine}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </label>

              <label>
                Status
                <select
                  disabled={!activeLockIsMine}
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <div className="editor-actions">
                <button className="ghost-button" type="button" onClick={closeTicket}>
                  Close
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!activeLockIsMine || !draft.title.trim() || !draft.description.trim()}
                  onClick={saveTicket}
                >
                  Save
                </button>
              </div>
            </section>
          </div>
        )}
      </main>

      <style jsx>{`
        :global(body) {
          margin: 0;
          background:
            radial-gradient(circle at 8% 8%, rgba(56, 189, 248, 0.18), transparent 30%),
            radial-gradient(circle at 88% 12%, rgba(168, 85, 247, 0.18), transparent 28%),
            linear-gradient(135deg, #07111f 0%, #0c1222 46%, #111827 100%);
          color: #e5eefb;
          cursor: none;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        :global(html),
        :global(body) {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        :global(html::-webkit-scrollbar),
        :global(body::-webkit-scrollbar) {
          display: none;
        }

        :global(body.cursor-active) .cursor-ring {
          width: 54px;
          height: 54px;
          border-color: rgba(125, 211, 252, 0.78);
          background: rgba(125, 211, 252, 0.08);
        }

        :global(body.cursor-active) .cursor-dot {
          width: 10px;
          height: 10px;
          background: #f8fafc;
        }

        * {
          box-sizing: border-box;
        }

        .cursor-dot,
        .cursor-ring {
          position: fixed;
          top: 0;
          left: 0;
          pointer-events: none;
          z-index: 1000;
          will-change: transform;
        }

        .cursor-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #38bdf8;
          box-shadow: 0 0 24px rgba(56, 189, 248, 0.9);
          transition: width 180ms ease, height 180ms ease, background 180ms ease;
        }

        .cursor-ring {
          width: 34px;
          height: 34px;
          border: 1px solid rgba(56, 189, 248, 0.45);
          border-radius: 999px;
          transition: width 180ms ease, height 180ms ease, border-color 180ms ease, background 180ms ease;
        }

        .page {
          position: relative;
          min-height: 100vh;
          padding: 32px;
          overflow: hidden;
        }

        .ambient {
          position: fixed;
          z-index: -1;
          border-radius: 999px;
          filter: blur(4px);
          opacity: 0.7;
          pointer-events: none;
        }

        .ambient-one {
          width: 360px;
          height: 360px;
          left: -120px;
          top: 120px;
          background: radial-gradient(circle, rgba(45, 212, 191, 0.22), transparent 66%);
        }

        .ambient-two {
          width: 420px;
          height: 420px;
          right: -160px;
          bottom: 40px;
          background: radial-gradient(circle, rgba(129, 140, 248, 0.2), transparent 68%);
        }

        .connection-banner {
          position: sticky;
          top: 0;
          z-index: 20;
          margin: -32px -32px 28px;
          padding: 14px 32px;
          background: linear-gradient(90deg, #dc2626, #991b1b);
          color: white;
          font-weight: 800;
          letter-spacing: 0.01em;
          box-shadow: 0 18px 48px rgba(220, 38, 38, 0.26);
        }

        .topbar {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          margin: 0 auto 30px;
          max-width: 1240px;
        }

        .eyebrow,
        .section-label {
          margin: 0 0 6px;
          color: #67e8f9;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        h1,
        h2,
        h3,
        p {
          margin-top: 0;
        }

        h1 {
          margin-bottom: 0;
          font-size: clamp(42px, 6vw, 76px);
          line-height: 1;
          letter-spacing: 0;
          max-width: 760px;
          background: linear-gradient(120deg, #ffffff, #bfdbfe 54%, #67e8f9);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        h2 {
          margin-bottom: 0;
          font-size: 22px;
          line-height: 1.2;
        }

        .hero-copy {
          max-width: 580px;
          margin: 16px 0 0;
          color: #9fb0c8;
          font-size: 16px;
          line-height: 1.7;
        }

        label,
        .agent-field {
          display: grid;
          gap: 8px;
          color: #b9c6d8;
          font-size: 13px;
          font-weight: 800;
        }

        input,
        textarea,
        select {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.74);
          color: #e5eefb;
          font: inherit;
          font-weight: 500;
          padding: 12px 13px;
          outline: none;
          cursor: text;
        }

        select {
          cursor: pointer;
        }

        textarea {
          min-height: 112px;
          resize: vertical;
        }

        input:focus,
        textarea:focus,
        select:focus {
          border-color: rgba(103, 232, 249, 0.68);
          box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.13);
        }

        input:disabled,
        textarea:disabled,
        select:disabled {
          background: rgba(51, 65, 85, 0.55);
          color: #94a3b8;
        }

        .agent-field input {
          width: 220px;
          background: rgba(15, 23, 42, 0.62);
        }

        .subject-combobox {
          position: relative;
        }

        .subject-options {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 8px);
          z-index: 12;
          display: grid;
          gap: 6px;
          max-height: 230px;
          overflow: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.98);
          box-shadow: 0 22px 56px rgba(0, 0, 0, 0.38);
          padding: 8px;
        }

        .subject-options::-webkit-scrollbar {
          display: none;
        }

        .subject-options button {
          width: 100%;
          border: 1px solid transparent;
          background: transparent;
          color: #dbeafe;
          cursor: pointer;
          font-size: 13px;
          padding: 10px 11px;
          text-align: left;
        }

        .subject-options button:hover {
          border-color: rgba(125, 211, 252, 0.24);
          background: rgba(14, 165, 233, 0.16);
          transform: none;
        }

        .form-error {
          margin: -4px 0 0;
          border: 1px solid rgba(248, 113, 113, 0.28);
          border-radius: 12px;
          background: rgba(248, 113, 113, 0.1);
          color: #fecaca;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.5;
          padding: 10px 12px;
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
          gap: 20px;
          max-width: 1240px;
          margin: 0 auto;
          align-items: start;
        }

        .panel {
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.62));
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 22px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(22px);
        }

        .create-panel {
          display: grid;
          gap: 18px;
          padding: 24px;
          position: sticky;
          top: 24px;
        }

        .board-panel {
          min-height: 520px;
          overflow: hidden;
        }

        .board-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 24px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        }

        .board-tools {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .live-pill,
        .metric-pill {
          flex-shrink: 0;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
          padding: 8px 12px;
        }

        .live-pill {
          border: 1px solid rgba(34, 197, 94, 0.34);
          border-radius: 999px;
          background: rgba(22, 163, 74, 0.14);
          color: #86efac;
        }

        .live-pill::before {
          content: '';
          display: inline-block;
          width: 7px;
          height: 7px;
          margin-right: 8px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow: 0 0 14px rgba(34, 197, 94, 0.9);
        }

        .metric-pill {
          border: 1px solid rgba(125, 211, 252, 0.24);
          background: rgba(14, 165, 233, 0.12);
          color: #bae6fd;
        }

        .ticket-list {
          display: grid;
        }

        .empty-state {
          margin: 0;
          padding: 44px 22px;
          color: #94a3b8;
          text-align: center;
        }

        .ticket-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 18px;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
          background: rgba(15, 23, 42, 0.22);
          cursor: none;
          transition: background 180ms ease, border-color 180ms ease, opacity 180ms ease, transform 180ms ease;
        }

        .ticket-row:hover {
          background: rgba(30, 41, 59, 0.68);
          transform: translateY(-2px);
        }

        .ticket-row.locked {
          background: rgba(71, 85, 105, 0.54);
          color: #94a3b8;
        }

        .ticket-row.locked:hover {
          background: rgba(71, 85, 105, 0.62);
        }

        .ticket-title-line {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ticket-row h3 {
          margin-bottom: 6px;
          font-size: 18px;
          line-height: 1.25;
        }

        .ticket-row p {
          margin-bottom: 8px;
          color: #9fb0c8;
          line-height: 1.55;
        }

        .lock-icon {
          display: inline-grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.16);
          font-size: 15px;
        }

        .lock-copy {
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 900;
        }

        .ticket-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .status {
          min-width: 76px;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 900;
          text-align: center;
          text-transform: uppercase;
        }

        .status.open {
          background: rgba(59, 130, 246, 0.16);
          color: #93c5fd;
        }

        .status.pending {
          background: rgba(245, 158, 11, 0.17);
          color: #fcd34d;
        }

        .status.resolved {
          background: rgba(34, 197, 94, 0.16);
          color: #86efac;
        }

        button {
          border: 0;
          border-radius: 12px;
          cursor: none;
          font: inherit;
          font-size: 14px;
          font-weight: 900;
          padding: 11px 16px;
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, opacity 160ms ease;
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .primary-button {
          background: linear-gradient(135deg, #38bdf8, #6366f1);
          color: white;
          box-shadow: 0 16px 36px rgba(56, 189, 248, 0.22);
        }

        .primary-button:hover:not(:disabled) {
          background: linear-gradient(135deg, #67e8f9, #818cf8);
        }

        .ghost-button,
        .ticket-actions button {
          border: 1px solid rgba(148, 163, 184, 0.26);
          background: rgba(15, 23, 42, 0.62);
          color: #e5eefb;
        }

        .ticket-actions button:hover:not(:disabled),
        .ghost-button:hover:not(:disabled) {
          background: rgba(30, 41, 59, 0.9);
        }

        .slide-in {
          animation: slide-in 260ms ease-out;
        }

        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateY(-16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 30;
          display: grid;
          place-items: center;
          padding: 24px;
          background: rgba(2, 6, 23, 0.72);
          backdrop-filter: blur(12px);
        }

        .editor {
          width: min(620px, 100%);
          display: grid;
          gap: 18px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.9));
          padding: 24px;
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.42);
        }

        .editor-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .editor-lock {
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.14);
          color: #cbd5e1;
          flex-shrink: 0;
          font-size: 12px;
          font-weight: 900;
          padding: 8px 11px;
        }

        .lock-message {
          margin: -4px 0 0;
          border: 1px solid rgba(251, 191, 36, 0.28);
          border-radius: 12px;
          background: rgba(251, 191, 36, 0.1);
          color: #fde68a;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.5;
          padding: 10px 12px;
        }

        .editor-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        @media (max-width: 860px) {
          :global(body) {
            cursor: auto;
          }

          .cursor-dot,
          .cursor-ring {
            display: none;
          }

          .page {
            padding: 18px;
          }

          .connection-banner {
            margin: -18px -18px 20px;
            padding: 12px 18px;
          }

          .topbar,
          .board-header,
          .ticket-row,
          .editor-header {
            align-items: stretch;
            flex-direction: column;
          }

          .topbar,
          .layout {
            display: grid;
            grid-template-columns: 1fr;
          }

          .agent-field input {
            width: 100%;
          }

          .create-panel {
            position: static;
          }

          .ticket-row {
            grid-template-columns: 1fr;
          }

          .ticket-actions {
            justify-content: space-between;
          }

          button,
          input,
          textarea,
          select,
          .ticket-row {
            cursor: pointer;
          }
        }
      `}</style>
    </>
  );
}
