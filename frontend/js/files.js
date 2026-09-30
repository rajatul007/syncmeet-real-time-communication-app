/**
 * SyncMeet File Sharing Module
 */

import { getSocket } from './socket.js';
import { apiRequest, getToken, showToast, escapeHtml, showConfirmDialog } from './api.js';

export class FileManager {
  constructor(options = {}) {
    this.meetingId = options.meetingId;
    this.currentUser = options.currentUser;
    this.isHost = options.isHost || false;
    this.container = options.container;
    this.fileCountBadge = options.fileCountBadge;
    this.files = [];

    this.setupSocket();
    this.loadFiles();
  }

  async loadFiles() {
    try {
      const data = await apiRequest(`/meetings/${this.meetingId}/files`);
      if (data.success && Array.isArray(data.files)) {
        this.files = data.files;
        this.renderFiles();
      }
    } catch (err) {
      console.warn('[Files] Could not load files:', err);
    }
  }

  setupSocket() {
    const socket = getSocket();
    if (!socket) return;

    socket.on('file-shared', (file) => {
      this.files.unshift(file);
      this.renderFiles();
      showToast(`${file.uploadedBy.name} shared a new file: ${file.originalName}`, 'info');
    });
  }

  async uploadFile(fileInput) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      showToast('File exceeds 25MB limit.', 'error');
      fileInput.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    showToast('Uploading file...', 'info', 2000);

    try {
      const response = await fetch(`/api/meetings/${this.meetingId}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const res = await response.json();
      if (!response.ok || !res.success) {
        throw new Error(res.message || 'File upload failed');
      }

      showToast('File uploaded successfully!', 'success');
      fileInput.value = '';

      // Broadcast file to all participants
      const socket = getSocket();
      if (socket) {
        socket.emit('file-shared', {
          meetingId: this.meetingId,
          file: res.file
        });
      }
    } catch (err) {
      console.error('[Files] Upload error:', err);
      showToast(err.message || 'Failed to upload file.', 'error');
    }
  }

  async deleteFile(fileId) {
    const ok = await showConfirmDialog('Delete File', 'Are you sure you want to delete this shared file from the meeting?', 'Delete', true);
    if (!ok) return;

    try {
      const res = await apiRequest(`/files/${fileId}`, { method: 'DELETE' });
      if (res.success) {
        this.files = this.files.filter((f) => f._id !== fileId);
        this.renderFiles();
        showToast('File removed.', 'info');
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete file.', 'error');
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  renderFiles() {
    if (!this.container) return;

    if (this.fileCountBadge) {
      this.fileCountBadge.textContent = this.files.length;
      this.fileCountBadge.style.display = this.files.length > 0 ? 'flex' : 'none';
    }

    if (this.files.length === 0) {
      this.container.innerHTML = `
        <div style="text-align: center; color: #94a3b8; padding: 32px 16px; font-size: 13px;">
          <svg style="margin: 0 auto 12px; opacity: 0.5;" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
          No files shared yet in this meeting.
        </div>
      `;
      return;
    }

    const token = getToken();
    this.container.innerHTML = '';

    this.files.forEach((file) => {
      const isOwner = file.uploadedBy.userId === this.currentUser._id;
      const canDelete = isOwner || this.isHost;
      const downloadUrl = `/api/files/${file._id}/download?token=${token}`;

      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; overflow: hidden; flex: 1;">
          <div style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 8px; border-radius: 8px; flex-shrink: 0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
          </div>
          <div style="overflow: hidden; flex: 1;">
            <div style="font-size: 13px; font-weight: 500; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(file.originalName)}">
              ${escapeHtml(file.originalName)}
            </div>
            <div style="font-size: 11px; color: #94a3b8; display: flex; gap: 8px; margin-top: 2px;">
              <span>${this.formatBytes(file.size)}</span>
              <span>•</span>
              <span>by ${escapeHtml(file.uploadedBy.name)}</span>
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <a href="${downloadUrl}" target="_blank" download="${escapeHtml(file.originalName)}" class="btn-secondary" style="padding: 6px 10px; font-size: 12px;" title="Download">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </a>
          ${
            canDelete
              ? `<button class="btn-secondary delete-file-btn" data-id="${file._id}" style="padding: 6px 10px; font-size: 12px; color: #ef4444;" title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>`
              : ''
          }
        </div>
      `;

      const deleteBtn = item.querySelector('.delete-file-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this.deleteFile(file._id));
      }

      this.container.appendChild(item);
    });
  }
}
