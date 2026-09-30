import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { localDb, saveLocalStore, isUsingMongo } from '../config/db.ts';

export interface IUser {
  _id: string;
  name: string;
  email: string;
  password?: string;
  profileImage?: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  profileImage: { type: String, default: '' },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const MongooseUserModel = mongoose.models.User || mongoose.model<IUser>('User', userSchema);

export class UserModel {
  static async create(data: Partial<IUser>): Promise<IUser> {
    if (isUsingMongo()) {
      return (await MongooseUserModel.create(data)).toObject();
    }
    const now = new Date();
    const newUser: IUser = {
      _id: uuidv4(),
      name: data.name || '',
      email: (data.email || '').toLowerCase().trim(),
      password: data.password || '',
      profileImage: data.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.name || 'User')}`,
      role: data.role || 'user',
      createdAt: now,
      updatedAt: now
    };
    localDb.users.push(newUser);
    saveLocalStore();
    return { ...newUser };
  }

  static async findOne(query: { email?: string; _id?: string }): Promise<IUser | null> {
    if (isUsingMongo()) {
      return (await MongooseUserModel.findOne(query).lean()) as IUser | null;
    }
    if (query.email) {
      const email = query.email.toLowerCase().trim();
      const user = localDb.users.find((u: IUser) => u.email === email);
      return user ? { ...user } : null;
    }
    if (query._id) {
      const user = localDb.users.find((u: IUser) => u._id === query._id);
      return user ? { ...user } : null;
    }
    return null;
  }

  static async findById(id: string): Promise<IUser | null> {
    if (isUsingMongo()) {
      return (await MongooseUserModel.findById(id).lean()) as IUser | null;
    }
    const user = localDb.users.find((u: IUser) => u._id === id);
    return user ? { ...user } : null;
  }

  static async findByIdAndUpdate(id: string, updates: Partial<IUser>): Promise<IUser | null> {
    if (isUsingMongo()) {
      return (await MongooseUserModel.findByIdAndUpdate(id, { ...updates, updatedAt: new Date() }, { new: true }).lean()) as IUser | null;
    }
    const index = localDb.users.findIndex((u: IUser) => u._id === id);
    if (index === -1) return null;
    localDb.users[index] = {
      ...localDb.users[index],
      ...updates,
      updatedAt: new Date()
    };
    saveLocalStore();
    return { ...localDb.users[index] };
  }
}

export default UserModel;
