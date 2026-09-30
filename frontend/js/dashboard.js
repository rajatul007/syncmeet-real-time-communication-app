/**
 * SyncMeet Dashboard Controller
 */

import { apiRequest, showToast, escapeHtml } from './api.js';
import { requireAuth, logoutUser } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth();
  if (!user) return;

  // Update User Header Info
  const userNameEl = document.getElementById('userName');
  const userEmailEl = document.getElementById('userEmail');
  const userAvatarEl = document.getElementById('userAvatar');
  const welcomeNameEl = document.getElementById('welcomeName');

  if (userNameEl) userNameEl.textContent = user.name;
  if (userEmailEl) userEmailEl.textContent = user.email;
  if (welcomeNameEl) welcomeNameEl.textContent = user.name.split(' ')[0];
  if (userAvatarEl) {
    userAvatarEl.src = user.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`;
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
    });
  }

  // Tab switching
  const tabHosted = document.getElementById('tabHosted');
  const tabHistory = document.getElementById('tabHistory');
  const hostedSection = document.getElementById('hostedSection');
  const historySection = document.getElementById('historySection');

  if (tabHosted && tabHistory) {
    tabHosted.addEventListener('click', () => {
      tabHosted.classList.add('active');
      tabHistory.classList.remove('active');
      hostedSection.style.display = 'grid';
      historySection.style.display = 'none';
    });

    tabHistory.addEventListener('click', () => {
      tabHistory.classList.add('active');
      tabHosted.classList.remove('active');
      hostedSection.style.display = 'none';
      historySection.style.display = 'block';
      loadHistory();
    });
  }

  // Quick Join Input
  const quickJoinBtn = document.getElementById('quickJoinBtn');
  const quickJoinInput = document.getElementById('quickJoinInput');

  if (quickJoinBtn && quickJoinInput) {
    const handleJoin = async () => {
      const meetingId = quickJoinInput.value.trim().toLowerCase();
      if (!meetingId) {
        showToast('Please enter a meeting ID or link.', 'warning');
        return;
      }
      // Extract meetingId if full URL entered
      const cleanId = meetingId.includes('/') ? meetingId.split('/').pop() : meetingId;
      try {
        quickJoinBtn.disabled = true;
        quickJoinBtn.textContent = 'Verifying...';
        await apiRequest(`/meetings/${cleanId}`);
        window.location.href = `/meeting/${cleanId}`;
      } catch (err) {
        showToast(err.message || 'Meeting not found or invalid.', 'error');
        quickJoinBtn.disabled = false;
        quickJoinBtn.textContent = 'Join';
      }
    };

    quickJoinBtn.addEventListener('click', handleJoin);
    quickJoinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleJoin();
    });
  }

  // Modals
  const createMeetingModal = document.getElementById('createMeetingModal');
  const openCreateModalBtn = document.getElementById('openCreateModalBtn');
  const closeCreateModalBtn = document.getElementById('closeCreateModalBtn');
  const createMeetingForm = document.getElementById('createMeetingForm');
  const createdSuccessBox = document.getElementById('createdSuccessBox');
  const copyMeetingLinkBtn = document.getElementById('copyMeetingLinkBtn');
  const startNewMeetingBtn = document.getElementById('startNewMeetingBtn');

  if (openCreateModalBtn && createMeetingModal) {
    openCreateModalBtn.addEventListener('click', () => {
      createMeetingModal.classList.add('active');
      createdSuccessBox.style.display = 'none';
      createMeetingForm.style.display = 'block';
      createMeetingForm.reset();
    });
  }

  if (closeCreateModalBtn && createMeetingModal) {
    closeCreateModalBtn.addEventListener('click', () => {
      createMeetingModal.classList.remove('active');
    });
  }

  if (createMeetingForm) {
    createMeetingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('meetingTitle').value;
      const description = document.getElementById('meetingDescription').value;

      const submitBtn = createMeetingForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';

      try {
        const res = await apiRequest('/meetings', {
          method: 'POST',
          body: JSON.stringify({ title, description })
        });

        if (res.success && res.meeting) {
          showToast('Meeting created successfully!', 'success');
          createMeetingForm.style.display = 'none';
          createdSuccessBox.style.display = 'block';

          const newMeetingId = res.meeting.meetingId;
          document.getElementById('newMeetingIdDisplay').textContent = newMeetingId;

          const meetingUrl = `${window.location.origin}/meeting/${newMeetingId}`;

          if (copyMeetingLinkBtn) {
            copyMeetingLinkBtn.onclick = () => {
              navigator.clipboard.writeText(meetingUrl);
              showToast('Meeting link copied to clipboard!', 'success');
            };
          }

          if (startNewMeetingBtn) {
            startNewMeetingBtn.onclick = () => {
              window.location.href = `/meeting/${newMeetingId}`;
            };
          }

          loadHostedMeetings();
        }
      } catch (err) {
        showToast(err.message || 'Failed to create meeting', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Meeting';
      }
    });
  }

  // Load Hosted Meetings
  async function loadHostedMeetings() {
    if (!hostedSection) return;
    try {
      const data = await apiRequest('/meetings');
      if (data.success && Array.isArray(data.meetings)) {
        if (data.meetings.length === 0) {
          hostedSection.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px; background: rgba(30, 41, 59, 0.4); border-radius: 16px; border: 1px dashed rgba(255, 255, 255, 0.1);">
              <svg style="margin: 0 auto 12px; opacity: 0.4;" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
              <h3 style="font-size: 16px; font-weight: 600; color: #f8fafc; margin-bottom: 6px;">No meetings yet</h3>
              <p style="font-size: 14px; color: #94a3b8; margin-bottom: 20px;">Start your first real-time collaborative video meeting right now.</p>
              <button id="emptyStateCreateBtn" class="btn-primary">New Meeting</button>
            </div>
          `;
          document.getElementById('emptyStateCreateBtn')?.addEventListener('click', () => {
            openCreateModalBtn?.click();
          });
          return;
        }

        hostedSection.innerHTML = '';
        data.meetings.forEach((m) => {
          const dateStr = new Date(m.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
          const timeStr = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const isEnded = m.status === 'ended';

          const card = document.createElement('div');
          card.className = 'meeting-card';
          card.innerHTML = `
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <span class="meeting-id-badge copy-id-btn" data-id="${m.meetingId}" title="Click to copy ID">
                  ${m.meetingId}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </span>
                <span style="font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; ${isEnded ? 'background: rgba(239, 68, 68, 0.15); color: #f87171;' : 'background: rgba(16, 185, 129, 0.15); color: #34d399;'}">
                  ${isEnded ? 'Ended' : 'Active'}
                </span>
              </div>
              <h3 style="font-size: 17px; font-weight: 600; color: #f8fafc; margin-bottom: 6px;">${escapeHtml(m.title)}</h3>
              <p style="font-size: 13px; color: #94a3b8; margin-bottom: 16px; line-height: 1.4;">${escapeHtml(m.description || 'No description provided')}</p>
            </div>
            <div>
              <div style="font-size: 12px; color: #64748b; margin-bottom: 16px; display: flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>${dateStr} at ${timeStr}</span>
              </div>
              <div style="display: flex; gap: 8px;">
                ${
                  !isEnded
                    ? `<a href="/meeting/${m.meetingId}" class="btn-primary" style="flex: 1; font-size: 13px; padding: 8px 14px;">
                        Start / Join
                      </a>`
                    : `<button disabled class="btn-secondary" style="flex: 1; font-size: 13px; opacity: 0.6; cursor: not-allowed;">
                        Ended
                      </button>`
                }
                <button class="btn-secondary share-link-btn" data-id="${m.meetingId}" style="padding: 8px 12px;" title="Copy Invite Link">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>
              </div>
            </div>
          `;

          // Copy ID click
          card.querySelector('.copy-id-btn')?.addEventListener('click', () => {
            navigator.clipboard.writeText(m.meetingId);
            showToast(`Meeting ID copied: ${m.meetingId}`, 'success');
          });

          // Share link click
          card.querySelector('.share-link-btn')?.addEventListener('click', () => {
            const url = `${window.location.origin}/meeting/${m.meetingId}`;
            navigator.clipboard.writeText(url);
            showToast('Meeting link copied to clipboard!', 'success');
          });

          hostedSection.appendChild(card);
        });
      }
    } catch (err) {
      console.error('[Dashboard] Error loading hosted meetings:', err);
    }
  }

  // Load Meeting History
  async function loadHistory() {
    if (!historySection) return;
    try {
      const data = await apiRequest('/meetings/history/all');
      if (data.success && Array.isArray(data.history)) {
        if (data.history.length === 0) {
          historySection.innerHTML = `
            <div style="text-align: center; padding: 48px; background: rgba(30, 41, 59, 0.4); border-radius: 16px; border: 1px dashed rgba(255, 255, 255, 0.1);">
              <p style="font-size: 14px; color: #94a3b8;">No meeting history found yet.</p>
            </div>
          `;
          return;
        }

        let tableHtml = `
          <div style="overflow-x: auto; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
              <thead>
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1); background: rgba(15, 23, 42, 0.6); color: #94a3b8;">
                  <th style="padding: 14px 20px;">Meeting</th>
                  <th style="padding: 14px 20px;">Meeting ID</th>
                  <th style="padding: 14px 20px;">Host</th>
                  <th style="padding: 14px 20px;">Joined At</th>
                  <th style="padding: 14px 20px;">Duration</th>
                </tr>
              </thead>
              <tbody>
        `;

        data.history.forEach((h) => {
          const joinedStr = new Date(h.joinedAt).toLocaleString();
          const mins = Math.floor((h.duration || 0) / 60);
          const secs = (h.duration || 0) % 60;
          const durationStr = `${mins}m ${secs}s`;

          tableHtml += `
            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #f8fafc;">
              <td style="padding: 14px 20px; font-weight: 500;">${escapeHtml(h.meeting?.title || 'SyncMeet')}</td>
              <td style="padding: 14px 20px; font-family: monospace; color: #60a5fa;">${escapeHtml(h.meeting?.meetingId || '')}</td>
              <td style="padding: 14px 20px; color: #cbd5e1;">${escapeHtml(h.meeting?.hostName || 'Host')}</td>
              <td style="padding: 14px 20px; color: #94a3b8;">${joinedStr}</td>
              <td style="padding: 14px 20px; color: #10b981;">${durationStr}</td>
            </tr>
          `;
        });

        tableHtml += `
              </tbody>
            </table>
          </div>
        `;
        historySection.innerHTML = tableHtml;
      }
    } catch (err) {
      console.error('[Dashboard] Error loading history:', err);
    }
  }

  // Initial load
  loadHostedMeetings();
});
