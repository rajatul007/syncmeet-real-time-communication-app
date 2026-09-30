import { Server as SocketIOServer, Socket } from 'socket.io';
import MessageModel from '../models/Message.ts';
import MeetingModel from '../models/Meeting.ts';

interface ParticipantState {
  socketId: string;
  userId: string;
  name: string;
  email: string;
  profileImage?: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isHost: boolean;
}

// meetingId -> Map<socketId, ParticipantState>
const rooms = new Map<string, Map<string, ParticipantState>>();

// meetingId -> array of draw operations
const whiteboardRooms = new Map<string, any[]>();

export function setupSocketHandler(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    let currentMeetingId: string | null = null;
    let currentUser: ParticipantState | null = null;

    // Join a meeting room
    socket.on('join-meeting', async (data: { meetingId: string; user: { userId: string; name: string; email: string; profileImage?: string; isMuted?: boolean; isVideoOff?: boolean } }) => {
      const { meetingId, user } = data;
      if (!meetingId || !user || !user.userId) return;

      currentMeetingId = meetingId;
      const roomName = `meeting_${meetingId}`;
      socket.join(roomName);

      if (!rooms.has(meetingId)) {
        rooms.set(meetingId, new Map());
      }
      if (!whiteboardRooms.has(meetingId)) {
        whiteboardRooms.set(meetingId, []);
      }

      const roomParticipants = rooms.get(meetingId)!;

      // Check if user is host
      let isHost = false;
      try {
        const meeting = await MeetingModel.findOne({ meetingId });
        if (meeting && meeting.host && meeting.host._id === user.userId) {
          isHost = true;
        }
      } catch (err) {
        console.error('[Socket] Check host error:', err);
      }

      currentUser = {
        socketId: socket.id,
        userId: user.userId,
        name: user.name || 'Participant',
        email: user.email || '',
        profileImage: user.profileImage,
        isMuted: !!user.isMuted,
        isVideoOff: !!user.isVideoOff,
        isScreenSharing: false,
        isHost
      };

      roomParticipants.set(socket.id, currentUser);

      // Send existing participants to the joining user
      const existingParticipants = Array.from(roomParticipants.values()).filter((p) => p.socketId !== socket.id);
      socket.emit('participants-list', {
        participants: existingParticipants,
        currentSocketId: socket.id,
        isHost
      });

      // Notify others that a new participant joined
      socket.to(roomName).emit('participant-joined', {
        participant: currentUser
      });

      // Send current whiteboard history to the new user
      const history = whiteboardRooms.get(meetingId) || [];
      if (history.length > 0) {
        socket.emit('whiteboard-init', { history });
      }

      // Add system message in chat
      try {
        const sysMsg = await MessageModel.create({
          meeting: meetingId,
          sender: {
            userId: 'system',
            name: 'System'
          },
          message: `${currentUser.name} joined the meeting`,
          isSystem: true
        });
        io.to(roomName).emit('chat-message', sysMsg);
      } catch (e) {
        console.error('[Socket] SysMsg error:', e);
      }
    });

    // WebRTC Signaling: Offer
    socket.on('offer', (data: { to: string; offer: any; user: any }) => {
      io.to(data.to).emit('offer', {
        from: socket.id,
        offer: data.offer,
        user: currentUser
      });
    });

    // WebRTC Signaling: Answer
    socket.on('answer', (data: { to: string; answer: any }) => {
      io.to(data.to).emit('answer', {
        from: socket.id,
        answer: data.answer
      });
    });

    // WebRTC Signaling: ICE Candidate
    socket.on('ice-candidate', (data: { to: string; candidate: any }) => {
      io.to(data.to).emit('ice-candidate', {
        from: socket.id,
        candidate: data.candidate
      });
    });

    // Toggle Microphone state
    socket.on('toggle-microphone', (data: { meetingId: string; isMuted: boolean }) => {
      if (currentUser) {
        currentUser.isMuted = data.isMuted;
        socket.to(`meeting_${data.meetingId}`).emit('participant-mic-toggled', {
          socketId: socket.id,
          userId: currentUser.userId,
          isMuted: data.isMuted
        });
      }
    });

    // Toggle Camera state
    socket.on('toggle-camera', (data: { meetingId: string; isVideoOff: boolean }) => {
      if (currentUser) {
        currentUser.isVideoOff = data.isVideoOff;
        socket.to(`meeting_${data.meetingId}`).emit('participant-camera-toggled', {
          socketId: socket.id,
          userId: currentUser.userId,
          isVideoOff: data.isVideoOff
        });
      }
    });

    // Screen sharing started
    socket.on('screen-share-started', (data: { meetingId: string }) => {
      if (currentUser) {
        currentUser.isScreenSharing = true;
        socket.to(`meeting_${data.meetingId}`).emit('participant-screen-share-started', {
          socketId: socket.id,
          userId: currentUser.userId,
          name: currentUser.name
        });
      }
    });

    // Screen sharing stopped
    socket.on('screen-share-stopped', (data: { meetingId: string }) => {
      if (currentUser) {
        currentUser.isScreenSharing = false;
        socket.to(`meeting_${data.meetingId}`).emit('participant-screen-share-stopped', {
          socketId: socket.id,
          userId: currentUser.userId
        });
      }
    });

    // Real-Time Chat message
    socket.on('chat-message', async (data: { meetingId: string; message: string; sender: any }) => {
      if (!data.meetingId || !data.message) return;
      try {
        const savedMessage = await MessageModel.create({
          meeting: data.meetingId,
          sender: {
            userId: data.sender.userId,
            name: data.sender.name,
            profileImage: data.sender.profileImage
          },
          message: data.message.trim(),
          isSystem: false
        });

        io.to(`meeting_${data.meetingId}`).emit('chat-message', savedMessage);
      } catch (err) {
        console.error('[Socket Chat] Failed to save/broadcast message:', err);
      }
    });

    // Collaborative Whiteboard: Draw event
    socket.on('whiteboard-draw', (data: { meetingId: string; drawAction: any }) => {
      if (!data.meetingId || !data.drawAction) return;
      const history = whiteboardRooms.get(data.meetingId);
      if (history) {
        history.push(data.drawAction);
        // Bound history to prevent unlimited memory growth
        if (history.length > 3000) {
          history.splice(0, 1000);
        }
      }
      // Broadcast to all other participants in the room
      socket.to(`meeting_${data.meetingId}`).emit('whiteboard-draw', data.drawAction);
    });

    // Collaborative Whiteboard: Clear event
    socket.on('whiteboard-clear', (data: { meetingId: string }) => {
      if (!data.meetingId) return;
      whiteboardRooms.set(data.meetingId, []);
      socket.to(`meeting_${data.meetingId}`).emit('whiteboard-clear');
    });

    // File Shared Notification
    socket.on('file-shared', (data: { meetingId: string; file: any }) => {
      if (!data.meetingId || !data.file) return;
      io.to(`meeting_${data.meetingId}`).emit('file-shared', data.file);
    });

    // Host ends meeting for everyone
    socket.on('end-meeting', async (data: { meetingId: string }) => {
      if (!data.meetingId) return;
      try {
        await MeetingModel.updateOne({ meetingId: data.meetingId }, { status: 'ended', endedAt: new Date() });
      } catch (e) {
        console.error('[Socket End Meeting] Error:', e);
      }
      io.to(`meeting_${data.meetingId}`).emit('meeting-ended');
      rooms.delete(data.meetingId);
      whiteboardRooms.delete(data.meetingId);
    });

    // Host kicks participant
    socket.on('kick-participant', (data: { meetingId: string; targetSocketId: string }) => {
      if (!currentUser?.isHost) return;
      io.to(data.targetSocketId).emit('participant-kicked');
      const roomParticipants = rooms.get(data.meetingId);
      if (roomParticipants) {
        const target = roomParticipants.get(data.targetSocketId);
        roomParticipants.delete(data.targetSocketId);
        if (target) {
          io.to(`meeting_${data.meetingId}`).emit('participant-left', {
            socketId: data.targetSocketId,
            userId: target.userId,
            name: target.name
          });
        }
      }
    });

    // Leave meeting explicitly
    socket.on('leave-meeting', () => {
      handleLeave();
    });

    // Disconnect event
    socket.on('disconnect', () => {
      handleLeave();
    });

    function handleLeave() {
      if (!currentMeetingId) return;
      const meetingId = currentMeetingId;
      const roomParticipants = rooms.get(meetingId);

      if (roomParticipants && roomParticipants.has(socket.id)) {
        const leavingUser = roomParticipants.get(socket.id);
        roomParticipants.delete(socket.id);

        socket.to(`meeting_${meetingId}`).emit('participant-left', {
          socketId: socket.id,
          userId: leavingUser?.userId,
          name: leavingUser?.name
        });

        // Add system message in chat
        if (leavingUser) {
          MessageModel.create({
            meeting: meetingId,
            sender: {
              userId: 'system',
              name: 'System'
            },
            message: `${leavingUser.name} left the meeting`,
            isSystem: true
          }).then((msg) => {
            socket.to(`meeting_${meetingId}`).emit('chat-message', msg);
          }).catch(() => {});
        }

        if (roomParticipants.size === 0) {
          rooms.delete(meetingId);
        }
      }

      currentMeetingId = null;
      currentUser = null;
    }
  });
}
