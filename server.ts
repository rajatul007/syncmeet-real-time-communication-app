```ts
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { connectDB } from './backend/config/db.ts';
import authRoutes from './backend/routes/authRoutes.ts';
import meetingRoutes from './backend/routes/meetingRoutes.ts';
import fileRoutes from './backend/routes/fileRoutes.ts';
import { setupSocketHandler } from './backend/socket/socketHandler.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 8080;
const CLIENT_URL = process.env.CLIENT_URL || '*';

// Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  maxHttpBufferSize: 5e6
});

// Security headers
app.use(
  helmet({
    frameguard: false,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false
  })
);

// CORS
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads
const uploadsPath = path.resolve(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Health check
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Database connection
connectDB()
  .then(() => {
    console.log('[DB] Database connected successfully');
  })
  .catch((err) => {
    console.error('[DB] Database connection failed:', err);
  });

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/files', fileRoutes);

// Socket.IO
setupSocketHandler(io);

// Frontend
const frontendPath = path.resolve(__dirname, 'frontend');

app.use(express.static(frontendPath));

// Page routes
app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'login.html'));
});

app.get('/register', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'register.html'));
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'dashboard.html'));
});

app.get('/profile', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'profile.html'));
});

app.get('/meeting/:meetingId', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'meeting.html'));
});

// SPA fallback
app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/uploads') ||
    req.path.startsWith('/socket.io')
  ) {
    return next();
  }

  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handler
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[Server Error]:', err);

    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'An unexpected internal server error occurred.'
    });
  }
);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`SyncMeet server running on port ${PORT}`);
});

export { app, server, io };
```
