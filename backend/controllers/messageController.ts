import type { Response } from 'express';
import MessageModel from '../models/Message.ts';
import type { AuthRequest } from '../middleware/authMiddleware.ts';

export async function getMeetingMessages(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { meetingId } = req.params;
    if (!meetingId) {
      res.status(400).json({ success: false, message: 'Meeting ID is required' });
      return;
    }

    const messages = await MessageModel.find({ meeting: meetingId });
    res.status(200).json({ success: true, messages });
  } catch (error: any) {
    console.error('[Message Error] Get messages:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve meeting messages.' });
  }
}
