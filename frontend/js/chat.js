/**
 * SyncMeet Real-Time Chat Module
 */

import { getSocket } from './socket.js';
import { apiRequest, escapeHtml } from './api.js';

export class ChatManager {
  constructor(options = {}) {
    this.meetingId = options.meetingId;
    this.currentUser = options.currentUser;
    this.container = options.container;
    this.unreadBadge = options.unreadBadge;
    this.isPanelOpen = options.isPanelOpen || false;
    this.unreadCount = 0;

    this.setupSocket();
    this.loadHistory();
  }

  setPanelOpen(isOpen) {
    this.isPanelOpen = isOpen;
    if (isOpen) {
      this.unreadCount = 0;
      this.updateBadge();
      this.scrollToBottom();
    }
  }

  updateBadge() {
    if (!this.unreadBadge) return;
    if (this.unreadCount > 0) {
      this.unreadBadge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
      this.unreadBadge.style.display = 'flex';
    } else {
      this.unreadBadge.style.display = 'none';
    }
  }

  async loadHistory() {
    try {
      const data = await apiRequest(`/meetings/${this.meetingId}/messages`);
      if (data.success && Array.isArray(data.messages)) {
        this.container.innerHTML = '';
        data.messages.forEach((msg) => this.renderMessage(msg));
        this.scrollToBottom();
      }
    } catch (err) {
      console.warn('[Chat] Could not load message history:', err);
    }
  }

  setupSocket() {
    const socket = getSocket();
    if (!socket) return;

    socket.on('chat-message', (message) => {
      this.renderMessage(message);
      this.scrollToBottom();

      if (!this.isPanelOpen && !message.isSystem && message.sender.userId !== this.currentUser._id) {
        this.unreadCount++;
        this.updateBadge();
      }
    });
  }

  sendMessage(text) {
    if (!text || !text.trim()) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit('chat-message', {
      meetingId: this.meetingId,
      message: text.trim(),
      sender: {
        userId: this.currentUser._id,
        name: this.currentUser.name,
        profileImage: this.currentUser.profileImage
      }
    });
  }

  renderMessage(msg) {
    if (!this.container) return;

    const timeStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (msg.isSystem) {
      const systemEl = document.createElement('div');
      systemEl.className = 'chat-bubble system';
      systemEl.innerHTML = `<span>${escapeHtml(msg.message)}</span>`;
      this.container.appendChild(systemEl);
      return;
    }

    const isMine = msg.sender.userId === this.currentUser._id;
    const messageEl = document.createElement('div');
    messageEl.className = `chat-bubble ${isMine ? 'mine' : 'other'}`;

    const senderHeader = !isMine
      ? `<div style="font-size: 11px; font-weight: 600; color: #60a5fa; margin-bottom: 3px;">${escapeHtml(msg.sender.name)}</div>`
      : '';

    messageEl.innerHTML = `
      ${senderHeader}
      <div>${escapeHtml(msg.message)}</div>
      <div style="font-size: 10px; opacity: 0.75; text-align: right; margin-top: 4px;">${timeStr}</div>
    `;

    this.container.appendChild(messageEl);
  }

  scrollToBottom() {
    if (this.container) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }
}
