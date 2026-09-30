/**
 * SyncMeet Core Meeting Room Controller
 */

import { apiRequest, showToast, escapeHtml, showConfirmDialog } from './api.js';
import { requireAuth } from './auth.js';
import { getSocket, waitForSocket } from './socket.js';
import { WebRTCManager } from './webrtc.js';
import { ChatManager } from './chat.js';
import { WhiteboardManager } from './whiteboard.js';
import { FileManager } from './files.js';

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth();
  if (!user) return;

  // Extract meetingId from /meeting/:meetingId
  const pathParts = window.location.pathname.split('/');
  const meetingId = pathParts[pathParts.length - 1];

  if (!meetingId) {
    showToast('Invalid meeting URL', 'error');
    setTimeout(() => (window.location.href = '/dashboard'), 1500);
    return;
  }

  // Meeting state
  let meetingData = null;
  let isHost = false;
  let participantsMap = new Map(); // socketId -> participant data
  let activePanel = null; // 'chat' | 'participants' | 'whiteboard' | 'files' | 'settings' | null

  // DOM Elements
  const meetingTitleEl = document.getElementById('meetingTitleDisplay');
  const meetingIdEl = document.getElementById('meetingIdDisplay');
  const participantCountEl = document.getElementById('participantCountBadge');
  const meetingTimerEl = document.getElementById('meetingTimer');
  const videoGrid = document.getElementById('videoGrid');
  const localVideo = document.getElementById('localVideo');
  const localAvatarFallback = document.getElementById('localAvatarFallback');
  const localNameTag = document.getElementById('localNameTag');
  const localMicIndicator = document.getElementById('localMicIndicator');
  const whiteboardStage = document.getElementById('whiteboardStage');

  // Control Buttons
  const micBtn = document.getElementById('micBtn');
  const camBtn = document.getElementById('camBtn');
  const shareBtn = document.getElementById('shareBtn');
  const chatBtn = document.getElementById('chatBtn');
  const whiteboardBtn = document.getElementById('whiteboardBtn');
  const participantsBtn = document.getElementById('participantsBtn');
  const filesBtn = document.getElementById('filesBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const leaveBtn = document.getElementById('leaveBtn');
  const endMeetingBtn = document.getElementById('endMeetingBtn');

  // Side Panels
  const sidePanels = {
    chat: document.getElementById('chatPanel'),
    participants: document.getElementById('participantsPanel'),
    files: document.getElementById('filesPanel'),
    settings: document.getElementById('settingsPanel')
  };

  // Badges
  const chatUnreadBadge = document.getElementById('chatUnreadBadge');
  const fileCountBadge = document.getElementById('fileCountBadge');
  const panelParticipantCount = document.getElementById('panelParticipantCount');

  // Setup meeting timer
  let elapsedSeconds = 0;
  setInterval(() => {
    elapsedSeconds++;
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    if (meetingTimerEl) {
      meetingTimerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }, 1000);

  // Validate and Join Meeting via REST API
  try {
    const res = await apiRequest(`/meetings/${meetingId}/join`, { method: 'POST' });
    meetingData = res.meeting;
    isHost = meetingData.host && meetingData.host._id === user._id;

    if (meetingTitleEl) meetingTitleEl.textContent = meetingData.title;
    if (meetingIdEl) meetingIdEl.textContent = meetingData.meetingId;
    if (localNameTag) localNameTag.textContent = `${user.name} (You)`;
    if (localAvatarFallback) {
      localAvatarFallback.querySelector('img').src = user.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`;
      localAvatarFallback.querySelector('span').textContent = user.name;
    }

    if (isHost && endMeetingBtn) {
      endMeetingBtn.style.display = 'inline-flex';
    }
  } catch (err) {
    showToast(err.message || 'Cannot join meeting', 'error');
    setTimeout(() => (window.location.href = '/dashboard'), 2000);
    return;
  }

  // Copy Meeting ID or Link
  const copyMeetingIdBtn = document.getElementById('copyMeetingIdBtn');
  if (copyMeetingIdBtn) {
    copyMeetingIdBtn.addEventListener('click', () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      showToast('Meeting link copied to clipboard!', 'success');
    });
  }

  // Initialize Socket.IO
  const socket = (await waitForSocket()) || getSocket();

  // Initialize WebRTC Manager
  const webrtc = new WebRTCManager({
    onRemoteStreamAdded: (socketId, stream, remoteUser) => {
      addRemoteVideo(socketId, stream, remoteUser);
      updateGridClass();
    },
    onRemoteStreamRemoved: (socketId) => {
      removeRemoteVideo(socketId);
      updateGridClass();
    }
  });

  // Initialize Local Media Stream
  try {
    const localStream = await webrtc.initLocalMedia();
    if (localStream && localVideo) {
      localVideo.srcObject = localStream;
      localVideo.muted = true; // prevent local audio loopback
    }
  } catch (e) {
    console.error('[Meeting] Local media error:', e);
  }

  // Join Socket Room
  socket.emit('join-meeting', {
    meetingId,
    user: {
      userId: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      isMuted: webrtc.isMuted,
      isVideoOff: webrtc.isVideoOff
    }
  });

  // Setup WebRTC Signaling Listeners
  webrtc.setupSignaling(socket, meetingId, user);

  // Initialize Feature Modules
  const chatContainer = document.getElementById('chatMessagesContainer');
  const chatManager = new ChatManager({
    meetingId,
    currentUser: user,
    container: chatContainer,
    unreadBadge: chatUnreadBadge
  });

  const chatInput = document.getElementById('chatMessageInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  if (chatSendBtn && chatInput) {
    const doSend = () => {
      chatManager.sendMessage(chatInput.value);
      chatInput.value = '';
    };
    chatSendBtn.addEventListener('click', doSend);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') doSend();
    });
  }

  // Whiteboard Manager
  const canvasEl = document.getElementById('whiteboardCanvas');
  const whiteboardManager = new WhiteboardManager(canvasEl, meetingId);

  // Whiteboard Toolbar
  const wbToolPen = document.getElementById('wbToolPen');
  const wbToolEraser = document.getElementById('wbToolEraser');
  const wbToolLine = document.getElementById('wbToolLine');
  const wbToolRect = document.getElementById('wbToolRect');
  const wbToolCircle = document.getElementById('wbToolCircle');
  const wbToolText = document.getElementById('wbToolText');
  const wbColorPicker = document.getElementById('wbColorPicker');
  const wbSizeSlider = document.getElementById('wbSizeSlider');
  const wbUndoBtn = document.getElementById('wbUndoBtn');
  const wbRedoBtn = document.getElementById('wbRedoBtn');
  const wbClearBtn = document.getElementById('wbClearBtn');
  const wbDownloadBtn = document.getElementById('wbDownloadBtn');

  function setWhiteboardTool(tool, btn) {
    whiteboardManager.currentTool = tool;
    document.querySelectorAll('.wb-tool-btn').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }

  if (wbToolPen) wbToolPen.addEventListener('click', () => setWhiteboardTool('pen', wbToolPen));
  if (wbToolEraser) wbToolEraser.addEventListener('click', () => setWhiteboardTool('eraser', wbToolEraser));
  if (wbToolLine) wbToolLine.addEventListener('click', () => setWhiteboardTool('line', wbToolLine));
  if (wbToolRect) wbToolRect.addEventListener('click', () => setWhiteboardTool('rect', wbToolRect));
  if (wbToolCircle) wbToolCircle.addEventListener('click', () => setWhiteboardTool('circle', wbToolCircle));
  if (wbToolText) wbToolText.addEventListener('click', () => setWhiteboardTool('text', wbToolText));

  if (wbColorPicker) {
    wbColorPicker.addEventListener('input', (e) => {
      whiteboardManager.currentColor = e.target.value;
    });
  }
  if (wbSizeSlider) {
    wbSizeSlider.addEventListener('input', (e) => {
      whiteboardManager.currentSize = parseInt(e.target.value, 10);
    });
  }
  if (wbUndoBtn) wbUndoBtn.addEventListener('click', () => whiteboardManager.undo());
  if (wbRedoBtn) wbRedoBtn.addEventListener('click', () => whiteboardManager.redo());
  if (wbClearBtn) {
    wbClearBtn.addEventListener('click', async () => {
      const ok = await showConfirmDialog('Clear Whiteboard', 'Clear the entire whiteboard for all participants in this meeting?', 'Clear All', true);
      if (ok) {
        whiteboardManager.clearBoard(true);
      }
    });
  }
  if (wbDownloadBtn) wbDownloadBtn.addEventListener('click', () => whiteboardManager.downloadImage());

  // Files Manager
  const filesContainer = document.getElementById('filesListContainer');
  const fileUploadInput = document.getElementById('fileUploadInput');
  const fileManager = new FileManager({
    meetingId,
    currentUser: user,
    isHost,
    container: filesContainer,
    fileCountBadge
  });

  if (fileUploadInput) {
    fileUploadInput.addEventListener('change', () => {
      fileManager.uploadFile(fileUploadInput);
    });
  }

  // Socket: Participants presence
  socket.on('participants-list', ({ participants }) => {
    participantsMap.clear();
    participants.forEach((p) => participantsMap.set(p.socketId, p));
    updateParticipantsUI();
    updateGridClass();
  });

  socket.on('participant-joined', ({ participant }) => {
    participantsMap.set(participant.socketId, participant);
    showToast(`${participant.name} joined`, 'info', 3000);
    updateParticipantsUI();
    updateGridClass();
  });

  socket.on('participant-left', ({ socketId, name }) => {
    participantsMap.delete(socketId);
    if (name) showToast(`${name} left`, 'info', 3000);
    updateParticipantsUI();
    updateGridClass();
  });

  socket.on('participant-mic-toggled', ({ socketId, isMuted }) => {
    const p = participantsMap.get(socketId);
    if (p) p.isMuted = isMuted;
    const badge = document.querySelector(`.remote-mic-badge[data-socket="${socketId}"]`);
    if (badge) {
      badge.style.display = isMuted ? 'flex' : 'none';
    }
    updateParticipantsUI();
  });

  socket.on('participant-camera-toggled', ({ socketId, isVideoOff }) => {
    const p = participantsMap.get(socketId);
    if (p) p.isVideoOff = isVideoOff;
    const fallback = document.querySelector(`.remote-avatar-fallback[data-socket="${socketId}"]`);
    if (fallback) {
      if (isVideoOff) {
        fallback.classList.remove('hidden');
      } else {
        fallback.classList.add('hidden');
      }
    }
    updateParticipantsUI();
  });

  socket.on('participant-screen-share-started', ({ name }) => {
    showToast(`${name} started screen sharing.`, 'info');
  });

  socket.on('participant-screen-share-stopped', () => {
    showToast('Screen sharing stopped.', 'info');
  });

  socket.on('meeting-ended', () => {
    showToast('The host has ended this meeting.', 'warning', 5000);
    setTimeout(() => {
      cleanupAndExit();
    }, 2000);
  });

  socket.on('participant-kicked', () => {
    showToast('You have been removed from this meeting by the host.', 'error', 5000);
    setTimeout(() => {
      cleanupAndExit();
    }, 1500);
  });

  // Update Dynamic Participants List in sidebar
  function updateParticipantsUI() {
    const count = participantsMap.size + 1; // +1 for self
    if (participantCountEl) participantCountEl.textContent = `${count} ${count === 1 ? 'person' : 'people'}`;
    if (panelParticipantCount) panelParticipantCount.textContent = count;

    const listEl = document.getElementById('participantsList');
    if (!listEl) return;

    listEl.innerHTML = '';

    // Self Item
    const selfItem = document.createElement('div');
    selfItem.className = 'file-item';
    selfItem.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="${user.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`}" style="width: 32px; height: 32px; border-radius: 50%;" />
        <div>
          <div style="font-size: 13.5px; font-weight: 600; color: #f8fafc;">
            ${escapeHtml(user.name)} <span style="font-size: 11px; color: #60a5fa;">(You)</span>
            ${isHost ? '<span style="font-size: 10px; background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 4px; margin-left: 4px;">Host</span>' : ''}
          </div>
          <div style="font-size: 11px; color: #94a3b8;">${escapeHtml(user.email)}</div>
        </div>
      </div>
      <div style="display: flex; gap: 6px;">
        <span style="font-size: 11px; color: ${webrtc.isMuted ? '#ef4444' : '#10b981'};">${webrtc.isMuted ? 'Muted' : 'Mic On'}</span>
      </div>
    `;
    listEl.appendChild(selfItem);

    // Remote Participants
    participantsMap.forEach((p, socketId) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${p.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.name)}`}" style="width: 32px; height: 32px; border-radius: 50%;" />
          <div>
            <div style="font-size: 13.5px; font-weight: 600; color: #f8fafc;">
              ${escapeHtml(p.name)}
              ${p.isHost ? '<span style="font-size: 10px; background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 4px; margin-left: 4px;">Host</span>' : ''}
            </div>
            <div style="font-size: 11px; color: #94a3b8;">${escapeHtml(p.email)}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 11px; color: ${p.isMuted ? '#ef4444' : '#10b981'};">${p.isMuted ? 'Muted' : 'Active'}</span>
          ${
            isHost
              ? `<button class="btn-danger kick-btn" data-socket="${socketId}" style="padding: 4px 8px; font-size: 11px;" title="Remove from meeting">
                  Remove
                </button>`
              : ''
          }
        </div>
      `;

      const kickBtn = item.querySelector('.kick-btn');
      if (kickBtn) {
        kickBtn.addEventListener('click', async () => {
          const ok = await showConfirmDialog('Remove Participant', `Remove ${p.name} from the meeting?`, 'Remove', true);
          if (ok) {
            socket.emit('kick-participant', { meetingId, targetSocketId: socketId });
          }
        });
      }

      listEl.appendChild(item);
    });
  }

  // Video Grid layout class helper
  function updateGridClass() {
    if (!videoGrid) return;
    const count = participantsMap.size + 1;
    videoGrid.className = 'video-grid';
    if (count === 1) videoGrid.classList.add('grid-1');
    else if (count === 2) videoGrid.classList.add('grid-2');
    else if (count <= 4) videoGrid.classList.add('grid-4');
    else if (count <= 6) videoGrid.classList.add('grid-6');
    else videoGrid.classList.add('grid-many');
  }

  // Remote Video rendering
  function addRemoteVideo(socketId, stream, remoteUser) {
    let box = document.getElementById(`videoBox_${socketId}`);
    if (!box) {
      box = document.createElement('div');
      box.id = `videoBox_${socketId}`;
      box.className = 'video-box';

      const displayName = remoteUser?.name || 'Participant';
      const avatarUrl = remoteUser?.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;

      box.innerHTML = `
        <video id="video_${socketId}" autoplay playsinline></video>
        <div class="video-avatar-fallback remote-avatar-fallback ${remoteUser?.isVideoOff ? '' : 'hidden'}" data-socket="${socketId}">
          <img src="${avatarUrl}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.1);" />
          <span style="font-size: 14px; font-weight: 500; color: #f8fafc;">${escapeHtml(displayName)}</span>
        </div>
        <div class="video-meta-tag">
          <span>${escapeHtml(displayName)}</span>
        </div>
        <div class="video-status-indicators">
          <div class="indicator-badge remote-mic-badge muted" data-socket="${socketId}" style="display: ${remoteUser?.isMuted ? 'flex' : 'none'};">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path></svg>
          </div>
        </div>
      `;

      videoGrid.appendChild(box);
    }

    const videoEl = box.querySelector('video');
    if (videoEl) {
      videoEl.srcObject = stream;
    }
  }

  function removeRemoteVideo(socketId) {
    const box = document.getElementById(`videoBox_${socketId}`);
    if (box) {
      box.remove();
    }
  }

  // Control Bar Event Handlers
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      const isMuted = webrtc.toggleMicrophone();
      if (isMuted) {
        micBtn.classList.add('danger');
        micBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path></svg>`;
        if (localMicIndicator) localMicIndicator.style.display = 'flex';
        showToast('Microphone muted', 'info', 2000);
      } else {
        micBtn.classList.remove('danger');
        micBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
        if (localMicIndicator) localMicIndicator.style.display = 'none';
        showToast('Microphone unmuted', 'info', 2000);
      }
      updateParticipantsUI();
    });
  }

  if (camBtn) {
    camBtn.addEventListener('click', () => {
      const isVideoOff = webrtc.toggleCamera();
      if (isVideoOff) {
        camBtn.classList.add('danger');
        camBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 21l-5.64-5.64M16 16v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1M23 7l-7 5 7 5V7z"></path></svg>`;
        if (localAvatarFallback) localAvatarFallback.classList.remove('hidden');
        showToast('Camera turned off', 'info', 2000);
      } else {
        camBtn.classList.remove('danger');
        camBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
        if (localAvatarFallback) localAvatarFallback.classList.add('hidden');
        showToast('Camera turned on', 'info', 2000);
      }
      updateParticipantsUI();
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      if (!webrtc.isScreenSharing) {
        const stream = await webrtc.startScreenShare();
        if (stream) {
          shareBtn.classList.add('active');
          if (localVideo) {
            localVideo.srcObject = stream;
            localVideo.classList.remove('local-mirrored');
          }
          showToast('Screen sharing started', 'success');
        }
      } else {
        webrtc.stopScreenShare();
        shareBtn.classList.remove('active');
        if (localVideo && webrtc.localStream) {
          localVideo.srcObject = webrtc.localStream;
          localVideo.classList.add('local-mirrored');
        }
        showToast('Screen sharing stopped', 'info');
      }
    });
  }

  // Side Panel Toggle System
  function togglePanel(panelName) {
    const isCurrentlyActive = activePanel === panelName;

    // Close all panels
    Object.keys(sidePanels).forEach((key) => {
      if (sidePanels[key]) sidePanels[key].classList.add('hidden');
    });
    chatBtn?.classList.remove('active');
    participantsBtn?.classList.remove('active');
    filesBtn?.classList.remove('active');
    settingsBtn?.classList.remove('active');
    chatManager.setPanelOpen(false);

    if (isCurrentlyActive) {
      activePanel = null;
    } else {
      activePanel = panelName;
      if (sidePanels[panelName]) sidePanels[panelName].classList.remove('hidden');

      if (panelName === 'chat') {
        chatBtn?.classList.add('active');
        chatManager.setPanelOpen(true);
      } else if (panelName === 'participants') {
        participantsBtn?.classList.add('active');
      } else if (panelName === 'files') {
        filesBtn?.classList.add('active');
      } else if (panelName === 'settings') {
        settingsBtn?.classList.add('active');
      }
    }
  }

  if (chatBtn) chatBtn.addEventListener('click', () => togglePanel('chat'));
  if (participantsBtn) participantsBtn.addEventListener('click', () => togglePanel('participants'));
  if (filesBtn) filesBtn.addEventListener('click', () => togglePanel('files'));
  if (settingsBtn) settingsBtn.addEventListener('click', () => togglePanel('settings'));

  // Whiteboard Toggle (Swaps Main Stage between Video Grid and Whiteboard Canvas)
  let isWhiteboardOpen = false;
  if (whiteboardBtn && whiteboardStage && videoGrid) {
    whiteboardBtn.addEventListener('click', () => {
      isWhiteboardOpen = !isWhiteboardOpen;
      if (isWhiteboardOpen) {
        whiteboardBtn.classList.add('active');
        whiteboardStage.style.display = 'flex';
        videoGrid.style.display = 'none';
        whiteboardManager.resizeCanvas();
        showToast('Whiteboard active. All participants collaborate live.', 'info', 3000);
      } else {
        whiteboardBtn.classList.remove('active');
        whiteboardStage.style.display = 'none';
        videoGrid.style.display = 'grid';
        updateGridClass();
      }
    });
  }

  // Close buttons on side panels
  document.querySelectorAll('.close-panel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      togglePanel(activePanel);
    });
  });

  // Leave Meeting
  async function cleanupAndExit() {
    webrtc.cleanup();
    socket.emit('leave-meeting');
    try {
      await apiRequest(`/meetings/${meetingId}/leave`, { method: 'POST' }).catch(() => {});
    } finally {
      window.location.href = '/dashboard';
    }
  }

  if (leaveBtn) {
    leaveBtn.addEventListener('click', async () => {
      const ok = await showConfirmDialog('Leave Meeting', 'Are you sure you want to leave this meeting?', 'Leave Meeting', true);
      if (ok) {
        cleanupAndExit();
      }
    });
  }

  // Host End Meeting for All
  if (endMeetingBtn) {
    endMeetingBtn.addEventListener('click', async () => {
      const ok = await showConfirmDialog('End Meeting for All', 'End this meeting for everyone? All participants will be disconnected.', 'End Meeting', true);
      if (ok) {
        try {
          await apiRequest(`/meetings/${meetingId}/end`, { method: 'POST' });
          socket.emit('end-meeting', { meetingId });
          showToast('Meeting ended.', 'info');
          setTimeout(() => cleanupAndExit(), 1000);
        } catch (err) {
          showToast(err.message || 'Failed to end meeting', 'error');
        }
      }
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // If typing in input or textarea, ignore
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (e.key === 'm' || e.key === 'M') {
      micBtn?.click();
    } else if (e.key === 'v' || e.key === 'V') {
      camBtn?.click();
    } else if (e.key === 'c' || e.key === 'C') {
      chatBtn?.click();
    } else if (e.key === 'w' || e.key === 'W') {
      whiteboardBtn?.click();
    } else if (e.key === 'p' || e.key === 'P') {
      participantsBtn?.click();
    } else if (e.key === 'Escape' && activePanel) {
      togglePanel(activePanel);
    }
  });

  // Handle window unload
  window.addEventListener('beforeunload', () => {
    webrtc.cleanup();
    socket.emit('leave-meeting');
  });
});
