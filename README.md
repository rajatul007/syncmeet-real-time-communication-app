# SyncMeet — Real-Time Video Conferencing & Collaboration Platform

SyncMeet is a full-stack real-time communication and collaboration platform for video meetings, screen sharing, messaging, collaborative whiteboarding, and secure file sharing.

## Features

* **Video & Audio Conferencing** — Real-time peer-to-peer communication using WebRTC.
* **Responsive Video Grid** — Supports multiple meeting participants with responsive layouts.
* **Screen Sharing** — Share your screen using the browser's native `getDisplayMedia()` API.
* **Collaborative Whiteboard** — Draw and collaborate in real time with multiple drawing tools.
* **Real-Time Chat** — Send and receive meeting messages using Socket.IO.
* **File Sharing** — Share documents, PDFs, and images during meetings.
* **Participant Controls** — Microphone, camera, screen-sharing status, and host controls.
* **Meeting History** — Track previous meetings and participation duration.
* **Authentication** — Secure registration and login using JWT and bcrypt.
* **Responsive Interface** — Designed for desktop and modern mobile browsers.

## System Architecture

```text
                    +-----------------------------+
                    |       SyncMeet Client       |
                    |   React / HTML / CSS / JS   |
                    +-------------+---------------+
                                  |
                    +-------------+---------------+
                    |                             |
                HTTP / REST                 Socket.IO
                    |                             |
                    v                             v
          +-------------------+       +----------------------+
          |   Express Server  |       |  Signaling Server    |
          |                   |       |                      |
          | JWT Authentication|       | Room Management      |
          | Meeting APIs      |       | WebRTC Signaling     |
          | File Uploads      |       | Chat & Events        |
          +---------+---------+       | Whiteboard Sync      |
                    |                 +----------+-----------+
                    |                            |
                    v                            |
          +-------------------+                  |
          | MongoDB / Mongoose|<-----------------+
          |                   |
          | Users             |
          | Meetings          |
          | Messages         |
          | Files             |
          | Meeting History  |
          +-------------------+

                         WebRTC
                 Peer-to-Peer Audio/Video
```

## Technology Stack

### Frontend

* React
* JavaScript
* HTML5
* CSS3
* Tailwind CSS
* WebRTC APIs
* Canvas API
* MediaDevices API

### Backend

* Node.js
* Express.js
* Socket.IO
* Multer
* Helmet
* CORS
* JWT
* bcryptjs

### Database

* MongoDB
* Mongoose

### Real-Time Communication

* WebRTC
* Socket.IO
* STUN

## WebRTC Architecture

SyncMeet uses WebRTC for peer-to-peer audio and video communication.

The application uses:

1. `RTCPeerConnection` for peer connections.
2. STUN servers for ICE candidate discovery.
3. Socket.IO for signaling.
4. SDP offers and answers for connection negotiation.
5. ICE candidates for network connectivity.
6. `getUserMedia()` for camera and microphone access.
7. `getDisplayMedia()` for screen sharing.
8. `replaceTrack()` for switching between camera and screen-sharing video.

Default STUN server:

```text
stun:stun.l.google.com:19302
```

## Socket.IO Events

The application uses Socket.IO for real-time communication.

Main events include:

* `join-meeting`
* `participant-joined`
* `offer`
* `answer`
* `ice-candidate`
* `toggle-microphone`
* `toggle-camera`
* `screen-share-started`
* `screen-share-stopped`
* `chat-message`
* `whiteboard-draw`
* `whiteboard-clear`
* `file-shared`
* `end-meeting`
* `kick-participant`

## Database Models

### User

Stores:

* Name
* Email
* Password hash
* Profile image
* Role
* Timestamps

### Meeting

Stores:

* Meeting ID
* Title
* Description
* Host
* Participants
* Status
* Creation time
* End time

### Message

Stores:

* Meeting
* Sender
* Message
* System message status
* Creation time

### File

Stores:

* Meeting
* Uploader
* Original filename
* Stored filename
* MIME type
* File size
* File path
* Creation time

### Meeting History

Stores:

* User
* Meeting
* Meeting title
* Host name
* Join time
* Leave time
* Duration

## REST API

### Authentication

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
PUT  /api/auth/profile
POST /api/auth/logout
```

### Meetings

```text
POST /api/meetings
GET  /api/meetings
GET  /api/meetings/:meetingId
POST /api/meetings/:meetingId/join
POST /api/meetings/:meetingId/leave
POST /api/meetings/:meetingId/end
GET  /api/meetings/history/all
```

### Messages & Files

```text
GET    /api/meetings/:meetingId/messages
POST   /api/meetings/:meetingId/files
GET    /api/meetings/:meetingId/files
GET    /api/files/:fileId/download
DELETE /api/files/:fileId
```

## Security

SyncMeet includes several security measures:

* JWT-based authentication
* Password hashing using bcrypt
* Helmet security headers
* CORS configuration
* Protected API routes
* Host-only meeting controls
* File type restrictions
* File size restrictions
* Filename sanitization
* WebRTC DTLS-SRTP media encryption

> WebRTC provides encrypted media transport. Application-level end-to-end encryption beyond WebRTC's normal security model is not claimed by this project.

## Installation

### Prerequisites

* Node.js 18 or later
* npm
* MongoDB database

### 1. Clone the repository

```bash
git clone https://github.com/rajatul007/syncmeet-real-time-communication-app.git
cd syncmeet-real-time-communication-app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root.

```env
PORT=8080
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_strong_jwt_secret
CLIENT_URL=http://localhost:8080
STUN_SERVER_URL=stun:stun.l.google.com:19302
```

Do not commit the `.env` file to GitHub.

### 4. Run in development

```bash
npm run dev
```

The application should be available at:

```text
http://localhost:8080
```

### 5. Build for production

```bash
npm run build
```

### 6. Start production server

```bash
npm start
```

## Environment Variables

| Variable          | Description                    | Required |
| ----------------- | ------------------------------ | -------- |
| `PORT`            | HTTP and WebSocket server port | Yes      |
| `MONGODB_URI`     | MongoDB connection string      | Yes      |
| `JWT_SECRET`      | Secret used to sign JWT tokens | Yes      |
| `CLIENT_URL`      | Frontend application URL       | Yes      |
| `STUN_SERVER_URL` | WebRTC STUN server URL         | Yes      |

### Example

```env
PORT=8080
MONGODB_URI=mongodb://localhost:27017/syncmeet
JWT_SECRET=replace_with_a_strong_random_secret
CLIENT_URL=http://localhost:8080
STUN_SERVER_URL=stun:stun.l.google.com:19302
```

## Deployment

Before deploying, make sure:

* All production environment variables are configured.
* `.env` is not committed to GitHub.
* The server listens on `0.0.0.0`.
* The application uses `process.env.PORT`.
* Frontend API requests do not use hardcoded `localhost` URLs.
* Socket.IO uses the deployed application URL.
* WebRTC signaling works through the deployed server.
* MongoDB is accessible from the deployment environment.

## Project Structure

```text
syncmeet-real-time-communication-app/
│
├── backend/
│   ├── config/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   └── ...
│
├── frontend/
│   ├── components/
│   ├── pages/
│   ├── services/
│   └── ...
│
├── server.ts
├── package.json
├── vite.config.ts
├── metadata.json
├── .env.example
├── .gitignore
└── README.md
```

> The exact directory structure may vary depending on the current implementation.

## Future Enhancements

* SFU-based architecture for larger meetings
* Breakout rooms
* Meeting recording
* Cloud file storage
* Advanced meeting moderation
* Improved mobile experience
* Additional collaboration tools

## License

This project is distributed under the MIT License.
