# SyncMeet — Real-Time Video Conferencing & Collaboration Platform

SyncMeet is a production-grade, full-stack real-time communication platform built to deliver ultra-low latency audio/video conferencing, interactive screen sharing, real-time messaging, secure file transfers, and a live synchronized collaborative whiteboard.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [System Architecture](#system-architecture)
4. [Technology Stack](#technology-stack)
5. [WebRTC Architecture & Implementation](#webrtc-architecture--implementation)
6. [Socket.IO Signaling & Real-Time Events](#socketio-signaling--real-time-events)
7. [Database Schema & Persistence](#database-schema--persistence)
8. [REST API Documentation](#rest-api-documentation)
9. [Socket Event Specifications](#socket-event-specifications)
10. [Security & Protection](#security--protection)
11. [Installation & Setup](#installation--setup)
12. [Environment Variables](#environment-variables)
13. [Future Enhancements](#future-enhancements)
14. [License](#license)

---

## 1. Project Overview

SyncMeet demonstrates modern software engineering patterns across frontend, backend, peer-to-peer networking, and collaborative systems. It provides an intuitive, high-performance meeting environment suitable for engineering standups, remote pair programming, classroom discussions, and design reviews.

---

## 2. Key Features

- **Peer-to-Peer Video & Audio**: Full-mesh WebRTC topology delivering low latency without media proxy overhead.
- **Dynamic Adaptive Video Grid**: Automatic responsive layouts supporting 1 to 6+ simultaneous participants with active speaker detection and camera-off avatar fallbacks.
- **Hardware Display Screen Sharing**: Native `getDisplayMedia()` integration with seamless track replacement across all active peer connections.
- **Collaborative Whiteboard**: Synchronized HTML5 Canvas with Pen, Eraser, Line, Rectangle, Circle, and Text tools, custom color palette, stroke sizing, undo/redo stacks, and PNG export.
- **Real-Time Meeting Chat**: Live message delivery via Socket.IO with MongoDB persistence and system event notifications.
- **Secure File Sharing**: In-meeting file distribution supporting documents, PDFs, and images up to 25MB with sanitized filenames and tokenized download streams.
- **Participant Presence & Host Controls**: Real-time microphone/camera/screen state indicators with host capabilities to remove attendees or end the meeting for all participants.
- **Meeting History & Duration Tracking**: Detailed logs of meetings joined and duration timestamps.
- **Keyboard Shortcuts**: Quick hotkeys (`M` for mic, `V` for camera, `C` for chat, `W` for whiteboard, `P` for participants, `Esc` to close panels).

---

## 3. System Architecture

```
                    +--------------------------------+
                    |        SyncMeet Client         |
                    |  (HTML5 / CSS3 / Vanilla JS)   |
                    +---------------+----------------+
                                    |
            +-----------------------+-----------------------+
            | HTTP / REST                                  | WebSockets / Socket.IO
            v                                              v
+-----------------------+                      +-----------------------+
|  Express.js Server    |                      |  Socket.IO Signaling  |
| - JWT Auth Middleware |                      | - Room Management     |
| - Meeting Management  |                      | - SDP Offer / Answer  |
| - File Upload Handler |                      | - ICE Candidate Relay |
| - Message APIs        |                      | - Whiteboard Sync     |
+-----------+-----------+                      +-----------+-----------+
            |                                              |
            v                                              |
+-----------------------+                                  |
|   Database Layer      |                                  |
| - MongoDB / Mongoose  |<---------------------------------+
| - Fallback Local Store| (Chat message persistence & history)
+-----------------------+
                                    |
                                    | WebRTC Peer-to-Peer
                                    v
                    +--------------------------------+
                    |  Peer A <=============> Peer B |
                    |      (DTLS-SRTP Audio/Video)   |
                    +--------------------------------+
```

---

## 4. Technology Stack

### Frontend
- **HTML5**: Semantic markups, Canvas API, MediaDevices API (`getUserMedia`, `getDisplayMedia`).
- **CSS3 & Tailwind CSS**: Dark-themed SaaS interface, custom scrollbars, responsive video grids, micro-animations.
- **Vanilla JavaScript (ES Modules)**: Modular structure (`api.js`, `auth.js`, `webrtc.js`, `whiteboard.js`, `chat.js`, `files.js`, `meeting.js`, `dashboard.js`).

### Backend
- **Node.js & Express.js**: RESTful service architecture with Helmet and CORS.
- **Socket.IO**: Bi-directional signaling server and event pub/sub.
- **Multer**: Secure multipart file upload engine with size and MIME restrictions.
- **JWT & bcryptjs**: Cryptographic user password hashing and stateless token authorization.

### Database
- **MongoDB & Mongoose**: Object modeling for Users, Meetings, Messages, Files, and History.
- **Embedded Persistence Fallback**: JSON-backed local storage engine ensuring zero downtime when remote MongoDB clusters are initializing.

---

## 5. WebRTC Architecture & Implementation

1. **Topology**: Mesh networking where every participant establishes direct peer connections (`RTCPeerConnection`) with each other participant in the room.
2. **STUN Configuration**: Google STUN servers (`stun:stun.l.google.com:19302`) resolve reflexive ICE candidates across NAT environments.
3. **Signaling Flow**:
   - `Participant A` joins and receives the list of connected sockets.
   - `Participant A` creates an SDP offer: `pc.createOffer()`, sets local description, and transmits via Socket.IO to `Participant B`.
   - `Participant B` sets remote description, generates an SDP answer (`pc.createAnswer()`), sets local description, and relays it back.
   - Both peers exchange ICE candidates asynchronously (`pc.addIceCandidate()`).
4. **Media Handling**:
   - Tracks are attached dynamically via `pc.addTrack()`.
   - Screen sharing uses `sender.replaceTrack(screenTrack)` to smoothly upgrade the video feed without renegotiating entire peer sessions.

---

## 6. Socket.IO Signaling & Real-Time Events

- `join-meeting`: Registers socket in room `meeting_<meetingId>`, broadcasts `participant-joined`.
- `offer` / `answer`: Routes session descriptions between specific socket IDs.
- `ice-candidate`: Forwards ICE connectivity candidates to targeted peers.
- `toggle-microphone` / `toggle-camera`: Synchronizes audio/video mute badges.
- `screen-share-started` / `screen-share-stopped`: Broadcasts screen share status.
- `chat-message`: Broadcasts and persists chat entries.
- `whiteboard-draw` / `whiteboard-clear`: Transmits drawing operations to active peers.
- `file-shared`: Notifies room participants of new downloadable assets.
- `end-meeting` / `kick-participant`: Disconnects clients upon host command.

---

## 7. Database Schema & Persistence

### Models:
- **User**: `name`, `email`, `password` (hashed), `profileImage`, `role`, timestamps.
- **Meeting**: `meetingId`, `title`, `description`, `host`, `participants[]`, `status`, `createdAt`, `endedAt`.
- **Message**: `meeting`, `sender` (`userId`, `name`, `profileImage`), `message`, `isSystem`, `createdAt`.
- **File**: `meeting`, `uploadedBy`, `originalName`, `storedName`, `mimeType`, `size`, `path`, `createdAt`.
- **MeetingHistory**: `user`, `meeting` (`meetingId`, `title`, `hostName`), `joinedAt`, `leftAt`, `duration`.

---

## 8. REST API Documentation

### Authentication (`/api/auth`)
- `POST /register`: Create user account (`name`, `email`, `password`, `confirmPassword`).
- `POST /login`: Authenticate credentials and receive JWT.
- `GET /me`: Get current authenticated user profile.
- `PUT /profile`: Update name, avatar, or password.
- `POST /logout`: Sign out.

### Meetings (`/api/meetings`)
- `POST /`: Create a new meeting (`title`, `description`).
- `GET /`: Retrieve meetings hosted by current user.
- `GET /:meetingId`: Validate and retrieve meeting metadata.
- `POST /:meetingId/join`: Join meeting and log to history.
- `POST /:meetingId/leave`: Leave meeting and update duration.
- `POST /:meetingId/end`: Host-only meeting termination.
- `GET /history/all`: Retrieve user's past meeting participation logs.

### Messages & Files
- `GET /:meetingId/messages`: Retrieve chat log history.
- `POST /:meetingId/files`: Upload meeting asset (multipart FormData).
- `GET /:meetingId/files`: List assets shared in meeting.
- `GET /api/files/:fileId/download`: Secure tokenized asset download stream.
- `DELETE /api/files/:fileId`: Remove file (uploader or host only).

---

## 9. Security & Protection

- **Transport Security**: WebRTC media encrypted via DTLS-SRTP.
- **Header Protection**: Helmet configured with customized Content Security Policies (CSP) permitting WebSockets and Canvas operations.
- **Authentication**: JWT tokens signed with SHA-256 HMAC.
- **File Safety**: Restricted dangerous file extensions (`.exe`, `.sh`, `.bat`), 25MB ceiling, and filename sanitization.
- **Authorization**: Host-only endpoints for meeting termination and attendee removal.

---

## 10. Installation & Setup

### Prerequisites
- Node.js (v18+)
- npm or yarn

### 1. Clone repository
```bash
git clone https://github.com/your-username/syncmeet.git
cd syncmeet
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```
Fill in the configuration parameters:
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/syncmeet
JWT_SECRET=your_jwt_secret_key
STUN_SERVER_URL=stun:stun.l.google.com:19302
```

### 4. Run application
```bash
# Start server in development mode
npm run dev

# Or build and start for production
npm run build
npm start
```
Open `http://localhost:3000` in your web browser.

---

## 11. Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP & WebSocket server port | `3000` |
| `MONGODB_URI` | MongoDB connection URI (optional) | Embedded fallback |
| `JWT_SECRET` | Secret key for JWT generation | Embedded production key |
| `CLIENT_URL` | Frontend origin URL | `http://localhost:3000` |
| `STUN_SERVER_URL` | WebRTC STUN server URL | `stun:stun.l.google.com:19302` |

---

## 12. Future Enhancements

- Selective Forwarding Unit (SFU) mode using mediasoup for 50+ participants.
- End-to-End Encryption (E2EE) using WebRTC Insertable Streams.
- Cloud recording to S3 / Google Cloud Storage.
- Breakout rooms and live polling.

---

## 13. License

Distributed under the MIT License.
