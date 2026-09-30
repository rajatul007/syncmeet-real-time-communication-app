import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { localDb, saveLocalStore, isUsingMongo } from '../config/db.ts';

export interface IParticipant {
  userId: string;
  name: string;
  email: string;
  profileImage?: string;
  joinedAt: Date;
}

export interface IMeeting {
  _id: string;
  meetingId: string;
  title: string;
  description?: string;
  host: {
    _id: string;
    name: string;
    email: string;
    profileImage?: string;
  };
  participants: IParticipant[];
  scheduledAt?: Date;
  status: 'scheduled' | 'active' | 'ended';
  createdAt: Date;
  endedAt?: Date;
}

const meetingSchema = new Schema<IMeeting>({
  meetingId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
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
  status: { type: String, enum: ['scheduled', 'active', 'ended'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  endedAt: { type: Date }
});

const MongooseMeetingModel = mongoose.models.Meeting || mongoose.model<IMeeting>('Meeting', meetingSchema);

export class MeetingModel {
  static async create(data: Partial<IMeeting>): Promise<IMeeting> {
    if (isUsingMongo()) {
      return (await MongooseMeetingModel.create(data)).toObject();
    }
    const newMeeting: IMeeting = {
      _id: uuidv4(),
      meetingId: data.meetingId || uuidv4().slice(0, 9),
      title: data.title || 'Untitled Meeting',
      description: data.description || '',
      host: data.host as any,
      participants: data.participants || [],
      scheduledAt: data.scheduledAt,
      status: data.status || 'active',
      createdAt: new Date(),
      endedAt: undefined
    };
    localDb.meetings.push(newMeeting);
    saveLocalStore();
    return { ...newMeeting };
  }

  static async findOne(query: { meetingId?: string; _id?: string }): Promise<IMeeting | null> {
    if (isUsingMongo()) {
      return (await MongooseMeetingModel.findOne(query).lean()) as IMeeting | null;
    }
    if (query.meetingId) {
      const m = localDb.meetings.find((item: IMeeting) => item.meetingId === query.meetingId);
      return m ? { ...m } : null;
    }
    if (query._id) {
      const m = localDb.meetings.find((item: IMeeting) => item._id === query._id);
      return m ? { ...m } : null;
    }
    return null;
  }

  static async find(query: { 'host._id'?: string; 'participants.userId'?: string; status?: string }): Promise<IMeeting[]> {
    if (isUsingMongo()) {
      return (await MongooseMeetingModel.find(query).sort({ createdAt: -1 }).lean()) as IMeeting[];
    }
    let list = [...localDb.meetings];
    if (query['host._id']) {
      list = list.filter((m: IMeeting) => m.host && m.host._id === query['host._id']);
    }
    if (query.status) {
      list = list.filter((m: IMeeting) => m.status === query.status);
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  static async updateOne(query: { meetingId: string }, updates: Partial<IMeeting>): Promise<boolean> {
    if (isUsingMongo()) {
      await MongooseMeetingModel.updateOne(query, updates);
      return true;
    }
    const index = localDb.meetings.findIndex((m: IMeeting) => m.meetingId === query.meetingId);
    if (index === -1) return false;
    localDb.meetings[index] = {
      ...localDb.meetings[index],
      ...updates
    };
    saveLocalStore();
    return true;
  }

  static async addParticipant(meetingId: string, participant: IParticipant): Promise<IMeeting | null> {
    if (isUsingMongo()) {
      return (await MongooseMeetingModel.findOneAndUpdate(
        { meetingId },
        { $addToSet: { participants: participant } },
        { new: true }
      ).lean()) as IMeeting | null;
    }
    const meeting = localDb.meetings.find((m: IMeeting) => m.meetingId === meetingId);
    if (!meeting) return null;
    const exists = meeting.participants.some((p: IParticipant) => p.userId === participant.userId);
    if (!exists) {
      meeting.participants.push(participant);
      saveLocalStore();
    }
    return { ...meeting };
  }
}

export default MeetingModel;
