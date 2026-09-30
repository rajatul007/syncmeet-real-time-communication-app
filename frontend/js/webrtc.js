/**
 * SyncMeet WebRTC Manager
 * Manages full-mesh peer connections, media streams, screen sharing, and ICE signaling
 */

import { getSocket } from './socket.js';
import { showToast } from './api.js';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export class WebRTCManager {
  constructor(callbacks = {}) {
    this.localStream = null;
    this.screenStream = null;
    this.peers = new Map(); // socketId -> RTCPeerConnection
    this.isScreenSharing = false;
    this.isMuted = false;
    this.isVideoOff = false;
    this.currentUser = null;
    this.meetingId = null;

    // Callbacks
    this.onRemoteStreamAdded = callbacks.onRemoteStreamAdded || (() => {});
    this.onRemoteStreamRemoved = callbacks.onRemoteStreamRemoved || (() => {});
    this.onParticipantStateChange = callbacks.onParticipantStateChange || (() => {});
  }

  async initLocalMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      return this.localStream;
    } catch (err) {
      console.warn('[WebRTC] Camera/Mic access denied or unavailable, attempting audio-only or fallback track:', err);
      try {
        // Try audio only
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        showToast('Camera not detected or permission denied. Joined with microphone only.', 'warning');
        this.isVideoOff = true;
        return this.localStream;
      } catch (audioErr) {
        console.warn('[WebRTC] Mic also unavailable. Creating synthetic media tracks for connectivity:', audioErr);
        showToast('Microphone & Camera unavailable. Joined as listener/viewer.', 'warning');
        this.localStream = this.createEmptyStream();
        this.isMuted = true;
        this.isVideoOff = true;
        return this.localStream;
      }
    }
  }

  createEmptyStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const stream = canvas.captureStream(10);
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    const audioTrack = dest.stream.getAudioTracks()[0];
    if (audioTrack) {
      stream.addTrack(audioTrack);
    }
    return stream;
  }

  setupSignaling(socket, meetingId, user) {
    this.meetingId = meetingId;
    this.currentUser = user;

    // Receive list of existing participants when joining
    socket.on('participants-list', async ({ participants }) => {
      for (const p of participants) {
        // Initiator creates offer to existing participants
        await this.createPeerConnection(p.socketId, p, true);
      }
    });

    // Receive incoming offer
    socket.on('offer', async ({ from, offer, user: remoteUser }) => {
      let pc = this.peers.get(from);
      if (!pc) {
        pc = await this.createPeerConnection(from, remoteUser, false);
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {
          to: from,
          answer
        });
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
      }
    });

    // Receive incoming answer
    socket.on('answer', async ({ from, answer }) => {
      const pc = this.peers.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('[WebRTC] Error setting remote description from answer:', err);
        }
      }
    });

    // Receive incoming ICE Candidate
    socket.on('ice-candidate', async ({ from, candidate }) => {
      const pc = this.peers.get(from);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      }
    });

    // When participant leaves
    socket.on('participant-left', ({ socketId }) => {
      this.closePeer(socketId);
    });
  }

  async createPeerConnection(socketId, remoteUser, isInitiator) {
    const socket = getSocket();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peers.set(socketId, pc);

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Handle remote track arriving
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      this.onRemoteStreamAdded(socketId, remoteStream, remoteUser);
    };

    // Handle local ICE candidates to send to remote peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          to: socketId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(socketId);
      }
    };

    // If initiator, generate offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', {
          to: socketId,
          offer,
          user: this.currentUser
        });
      } catch (err) {
        console.error('[WebRTC] Failed to create offer:', err);
      }
    }

    return pc;
  }

  toggleMicrophone() {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    this.isMuted = !this.isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !this.isMuted;
    });

    const socket = getSocket();
    if (socket && this.meetingId) {
      socket.emit('toggle-microphone', {
        meetingId: this.meetingId,
        isMuted: this.isMuted
      });
    }

    return this.isMuted;
  }

  toggleCamera() {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return false;

    this.isVideoOff = !this.isVideoOff;
    videoTracks.forEach((track) => {
      track.enabled = !this.isVideoOff;
    });

    const socket = getSocket();
    if (socket && this.meetingId) {
      socket.emit('toggle-camera', {
        meetingId: this.meetingId,
        isVideoOff: this.isVideoOff
      });
    }

    return this.isVideoOff;
  }

  async startScreenShare() {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      const screenVideoTrack = this.screenStream.getVideoTracks()[0];
      this.isScreenSharing = true;

      // Replace video track in all active RTCRtpSenders
      this.peers.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender && screenVideoTrack) {
          sender.replaceTrack(screenVideoTrack);
        }
      });

      // Handle user stopping screen share from browser banner ("Stop sharing")
      screenVideoTrack.onended = () => {
        this.stopScreenShare();
      };

      const socket = getSocket();
      if (socket && this.meetingId) {
        socket.emit('screen-share-started', { meetingId: this.meetingId });
      }

      return this.screenStream;
    } catch (err) {
      console.warn('[WebRTC] Screen sharing cancelled or denied:', err);
      this.isScreenSharing = false;
      return null;
    }
  }

  stopScreenShare() {
    if (!this.isScreenSharing) return;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    this.isScreenSharing = false;

    // Revert to local camera track
    if (this.localStream) {
      const cameraTrack = this.localStream.getVideoTracks()[0];
      this.peers.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender && cameraTrack) {
          sender.replaceTrack(cameraTrack);
        }
      });
    }

    const socket = getSocket();
    if (socket && this.meetingId) {
      socket.emit('screen-share-stopped', { meetingId: this.meetingId });
    }
  }

  closePeer(socketId) {
    const pc = this.peers.get(socketId);
    if (pc) {
      pc.close();
      this.peers.delete(socketId);
    }
    this.onRemoteStreamRemoved(socketId);
  }

  cleanup() {
    this.stopScreenShare();
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
  }
}
