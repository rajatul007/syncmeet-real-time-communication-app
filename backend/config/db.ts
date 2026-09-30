import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'syncmeet_db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface InMemoryStore {
  users: any[];
  meetings: any[];
  messages: any[];
  files: any[];
  meetingHistories: any[];
}

let store: InMemoryStore = {
  users: [],
  meetings: [],
  messages: [],
  files: [],
  meetingHistories: []
};

// Load saved data if exists
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    store = JSON.parse(raw);
  } catch (err) {
    console.warn('[SyncMeet DB] Could not parse local DB file, starting fresh:', err);
  }
}

export function saveLocalStore() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[SyncMeet DB] Failed to persist data to disk:', err);
  }
}

export const localDb = store;

let isMongoConnected = false;

export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri && mongoUri.trim().length > 0) {
    try {
      console.log('[SyncMeet DB] Attempting connection to MongoDB at:', mongoUri);
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 3000
      });
      isMongoConnected = true;
      console.log('[SyncMeet DB] Successfully connected to MongoDB');
      return;
    } catch (err: any) {
      console.warn('[SyncMeet DB] MongoDB connection failed, falling back to embedded persistent storage:', err.message);
      isMongoConnected = false;
    }
  } else {
    console.log('[SyncMeet DB] No MONGODB_URI provided. Running on embedded persistent local storage engine.');
  }
}

export function isUsingMongo() {
  return isMongoConnected;
}
