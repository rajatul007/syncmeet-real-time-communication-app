import type { Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import FileModel from '../models/File.ts';
import MeetingModel from '../models/Meeting.ts';
import type { AuthRequest } from '../middleware/authMiddleware.ts';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    // Sanitize and create unique filename
    const sanitizedExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const uniqueName = `${uuidv4()}${sanitizedExt}`;
    cb(null, uniqueName);
  }
});

// File filter for safety
const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.scr'];
const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25 MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (dangerousExtensions.includes(ext)) {
      return cb(new Error('Executable and script file types are restricted for security.'));
    }
    cb(null, true);
  }
}).single('file');

export function handleFileUpload(req: AuthRequest, res: Response, next: any) {
  uploadMiddleware(req as any, res as any, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'File exceeds maximum allowed size of 25MB.' });
        }
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ success: false, message: err.message || 'File upload failed.' });
    }
    next();
  });
}

export async function uploadMeetingFile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { meetingId } = req.params;
    const meeting = await MeetingModel.findOne({ meetingId });
    if (!meeting) {
      res.status(404).json({ success: false, message: 'Meeting not found' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file was uploaded.' });
      return;
    }

    const originalName = req.file.originalname.replace(/[^a-zA-Z0-9._ -]/g, '_');
    const newFile = await FileModel.create({
      meeting: meetingId,
      uploadedBy: {
        userId: req.user._id,
        name: req.user.name
      },
      originalName,
      storedName: req.file.filename,
      mimeType: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      path: req.file.path
    });

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      file: newFile
    });
  } catch (error: any) {
    console.error('[File Error] Upload:', error);
    res.status(500).json({ success: false, message: 'Failed to process file upload.' });
  }
}

export async function getMeetingFiles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { meetingId } = req.params;
    const files = await FileModel.find({ meeting: meetingId });
    res.status(200).json({ success: true, files });
  } catch (error: any) {
    console.error('[File Error] Get files:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve meeting files.' });
  }
}

export async function downloadFile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { fileId } = req.params;
    const file = await FileModel.findById(fileId);

    if (!file) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }

    const filePath = path.resolve(UPLOADS_DIR, file.storedName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'File binary does not exist on storage.' });
      return;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Type', file.mimeType);
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error: any) {
    console.error('[File Error] Download:', error);
    res.status(500).json({ success: false, message: 'Failed to download file.' });
  }
}

export async function deleteMeetingFile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { fileId } = req.params;
    const file = await FileModel.findById(fileId);

    if (!file) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }

    // Check if user is uploader or meeting host
    const meeting = await MeetingModel.findOne({ meetingId: file.meeting });
    const isHost = meeting && meeting.host._id === req.user._id;
    const isUploader = file.uploadedBy.userId === req.user._id;

    if (!isHost && !isUploader) {
      res.status(403).json({ success: false, message: 'Permission denied. Only uploader or host can delete this file.' });
      return;
    }

    // Remove from disk if exists
    const filePath = path.resolve(UPLOADS_DIR, file.storedName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('[File Warning] Failed to delete disk file:', err);
      }
    }

    await FileModel.deleteOne({ _id: fileId });

    res.status(200).json({ success: true, message: 'File deleted successfully' });
  } catch (error: any) {
    console.error('[File Error] Delete:', error);
    res.status(500).json({ success: false, message: 'Failed to delete file.' });
  }
}
