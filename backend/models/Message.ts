import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { localDb, saveLocalStore, isUsingMongo } from '../config/db.ts';

export interface IMessage {
  _id: string;
  meeting: string; // meetingId
  sender: {
    userId: string;
    name: string;
    profileImage?: string;
  };
  message: string;
  isSystem?: boolean;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>({
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

const MongooseMessageModel = mongoose.models.Message || mongoose.model<IMessage>('Message', messageSchema);

export class MessageModel {
  static async create(data: Partial<IMessage>): Promise<IMessage> {
    if (isUsingMongo()) {
      return (await MongooseMessageModel.create(data)).toObject();
    }
    const newMsg: IMessage = {
      _id: uuidv4(),
      meeting: data.meeting || '',
      sender: data.sender as any,
      message: data.message || '',
      isSystem: !!data.isSystem,
      createdAt: new Date()
    };
    localDb.messages.push(newMsg);
    saveLocalStore();
    return { ...newMsg };
  }

  static async find(query: { meeting: string }): Promise<IMessage[]> {
    if (isUsingMongo()) {
      return (await MongooseMessageModel.find(query).sort({ createdAt: 1 }).lean()) as IMessage[];
    }
    return localDb.messages
      .filter((m: IMessage) => m.meeting === query.meeting)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
}

export default MessageModel;
