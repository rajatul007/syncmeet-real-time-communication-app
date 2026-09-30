/**
 * SyncMeet Socket.IO Client Wrapper
 */

let socket = null;

export function initSocket() {
  if (socket) return socket;

  if (typeof window.io === 'function') {
    socket = window.io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    return socket;
  }

  return null;
}

export function getSocket() {
  if (!socket) {
    return initSocket();
  }
  return socket;
}

export async function waitForSocket(maxWaitMs = 5000) {
  if (socket) return socket;
  const start = Date.now();

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const s = getSocket();
      if (s || Date.now() - start > maxWaitMs) {
        clearInterval(interval);
        resolve(s);
      }
    }, 50);
  });
}

export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
