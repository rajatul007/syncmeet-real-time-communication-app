import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { localDb, saveLocalStore, isUsingMongo } from '../config/db.ts';

export interface IFile {
  _id: string;
  meeting: string;
  uploadedBy: {
    userId: string;
    name: string;
  };
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: Date;
}

const fileSchema = new Schema<IFile>({
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

const MongooseFileModel = mongoose.models.File || mongoose.model<IFile>('File', fileSchema);

export class FileModel {
  static async create(data: Partial<IFile>): Promise<IFile> {
    if (isUsingMongo()) {
      return (await MongooseFileModel.create(data)).toObject();
    }
    const newFile: IFile = {
      _id: uuidv4(),
      meeting: data.meeting || '',
      uploadedBy: data.uploadedBy as any,
      originalName: data.originalName || 'file',
      storedName: data.storedName || '',
      mimeType: data.mimeType || 'application/octet-stream',
      size: data.size || 0,
      path: data.path || '',
      createdAt: new Date()
    };
    localDb.files.push(newFile);
    saveLocalStore();
    return { ...newFile };
  }

  static async find(query: { meeting: string }): Promise<IFile[]> {
    if (isUsingMongo()) {
      return (await MongooseFileModel.find(query).sort({ createdAt: -1 }).lean()) as IFile[];
    }
    return localDb.files
      .filter((f: IFile) => f.meeting === query.meeting)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  static async findById(id: string): Promise<IFile | null> {
    if (isUsingMongo()) {
      return (await MongooseFileModel.findById(id).lean()) as IFile | null;
    }
    const file = localDb.files.find((f: IFile) => f._id === id);
    return file ? { ...file } : null;
  }

  static async deleteOne(query: { _id: string }): Promise<boolean> {
    if (isUsingMongo()) {
      const res = await MongooseFileModel.deleteOne(query);
      return (res.deletedCount || 0) > 0;
    }
    const index = localDb.files.findIndex((f: IFile) => f._id === query._id);
    if (index === -1) return false;
    localDb.files.splice(index, 1);
    saveLocalStore();
    return true;
  }
}

export default FileModel;
