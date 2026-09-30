/**
 * SyncMeet API Client & In-App UI Dialog Utility
 */

const API_BASE = '/api';

export function getToken() {
  return localStorage.getItem('syncmeet_token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('syncmeet_token', token);
  } else {
    localStorage.removeItem('syncmeet_token');
  }
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('syncmeet_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem('syncmeet_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('syncmeet_user');
  }
}

export function clearAuth() {
  localStorage.removeItem('syncmeet_token');
  localStorage.removeItem('syncmeet_user');
}

/**
 * Universal API Request Helper
 */
export async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If not FormData, default to application/json
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // Check for 401 Unauthorized
    if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
      clearAuth();
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login?expired=1';
      }
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }
    return data;
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Modern Toast Notifications
 */
export function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  // Icon based on type
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else if (type === 'warning') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  } else {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `
    <div style="flex-shrink: 0;">${iconSvg}</div>
    <div style="flex: 1;">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-fadeout');
    setTimeout(() => {
      toast.remove();
    }, 250);
  }, duration);
}

/**
 * In-App Confirmation Dialog (Replaces window.confirm for iframe compatibility)
 */
export function showConfirmDialog(title, message, confirmText = 'Confirm', isDanger = false) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop active';
    backdrop.style.zIndex = '999999';

    backdrop.innerHTML = `
      <div class="modal-content" style="max-width: 420px; padding: 24px;">
        <h3 style="font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 8px;">${escapeHtml(title)}</h3>
        <p style="font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px;">${escapeHtml(message)}</p>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button id="cancelModalBtn" class="btn-secondary" style="padding: 8px 16px; font-size: 13px;">Cancel</button>
          <button id="confirmModalBtn" class="${isDanger ? 'btn-danger' : 'btn-primary'}" style="padding: 8px 18px; font-size: 13px;">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const cleanup = (result) => {
      backdrop.classList.remove('active');
      setTimeout(() => backdrop.remove(), 200);
      resolve(result);
    };

    backdrop.querySelector('#confirmModalBtn').addEventListener('click', () => cleanup(true));
    backdrop.querySelector('#cancelModalBtn').addEventListener('click', () => cleanup(false));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup(false);
    });
  });
}

/**
 * In-App Prompt Dialog (Replaces window.prompt for iframe compatibility)
 */
export function showPromptDialog(title, placeholder = '', defaultValue = '') {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop active';
    backdrop.style.zIndex = '999999';

    backdrop.innerHTML = `
      <div class="modal-content" style="max-width: 420px; padding: 24px;">
        <h3 style="font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 8px;">${escapeHtml(title)}</h3>
        <input type="text" id="promptInput" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 10px 12px; color: #fff; font-size: 14px; margin-bottom: 20px; outline: none;" />
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button id="cancelPromptBtn" class="btn-secondary" style="padding: 8px 16px; font-size: 13px;">Cancel</button>
          <button id="submitPromptBtn" class="btn-primary" style="padding: 8px 18px; font-size: 13px;">Submit</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    const input = backdrop.querySelector('#promptInput');
    input.focus();
    input.select();

    const cleanup = (val) => {
      backdrop.classList.remove('active');
      setTimeout(() => backdrop.remove(), 200);
      resolve(val);
    };

    backdrop.querySelector('#submitPromptBtn').addEventListener('click', () => cleanup(input.value.trim() || null));
    backdrop.querySelector('#cancelPromptBtn').addEventListener('click', () => cleanup(null));
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') cleanup(input.value.trim() || null);
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup(null);
    });
  });
}

export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
