/**
 * ✅ SSE hub for real-time notifications.
 * Tracks all connected EventSource clients per user and lets any service
 * push events to a user instantly (instead of waiting for the next poll).
 */
const clients = new Map(); // userId -> Set<ServerResponse>

export function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}

export function removeClient(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

export function getConnectedCount(userId) {
  return clients.get(userId)?.size || 0;
}

/**
 * Push an SSE event to every open connection of a user.
 * Safe to call from anywhere (services, transactions, background jobs).
 */
export function publishToUser(userId, event, data) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      /* connection died — cleanup happens on 'close' */
    }
  }
}

// ✅ Keep-alive: comment ping every 25s so proxies don't close idle streams
setInterval(() => {
  for (const set of clients.values()) {
    for (const res of set) {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        /* ignore */
      }
    }
  }
}, 25_000).unref();
