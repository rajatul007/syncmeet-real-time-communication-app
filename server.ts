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

// Initialize Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },
  maxHttpBufferSize: 5e6 // 5MB buffer
});

// Configure Helmet Security Headers with WebRTC / Socket.IO / Canvas and iFrame preview compatibility
app.use(
  helmet({
    frameguard: false,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false
  })
);

app.use((_req, res, next) => {
  res.removeHeader('X-Frame-Options');
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads directory
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

// Connect to Database (real MongoDB if MONGODB_URI set, or persistent local storage engine)
connectDB().catch((err) => console.error('[DB Startup Error]:', err));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/files', fileRoutes);

// Setup Socket.IO real-time signalling and events
setupSocketHandler(io);

// Static frontend serving
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

// Fallback for client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An unexpected internal server error occurred.'
  });
});

const PORT = process.env.PORT || 8080;
server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, server, io };
