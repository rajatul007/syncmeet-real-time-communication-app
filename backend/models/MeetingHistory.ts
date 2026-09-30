import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { localDb, saveLocalStore, isUsingMongo } from '../config/db.ts';

export interface IMeetingHistory {
  _id: string;
  user: string; // userId
  meeting: {
    meetingId: string;
    title: string;
    hostName: string;
  };
  joinedAt: Date;
  leftAt?: Date;
  duration?: number; // duration in seconds
}

const meetingHistorySchema = new Schema<IMeetingHistory>({
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

const MongooseMeetingHistoryModel = mongoose.models.MeetingHistory || mongoose.model<IMeetingHistory>('MeetingHistory', meetingHistorySchema);

export class MeetingHistoryModel {
  static async create(data: Partial<IMeetingHistory>): Promise<IMeetingHistory> {
    if (isUsingMongo()) {
      return (await MongooseMeetingHistoryModel.create(data)).toObject();
    }
    const newHistory: IMeetingHistory = {
      _id: uuidv4(),
      user: data.user || '',
      meeting: data.meeting as any,
      joinedAt: data.joinedAt || new Date(),
      leftAt: data.leftAt,
      duration: data.duration || 0
    };
    localDb.meetingHistories.push(newHistory);
    saveLocalStore();
    return { ...newHistory };
  }

  static async find(query: { user: string }): Promise<IMeetingHistory[]> {
    if (isUsingMongo()) {
      return (await MongooseMeetingHistoryModel.find(query).sort({ joinedAt: -1 }).lean()) as IMeetingHistory[];
    }
    return localDb.meetingHistories
      .filter((h: IMeetingHistory) => h.user === query.user)
      .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());
  }

  static async updateLatest(userId: string, meetingId: string, leftAt: Date): Promise<boolean> {
    if (isUsingMongo()) {
      const latest = await MongooseMeetingHistoryModel.findOne({ user: userId, 'meeting.meetingId': meetingId, leftAt: { $exists: false } }).sort({ joinedAt: -1 });
      if (latest) {
        const duration = Math.round((leftAt.getTime() - new Date(latest.joinedAt).getTime()) / 1000);
        latest.leftAt = leftAt;
        latest.duration = Math.max(0, duration);
        await latest.save();
        return true;
      }
      return false;
    }
    const list = localDb.meetingHistories.filter((h: IMeetingHistory) => h.user === userId && h.meeting.meetingId === meetingId && !h.leftAt);
    if (list.length > 0) {
      const latest = list[list.length - 1];
      latest.leftAt = leftAt;
      latest.duration = Math.max(0, Math.round((leftAt.getTime() - new Date(latest.joinedAt).getTime()) / 1000));
      saveLocalStore();
      return true;
    }
    return false;
  }
}

export default MeetingHistoryModel;
