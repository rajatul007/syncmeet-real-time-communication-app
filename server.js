// server.ts
import express from "express";
import http from "http";
import path3 from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

// backend/config/db.ts
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
var DATA_DIR = path.resolve(process.cwd(), "data");
var DB_FILE = path.join(DATA_DIR, "syncmeet_db.json");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
var store = {
  users: [],
  meetings: [],
  messages: [],
  files: [],
  meetingHistories: []
};
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    store = JSON.parse(raw);
  } catch (err) {
    console.warn("[SyncMeet DB] Could not parse local DB file, starting fresh:", err);
  }
}
function saveLocalStore() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("[SyncMeet DB] Failed to persist data to disk:", err);
  }
}
var localDb = store;
var isMongoConnected = false;
async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri && mongoUri.trim().length > 0) {
    try {
      console.log("[SyncMeet DB] Attempting connection to MongoDB at:", mongoUri);
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 3e3
      });
      isMongoConnected = true;
      console.log("[SyncMeet DB] Successfully connected to MongoDB");
      return;
    } catch (err) {
      console.warn("[SyncMeet DB] MongoDB connection failed, falling back to embedded persistent storage:", err.message);
      isMongoConnected = false;
    }
  } else {
    console.log("[SyncMeet DB] No MONGODB_URI provided. Running on embedded persistent local storage engine.");
  }
}
function isUsingMongo() {
  return isMongoConnected;
}

// backend/routes/authRoutes.ts
import { Router } from "express";

// backend/controllers/authController.ts
import bcrypt from "bcryptjs";

// backend/models/User.ts
import mongoose2, { Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";
var userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  profileImage: { type: String, default: "" },
  role: { type: String, default: "user" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
var MongooseUserModel = mongoose2.models.User || mongoose2.model("User", userSchema);
var UserModel = class {
  static async create(data) {
    if (isUsingMongo()) {
      return (await MongooseUserModel.create(data)).toObject();
    }
    const now = /* @__PURE__ */ new Date();
    const newUser = {
      _id: uuidv4(),
      name: data.name || "",
      email: (data.email || "").toLowerCase().trim(),
      password: data.password || "",
      profileImage: data.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.name || "User")}`,
      role: data.role || "user",
      createdAt: now,
      updatedAt: now
    };
    localDb.users.push(newUser);
    saveLocalStore();
    return { ...newUser };
  }
  static async findOne(query) {
    if (isUsingMongo()) {
      return await MongooseUserModel.findOne(query).lean();
    }
    if (query.email) {
      const email = query.email.toLowerCase().trim();
      const user = localDb.users.find((u) => u.email === email);
      return user ? { ...user } : null;
    }
    if (query._id) {
      const user = localDb.users.find((u) => u._id === query._id);
      return user ? { ...user } : null;
    }
    return null;
  }
  static async findById(id) {
    if (isUsingMongo()) {
      return await MongooseUserModel.findById(id).lean();
    }
    const user = localDb.users.find((u) => u._id === id);
    return user ? { ...user } : null;
  }
  static async findByIdAndUpdate(id, updates) {
    if (isUsingMongo()) {
      return await MongooseUserModel.findByIdAndUpdate(id, { ...updates, updatedAt: /* @__PURE__ */ new Date() }, { new: true }).lean();
    }
    const index = localDb.users.findIndex((u) => u._id === id);
    if (index === -1) return null;
    localDb.users[index] = {
      ...localDb.users[index],
      ...updates,
      updatedAt: /* @__PURE__ */ new Date()
    };
    saveLocalStore();
    return { ...localDb.users[index] };
  }
};
var User_default = UserModel;

// backend/middleware/authMiddleware.ts
import jwt from "jsonwebtoken";
var JWT_SECRET = process.env.JWT_SECRET || "syncmeet_super_secret_production_key_2026";
async function protect(req, res, next) {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.query && typeof req.query.token === "string") {
    token = req.query.token;
  }
  if (!token) {
    res.status(401).json({ success: false, message: "Authentication required. No token provided." });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User_default.findById(decoded.id);
    if (!user) {
      res.status(401).json({ success: false, message: "User associated with token no longer exists." });
      return;
    }
    const { password, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
}
function generateToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

// backend/controllers/authController.ts
async function register(req, res) {
  try {
    const { name, email, password, confirmPassword } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: "Please provide full name, email, and password." });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ success: false, message: "Passwords do not match." });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ success: false, message: "Please provide a valid email address." });
      return;
    }
    const existingUser = await User_default.findOne({ email });
    if (existingUser) {
      res.status(409).json({ success: false, message: "An account with this email already exists." });
      return;
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = await User_default.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      profileImage: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=2563eb&textColor=ffffff`,
      role: "user"
    });
    const token = generateToken(newUser);
    const { password: _, ...userSafe } = newUser;
    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: userSafe
    });
  } catch (error) {
    console.error("[Auth Error] Register:", error);
    res.status(500).json({ success: false, message: "Internal server error during registration." });
  }
}
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, message: "Please provide email and password." });
      return;
    }
    const user = await User_default.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.password) {
      res.status(401).json({ success: false, message: "Invalid email or password credentials." });
      return;
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: "Invalid email or password credentials." });
      return;
    }
    const token = generateToken(user);
    const { password: _, ...userSafe } = user;
    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: userSafe
    });
  } catch (error) {
    console.error("[Auth Error] Login:", error);
    res.status(500).json({ success: false, message: "Internal server error during login." });
  }
}
async function getMe(req, res) {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    res.status(200).json({ success: true, user: req.user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch user profile." });
  }
}
async function updateProfile(req, res) {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const { name, profileImage, currentPassword, newPassword } = req.body;
    const updates = {};
    if (name && name.trim()) {
      updates.name = name.trim();
    }
    if (profileImage !== void 0) {
      updates.profileImage = profileImage;
    }
    if (newPassword) {
      if (newPassword.length < 6) {
        res.status(400).json({ success: false, message: "New password must be at least 6 characters long." });
        return;
      }
      const fullUser = await User_default.findById(req.user._id);
      if (!fullUser || !fullUser.password) {
        res.status(400).json({ success: false, message: "User record not found." });
        return;
      }
      if (!currentPassword) {
        res.status(400).json({ success: false, message: "Current password is required to set a new password." });
        return;
      }
      const match = await bcrypt.compare(currentPassword, fullUser.password);
      if (!match) {
        res.status(400).json({ success: false, message: "Current password does not match." });
        return;
      }
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(newPassword, salt);
    }
    const updated = await User_default.findByIdAndUpdate(req.user._id, updates);
    if (!updated) {
      res.status(404).json({ success: false, message: "User not found." });
      return;
    }
    const { password: _, ...userSafe } = updated;
    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: userSafe
    });
  } catch (error) {
    console.error("[Auth Error] Update profile:", error);
    res.status(500).json({ success: false, message: "Internal error updating profile." });
  }
}
async function logout(req, res) {
  res.status(200).json({ success: true, message: "Logged out successfully." });
}

// backend/routes/authRoutes.ts
var router = Router();
router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);
router.post("/logout", protect, logout);
var authRoutes_default = router;

// backend/routes/meetingRoutes.ts
import { Router as Router2 } from "express";

// backend/models/Meeting.ts
import mongoose3, { Schema as Schema2 } from "mongoose";
import { v4 as uuidv42 } from "uuid";
var meetingSchema = new Schema2({
  meetingId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  host: {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    profileImage: { type: String }
  },
  participants: [
    {
      userId: { type: String, required: true },
      name: { type: String, required: true },
      email: { type: String, required: true },
      profileImage: { type: String },
      joinedAt: { type: Date, default: Date.now }
    }
  ],
  scheduledAt: { type: Date },
  status: { type: String, enum: ["scheduled", "active", "ended"], default: "active" },
  createdAt: { type: Date, default: Date.now },
  endedAt: { type: Date }
});
var MongooseMeetingModel = mongoose3.models.Meeting || mongoose3.model("Meeting", meetingSchema);
var MeetingModel = class {
  static async create(data) {
    if (isUsingMongo()) {
      return (await MongooseMeetingModel.create(data)).toObject();
    }
    const newMeeting = {
      _id: uuidv42(),
      meetingId: data.meetingId || uuidv42().slice(0, 9),
      title: data.title || "Untitled Meeting",
      description: data.description || "",
      host: data.host,
      participants: data.participants || [],
      scheduledAt: data.scheduledAt,
      status: data.status || "active",
      createdAt: /* @__PURE__ */ new Date(),
      endedAt: void 0
    };
    localDb.meetings.push(newMeeting);
    saveLocalStore();
    return { ...newMeeting };
  }
  static async findOne(query) {
    if (isUsingMongo()) {
      return await MongooseMeetingModel.findOne(query).lean();
    }
    if (query.meetingId) {
      const m = localDb.meetings.find((item) => item.meetingId === query.meetingId);
      return m ? { ...m } : null;
    }
    if (query._id) {
      const m = localDb.meetings.find((item) => item._id === query._id);
      return m ? { ...m } : null;
    }
    return null;
  }
  static async find(query) {
    if (isUsingMongo()) {
      return await MongooseMeetingModel.find(query).sort({ createdAt: -1 }).lean();
    }
    let list = [...localDb.meetings];
    if (query["host._id"]) {
      list = list.filter((m) => m.host && m.host._id === query["host._id"]);
    }
    if (query.status) {
      list = list.filter((m) => m.status === query.status);
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  static async updateOne(query, updates) {
    if (isUsingMongo()) {
      await MongooseMeetingModel.updateOne(query, updates);
      return true;
    }
    const index = localDb.meetings.findIndex((m) => m.meetingId === query.meetingId);
    if (index === -1) return false;
    localDb.meetings[index] = {
      ...localDb.meetings[index],
      ...updates
    };
    saveLocalStore();
    return true;
  }
  static async addParticipant(meetingId, participant) {
    if (isUsingMongo()) {
      return await MongooseMeetingModel.findOneAndUpdate(
        { meetingId },
        { $addToSet: { participants: participant } },
        { new: true }
      ).lean();
    }
    const meeting = localDb.meetings.find((m) => m.meetingId === meetingId);
    if (!meeting) return null;
    const exists = meeting.participants.some((p) => p.userId === participant.userId);
    if (!exists) {
      meeting.participants.push(participant);
      saveLocalStore();
    }
    return { ...meeting };
  }
};
var Meeting_default = MeetingModel;

// backend/models/MeetingHistory.ts
import mongoose4, { Schema as Schema3 } from "mongoose";
import { v4 as uuidv43 } from "uuid";
var meetingHistorySchema = new Schema3({
  user: { type: String, required: true, index: true },
  meeting: {
    meetingId: { type: String, required: true },
    title: { type: String, required: true },
    hostName: { type: String, required: true }
  },
  joinedAt: { type: Date, default: Date.now },
  leftAt: { type: Date },
  duration: { type: Number, default: 0 }
});
var MongooseMeetingHistoryModel = mongoose4.models.MeetingHistory || mongoose4.model("MeetingHistory", meetingHistorySchema);
var MeetingHistoryModel = class {
  static async create(data) {
    if (isUsingMongo()) {
      return (await MongooseMeetingHistoryModel.create(data)).toObject();
    }
    const newHistory = {
      _id: uuidv43(),
      user: data.user || "",
      meeting: data.meeting,
      joinedAt: data.joinedAt || /* @__PURE__ */ new Date(),
      leftAt: data.leftAt,
      duration: data.duration || 0
    };
    localDb.meetingHistories.push(newHistory);
    saveLocalStore();
    return { ...newHistory };
  }
  static async find(query) {
    if (isUsingMongo()) {
      return await MongooseMeetingHistoryModel.find(query).sort({ joinedAt: -1 }).lean();
    }
    return localDb.meetingHistories.filter((h) => h.user === query.user).sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());
  }
  static async updateLatest(userId, meetingId, leftAt) {
    if (isUsingMongo()) {
      const latest = await MongooseMeetingHistoryModel.findOne({ user: userId, "meeting.meetingId": meetingId, leftAt: { $exists: false } }).sort({ joinedAt: -1 });
      if (latest) {
        const duration = Math.round((leftAt.getTime() - new Date(latest.joinedAt).getTime()) / 1e3);
        latest.leftAt = leftAt;
        latest.duration = Math.max(0, duration);
        await latest.save();
        return true;
      }
      return false;
    }
    const list = localDb.meetingHistories.filter((h) => h.user === userId && h.meeting.meetingId === meetingId && !h.leftAt);
    if (list.length > 0) {
      const latest = list[list.length - 1];
      latest.leftAt = leftAt;
      latest.duration = Math.max(0, Math.round((leftAt.getTime() - new Date(latest.joinedAt).getTime()) / 1e3));
      saveLocalStore();
      return true;
    }
    return false;
  }
};
var MeetingHistory_default = MeetingHistoryModel;

// backend/controllers/meetingController.ts
function generateMeetingId() {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const part1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const part3 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part1}-${part2}-${part3}`;
}
async function createMeeting(req, res) {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const { title, description, scheduledAt } = req.body;
    const meetingTitle = title && title.trim() ? title.trim() : `${req.user.name}'s Meeting`;
    const meetingId = generateMeetingId();
    const newMeeting = await Meeting_default.create({
      meetingId,
      title: meetingTitle,
      description: description || "",
      host: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        profileImage: req.user.profileImage
      },
      participants: [
        {
          userId: req.user._id,
          name: req.user.name,
          email: req.user.email,
          profileImage: req.user.profileImage,
          joinedAt: /* @__PURE__ */ new Date()
        }
      ],
      scheduledAt: scheduledAt ? new Date(scheduledAt) : void 0,
      status: "active"
    });
    await MeetingHistory_default.create({
      user: req.user._id,
      meeting: {
        meetingId: newMeeting.meetingId,
        title: newMeeting.title,
        hostName: newMeeting.host.name
      },
      joinedAt: /* @__PURE__ */ new Date()
    });
    res.status(201).json({
      success: true,
      message: "Meeting created successfully",
      meeting: newMeeting
    });
  } catch (error) {
    console.error("[Meeting Error] Create:", error);
    res.status(500).json({ success: false, message: "Failed to create meeting." });
  }
}
async function getMeetings(req, res) {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const meetings = await Meeting_default.find({ "host._id": req.user._id });
    res.status(200).json({ success: true, meetings });
  } catch (error) {
    console.error("[Meeting Error] Get meetings:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve meetings." });
  }
}
async function getMeetingById(req, res) {
  try {
    const { meetingId } = req.params;
    if (!meetingId) {
      res.status(400).json({ success: false, message: "Meeting ID is required" });
      return;
    }
    const meeting = await Meeting_default.findOne({ meetingId });
    if (!meeting) {
      res.status(404).json({ success: false, message: "Meeting not found" });
      return;
    }
    if (meeting.status === "ended") {
      res.status(410).json({ success: false, message: "This meeting has already ended by the host." });
      return;
    }
    res.status(200).json({ success: true, meeting });
  } catch (error) {
    console.error("[Meeting Error] Get meeting by ID:", error);
    res.status(500).json({ success: false, message: "Failed to fetch meeting details." });
  }
}
async function joinMeeting(req, res) {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const { meetingId } = req.params;
    const meeting = await Meeting_default.findOne({ meetingId });
    if (!meeting) {
      res.status(404).json({ success: false, message: "Meeting not found" });
      return;
    }
    if (meeting.status === "ended") {
      res.status(410).json({ success: false, message: "This meeting has already ended." });
      return;
    }
    const participant = {
      userId: req.user._id,
      name: req.user.name,
      email: req.user.email,
      profileImage: req.user.profileImage,
      joinedAt: /* @__PURE__ */ new Date()
    };
    await Meeting_default.addParticipant(meetingId, participant);
    await MeetingHistory_default.create({
      user: req.user._id,
      meeting: {
        meetingId: meeting.meetingId,
        title: meeting.title,
        hostName: meeting.host.name
      },
      joinedAt: /* @__PURE__ */ new Date()
    });
    res.status(200).json({
      success: true,
      message: "Joined meeting successfully",
      meeting
    });
  } catch (error) {
    console.error("[Meeting Error] Join meeting:", error);
    res.status(500).json({ success: false, message: "Failed to join meeting." });
  }
}
async function leaveMeeting(req, res) {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const { meetingId } = req.params;
    await MeetingHistory_default.updateLatest(req.user._id, meetingId, /* @__PURE__ */ new Date());
    res.status(200).json({ success: true, message: "Left meeting successfully" });
  } catch (error) {
    console.error("[Meeting Error] Leave meeting:", error);
    res.status(500).json({ success: false, message: "Failed to record leaving meeting." });
  }
}
async function endMeeting(req, res) {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const { meetingId } = req.params;
    const meeting = await Meeting_default.findOne({ meetingId });
    if (!meeting) {
      res.status(404).json({ success: false, message: "Meeting not found" });
      return;
    }
    if (meeting.host._id !== req.user._id) {
      res.status(403).json({ success: false, message: "Only the meeting host can end this meeting for everyone." });
      return;
    }
    await Meeting_default.updateOne({ meetingId }, { status: "ended", endedAt: /* @__PURE__ */ new Date() });
    res.status(200).json({ success: true, message: "Meeting ended successfully." });
  } catch (error) {
    console.error("[Meeting Error] End meeting:", error);
    res.status(500).json({ success: false, message: "Failed to end meeting." });
  }
}
async function getMeetingHistory(req, res) {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const history = await MeetingHistory_default.find({ user: req.user._id });
    res.status(200).json({ success: true, history });
  } catch (error) {
    console.error("[Meeting Error] Get history:", error);
    res.status(500).json({ success: false, message: "Failed to fetch meeting history." });
  }
}

// backend/models/Message.ts
import mongoose5, { Schema as Schema4 } from "mongoose";
import { v4 as uuidv44 } from "uuid";
var messageSchema = new Schema4({
  meeting: { type: String, required: true, index: true },
  sender: {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    profileImage: { type: String }
  },
  message: { type: String, required: true },
  isSystem: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
var MongooseMessageModel = mongoose5.models.Message || mongoose5.model("Message", messageSchema);
var MessageModel = class {
  static async create(data) {
    if (isUsingMongo()) {
      return (await MongooseMessageModel.create(data)).toObject();
    }
    const newMsg = {
      _id: uuidv44(),
      meeting: data.meeting || "",
      sender: data.sender,
      message: data.message || "",
      isSystem: !!data.isSystem,
      createdAt: /* @__PURE__ */ new Date()
    };
    localDb.messages.push(newMsg);
    saveLocalStore();
    return { ...newMsg };
  }
  static async find(query) {
    if (isUsingMongo()) {
      return await MongooseMessageModel.find(query).sort({ createdAt: 1 }).lean();
    }
    return localDb.messages.filter((m) => m.meeting === query.meeting).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
};
var Message_default = MessageModel;

// backend/controllers/messageController.ts
async function getMeetingMessages(req, res) {
  try {
    const { meetingId } = req.params;
    if (!meetingId) {
      res.status(400).json({ success: false, message: "Meeting ID is required" });
      return;
    }
    const messages = await Message_default.find({ meeting: meetingId });
    res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error("[Message Error] Get messages:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve meeting messages." });
  }
}

// backend/controllers/fileController.ts
import fs2 from "fs";
import path2 from "path";
import multer from "multer";
import { v4 as uuidv46 } from "uuid";

// backend/models/File.ts
import mongoose6, { Schema as Schema5 } from "mongoose";
import { v4 as uuidv45 } from "uuid";
var fileSchema = new Schema5({
  meeting: { type: String, required: true, index: true },
  uploadedBy: {
    userId: { type: String, required: true },
    name: { type: String, required: true }
  },
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
var MongooseFileModel = mongoose6.models.File || mongoose6.model("File", fileSchema);
var FileModel = class {
  static async create(data) {
    if (isUsingMongo()) {
      return (await MongooseFileModel.create(data)).toObject();
    }
    const newFile = {
      _id: uuidv45(),
      meeting: data.meeting || "",
      uploadedBy: data.uploadedBy,
      originalName: data.originalName || "file",
      storedName: data.storedName || "",
      mimeType: data.mimeType || "application/octet-stream",
      size: data.size || 0,
      path: data.path || "",
      createdAt: /* @__PURE__ */ new Date()
    };
    localDb.files.push(newFile);
    saveLocalStore();
    return { ...newFile };
  }
  static async find(query) {
    if (isUsingMongo()) {
      return await MongooseFileModel.find(query).sort({ createdAt: -1 }).lean();
    }
    return localDb.files.filter((f) => f.meeting === query.meeting).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  static async findById(id) {
    if (isUsingMongo()) {
      return await MongooseFileModel.findById(id).lean();
    }
    const file = localDb.files.find((f) => f._id === id);
    return file ? { ...file } : null;
  }
  static async deleteOne(query) {
    if (isUsingMongo()) {
      const res = await MongooseFileModel.deleteOne(query);
      return (res.deletedCount || 0) > 0;
    }
    const index = localDb.files.findIndex((f) => f._id === query._id);
    if (index === -1) return false;
    localDb.files.splice(index, 1);
    saveLocalStore();
    return true;
  }
};
var File_default = FileModel;

// backend/controllers/fileController.ts
var UPLOADS_DIR = path2.resolve(process.cwd(), "uploads");
if (!fs2.existsSync(UPLOADS_DIR)) {
  fs2.mkdirSync(UPLOADS_DIR, { recursive: true });
}
var storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const sanitizedExt = path2.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const uniqueName = `${uuidv46()}${sanitizedExt}`;
    cb(null, uniqueName);
  }
});
var dangerousExtensions = [".exe", ".bat", ".cmd", ".sh", ".msi", ".vbs", ".scr"];
var uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024
    // 25 MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path2.extname(file.originalname).toLowerCase();
    if (dangerousExtensions.includes(ext)) {
      return cb(new Error("Executable and script file types are restricted for security."));
    }
    cb(null, true);
  }
}).single("file");
function handleFileUpload(req, res, next) {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ success: false, message: "File exceeds maximum allowed size of 25MB." });
        }
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ success: false, message: err.message || "File upload failed." });
    }
    next();
  });
}
async function uploadMeetingFile(req, res) {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const { meetingId } = req.params;
    const meeting = await Meeting_default.findOne({ meetingId });
    if (!meeting) {
      res.status(404).json({ success: false, message: "Meeting not found" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, message: "No file was uploaded." });
      return;
    }
    const originalName = req.file.originalname.replace(/[^a-zA-Z0-9._ -]/g, "_");
    const newFile = await File_default.create({
      meeting: meetingId,
      uploadedBy: {
        userId: req.user._id,
        name: req.user.name
      },
      originalName,
      storedName: req.file.filename,
      mimeType: req.file.mimetype || "application/octet-stream",
      size: req.file.size,
      path: req.file.path
    });
    res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      file: newFile
    });
  } catch (error) {
    console.error("[File Error] Upload:", error);
    res.status(500).json({ success: false, message: "Failed to process file upload." });
  }
}
async function getMeetingFiles(req, res) {
  try {
    const { meetingId } = req.params;
    const files = await File_default.find({ meeting: meetingId });
    res.status(200).json({ success: true, files });
  } catch (error) {
    console.error("[File Error] Get files:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve meeting files." });
  }
}
async function downloadFile(req, res) {
  try {
    const { fileId } = req.params;
    const file = await File_default.findById(fileId);
    if (!file) {
      res.status(404).json({ success: false, message: "File not found" });
      return;
    }
    const filePath = path2.resolve(UPLOADS_DIR, file.storedName);
    if (!fs2.existsSync(filePath)) {
      res.status(404).json({ success: false, message: "File binary does not exist on storage." });
      return;
    }
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader("Content-Type", file.mimeType);
    const fileStream = fs2.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("[File Error] Download:", error);
    res.status(500).json({ success: false, message: "Failed to download file." });
  }
}
async function deleteMeetingFile(req, res) {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const { fileId } = req.params;
    const file = await File_default.findById(fileId);
    if (!file) {
      res.status(404).json({ success: false, message: "File not found" });
      return;
    }
    const meeting = await Meeting_default.findOne({ meetingId: file.meeting });
    const isHost = meeting && meeting.host._id === req.user._id;
    const isUploader = file.uploadedBy.userId === req.user._id;
    if (!isHost && !isUploader) {
      res.status(403).json({ success: false, message: "Permission denied. Only uploader or host can delete this file." });
      return;
    }
    const filePath = path2.resolve(UPLOADS_DIR, file.storedName);
    if (fs2.existsSync(filePath)) {
      try {
        fs2.unlinkSync(filePath);
      } catch (err) {
        console.warn("[File Warning] Failed to delete disk file:", err);
      }
    }
    await File_default.deleteOne({ _id: fileId });
    res.status(200).json({ success: true, message: "File deleted successfully" });
  } catch (error) {
    console.error("[File Error] Delete:", error);
    res.status(500).json({ success: false, message: "Failed to delete file." });
  }
}

// backend/routes/meetingRoutes.ts
var router2 = Router2();
router2.use(protect);
router2.post("/", createMeeting);
router2.get("/", getMeetings);
router2.get("/history/all", getMeetingHistory);
router2.get("/:meetingId", getMeetingById);
router2.post("/:meetingId/join", joinMeeting);
router2.post("/:meetingId/leave", leaveMeeting);
router2.post("/:meetingId/end", endMeeting);
router2.get("/:meetingId/messages", getMeetingMessages);
router2.get("/:meetingId/files", getMeetingFiles);
router2.post("/:meetingId/files", handleFileUpload, uploadMeetingFile);
var meetingRoutes_default = router2;

// backend/routes/fileRoutes.ts
import { Router as Router3 } from "express";
var router3 = Router3();
router3.use(protect);
router3.get("/:fileId/download", downloadFile);
router3.delete("/:fileId", deleteMeetingFile);
var fileRoutes_default = router3;

// backend/socket/socketHandler.ts
var rooms = /* @__PURE__ */ new Map();
var whiteboardRooms = /* @__PURE__ */ new Map();
function setupSocketHandler(io2) {
  io2.on("connection", (socket) => {
    let currentMeetingId = null;
    let currentUser = null;
    socket.on("join-meeting", async (data) => {
      const { meetingId, user } = data;
      if (!meetingId || !user || !user.userId) return;
      currentMeetingId = meetingId;
      const roomName = `meeting_${meetingId}`;
      socket.join(roomName);
      if (!rooms.has(meetingId)) {
        rooms.set(meetingId, /* @__PURE__ */ new Map());
      }
      if (!whiteboardRooms.has(meetingId)) {
        whiteboardRooms.set(meetingId, []);
      }
      const roomParticipants = rooms.get(meetingId);
      let isHost = false;
      try {
        const meeting = await Meeting_default.findOne({ meetingId });
        if (meeting && meeting.host && meeting.host._id === user.userId) {
          isHost = true;
        }
      } catch (err) {
        console.error("[Socket] Check host error:", err);
      }
      currentUser = {
        socketId: socket.id,
        userId: user.userId,
        name: user.name || "Participant",
        email: user.email || "",
        profileImage: user.profileImage,
        isMuted: !!user.isMuted,
        isVideoOff: !!user.isVideoOff,
        isScreenSharing: false,
        isHost
      };
      roomParticipants.set(socket.id, currentUser);
      const existingParticipants = Array.from(roomParticipants.values()).filter((p) => p.socketId !== socket.id);
      socket.emit("participants-list", {
        participants: existingParticipants,
        currentSocketId: socket.id,
        isHost
      });
      socket.to(roomName).emit("participant-joined", {
        participant: currentUser
      });
      const history = whiteboardRooms.get(meetingId) || [];
      if (history.length > 0) {
        socket.emit("whiteboard-init", { history });
      }
      try {
        const sysMsg = await Message_default.create({
          meeting: meetingId,
          sender: {
            userId: "system",
            name: "System"
          },
          message: `${currentUser.name} joined the meeting`,
          isSystem: true
        });
        io2.to(roomName).emit("chat-message", sysMsg);
      } catch (e) {
        console.error("[Socket] SysMsg error:", e);
      }
    });
    socket.on("offer", (data) => {
      io2.to(data.to).emit("offer", {
        from: socket.id,
        offer: data.offer,
        user: currentUser
      });
    });
    socket.on("answer", (data) => {
      io2.to(data.to).emit("answer", {
        from: socket.id,
        answer: data.answer
      });
    });
    socket.on("ice-candidate", (data) => {
      io2.to(data.to).emit("ice-candidate", {
        from: socket.id,
        candidate: data.candidate
      });
    });
    socket.on("toggle-microphone", (data) => {
      if (currentUser) {
        currentUser.isMuted = data.isMuted;
        socket.to(`meeting_${data.meetingId}`).emit("participant-mic-toggled", {
          socketId: socket.id,
          userId: currentUser.userId,
          isMuted: data.isMuted
        });
      }
    });
    socket.on("toggle-camera", (data) => {
      if (currentUser) {
        currentUser.isVideoOff = data.isVideoOff;
        socket.to(`meeting_${data.meetingId}`).emit("participant-camera-toggled", {
          socketId: socket.id,
          userId: currentUser.userId,
          isVideoOff: data.isVideoOff
        });
      }
    });
    socket.on("screen-share-started", (data) => {
      if (currentUser) {
        currentUser.isScreenSharing = true;
        socket.to(`meeting_${data.meetingId}`).emit("participant-screen-share-started", {
          socketId: socket.id,
          userId: currentUser.userId,
          name: currentUser.name
        });
      }
    });
    socket.on("screen-share-stopped", (data) => {
      if (currentUser) {
        currentUser.isScreenSharing = false;
        socket.to(`meeting_${data.meetingId}`).emit("participant-screen-share-stopped", {
          socketId: socket.id,
          userId: currentUser.userId
        });
      }
    });
    socket.on("chat-message", async (data) => {
      if (!data.meetingId || !data.message) return;
      try {
        const savedMessage = await Message_default.create({
          meeting: data.meetingId,
          sender: {
            userId: data.sender.userId,
            name: data.sender.name,
            profileImage: data.sender.profileImage
          },
          message: data.message.trim(),
          isSystem: false
        });
        io2.to(`meeting_${data.meetingId}`).emit("chat-message", savedMessage);
      } catch (err) {
        console.error("[Socket Chat] Failed to save/broadcast message:", err);
      }
    });
    socket.on("whiteboard-draw", (data) => {
      if (!data.meetingId || !data.drawAction) return;
      const history = whiteboardRooms.get(data.meetingId);
      if (history) {
        history.push(data.drawAction);
        if (history.length > 3e3) {
          history.splice(0, 1e3);
        }
      }
      socket.to(`meeting_${data.meetingId}`).emit("whiteboard-draw", data.drawAction);
    });
    socket.on("whiteboard-clear", (data) => {
      if (!data.meetingId) return;
      whiteboardRooms.set(data.meetingId, []);
      socket.to(`meeting_${data.meetingId}`).emit("whiteboard-clear");
    });
    socket.on("file-shared", (data) => {
      if (!data.meetingId || !data.file) return;
      io2.to(`meeting_${data.meetingId}`).emit("file-shared", data.file);
    });
    socket.on("end-meeting", async (data) => {
      if (!data.meetingId) return;
      try {
        await Meeting_default.updateOne({ meetingId: data.meetingId }, { status: "ended", endedAt: /* @__PURE__ */ new Date() });
      } catch (e) {
        console.error("[Socket End Meeting] Error:", e);
      }
      io2.to(`meeting_${data.meetingId}`).emit("meeting-ended");
      rooms.delete(data.meetingId);
      whiteboardRooms.delete(data.meetingId);
    });
    socket.on("kick-participant", (data) => {
      if (!currentUser?.isHost) return;
      io2.to(data.targetSocketId).emit("participant-kicked");
      const roomParticipants = rooms.get(data.meetingId);
      if (roomParticipants) {
        const target = roomParticipants.get(data.targetSocketId);
        roomParticipants.delete(data.targetSocketId);
        if (target) {
          io2.to(`meeting_${data.meetingId}`).emit("participant-left", {
            socketId: data.targetSocketId,
            userId: target.userId,
            name: target.name
          });
        }
      }
    });
    socket.on("leave-meeting", () => {
      handleLeave();
    });
    socket.on("disconnect", () => {
      handleLeave();
    });
    function handleLeave() {
      if (!currentMeetingId) return;
      const meetingId = currentMeetingId;
      const roomParticipants = rooms.get(meetingId);
      if (roomParticipants && roomParticipants.has(socket.id)) {
        const leavingUser = roomParticipants.get(socket.id);
        roomParticipants.delete(socket.id);
        socket.to(`meeting_${meetingId}`).emit("participant-left", {
          socketId: socket.id,
          userId: leavingUser?.userId,
          name: leavingUser?.name
        });
        if (leavingUser) {
          Message_default.create({
            meeting: meetingId,
            sender: {
              userId: "system",
              name: "System"
            },
            message: `${leavingUser.name} left the meeting`,
            isSystem: true
          }).then((msg) => {
            socket.to(`meeting_${meetingId}`).emit("chat-message", msg);
          }).catch(() => {
          });
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

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
var app = express();
var server = http.createServer(app);
var io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  },
  maxHttpBufferSize: 5e6
  // 5MB buffer
});
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
  res.removeHeader("X-Frame-Options");
  next();
});
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(path3.resolve(__dirname, "uploads")));
connectDB().catch((err) => console.error("[DB Startup Error]:", err));
app.use("/api/auth", authRoutes_default);
app.use("/api/meetings", meetingRoutes_default);
app.use("/api/files", fileRoutes_default);
setupSocketHandler(io);
var frontendPath = path3.resolve(__dirname, "frontend");
app.use(express.static(frontendPath));
app.get("/", (_req, res) => {
  res.sendFile(path3.join(frontendPath, "index.html"));
});
app.get("/login", (_req, res) => {
  res.sendFile(path3.join(frontendPath, "login.html"));
});
app.get("/register", (_req, res) => {
  res.sendFile(path3.join(frontendPath, "register.html"));
});
app.get("/dashboard", (_req, res) => {
  res.sendFile(path3.join(frontendPath, "dashboard.html"));
});
app.get("/profile", (_req, res) => {
  res.sendFile(path3.join(frontendPath, "profile.html"));
});
app.get("/meeting/:meetingId", (_req, res) => {
  res.sendFile(path3.join(frontendPath, "meeting.html"));
});
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/socket.io")) {
    return next();
  }
  res.sendFile(path3.join(frontendPath, "index.html"));
});
app.use((err, _req, res, _next) => {
  console.error("[Server Error]:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "An unexpected internal server error occurred."
  });
});
var PORT = process.env.PORT || 3e3;
server.listen(PORT, () => {
  console.log(`[SyncMeet Server] Running smoothly on port ${PORT}`);
  console.log(`[SyncMeet Server] Local: http://localhost:${PORT}`);
});
export {
  app,
  io,
  server
};
