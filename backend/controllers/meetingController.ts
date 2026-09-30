import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import MeetingModel from '../models/Meeting.ts';
import MeetingHistoryModel from '../models/MeetingHistory.ts';
import type { AuthRequest } from '../middleware/authMiddleware.ts';

// Helper to generate friendly meeting IDs: "abc-defg-hij"
function generateMeetingId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const part1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part3 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part1}-${part2}-${part3}`;
}

export async function createMeeting(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { title, description, scheduledAt } = req.body;
    const meetingTitle = title && title.trim() ? title.trim() : `${req.user.name}'s Meeting`;
    const meetingId = generateMeetingId();

    const newMeeting = await MeetingModel.create({
      meetingId,
      title: meetingTitle,
      description: description || '',
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
          joinedAt: new Date()
        }
      ],
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      status: 'active'
    });

    // Record in MeetingHistory for creator
    await MeetingHistoryModel.create({
      user: req.user._id,
      meeting: {
        meetingId: newMeeting.meetingId,
        title: newMeeting.title,
        hostName: newMeeting.host.name
      },
      joinedAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Meeting created successfully',
      meeting: newMeeting
    });
  } catch (error: any) {
    console.error('[Meeting Error] Create:', error);
    res.status(500).json({ success: false, message: 'Failed to create meeting.' });
  }
}

export async function getMeetings(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const meetings = await MeetingModel.find({ 'host._id': req.user._id });
    res.status(200).json({ success: true, meetings });
  } catch (error: any) {
    console.error('[Meeting Error] Get meetings:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve meetings.' });
  }
}

export async function getMeetingById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { meetingId } = req.params;
    if (!meetingId) {
      res.status(400).json({ success: false, message: 'Meeting ID is required' });
      return;
    }

    const meeting = await MeetingModel.findOne({ meetingId });
    if (!meeting) {
      res.status(404).json({ success: false, message: 'Meeting not found' });
      return;
    }

    if (meeting.status === 'ended') {
      res.status(410).json({ success: false, message: 'This meeting has already ended by the host.' });
      return;
    }

    res.status(200).json({ success: true, meeting });
  } catch (error: any) {
    console.error('[Meeting Error] Get meeting by ID:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch meeting details.' });
  }
}

export async function joinMeeting(req: AuthRequest, res: Response): Promise<void> {
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

    if (meeting.status === 'ended') {
      res.status(410).json({ success: false, message: 'This meeting has already ended.' });
      return;
    }

    // Add participant to meeting
    const participant = {
      userId: req.user._id,
      name: req.user.name,
      email: req.user.email,
      profileImage: req.user.profileImage,
      joinedAt: new Date()
    };
    await MeetingModel.addParticipant(meetingId, participant);

    // Record in MeetingHistory
    await MeetingHistoryModel.create({
      user: req.user._id,
      meeting: {
        meetingId: meeting.meetingId,
        title: meeting.title,
        hostName: meeting.host.name
      },
      joinedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Joined meeting successfully',
      meeting
    });
  } catch (error: any) {
    console.error('[Meeting Error] Join meeting:', error);
    res.status(500).json({ success: false, message: 'Failed to join meeting.' });
  }
}

export async function leaveMeeting(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { meetingId } = req.params;
    await MeetingHistoryModel.updateLatest(req.user._id, meetingId, new Date());

    res.status(200).json({ success: true, message: 'Left meeting successfully' });
  } catch (error: any) {
    console.error('[Meeting Error] Leave meeting:', error);
    res.status(500).json({ success: false, message: 'Failed to record leaving meeting.' });
  }
}

export async function endMeeting(req: AuthRequest, res: Response): Promise<void> {
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

    if (meeting.host._id !== req.user._id) {
      res.status(403).json({ success: false, message: 'Only the meeting host can end this meeting for everyone.' });
      return;
    }

    await MeetingModel.updateOne({ meetingId }, { status: 'ended', endedAt: new Date() });

    res.status(200).json({ success: true, message: 'Meeting ended successfully.' });
  } catch (error: any) {
    console.error('[Meeting Error] End meeting:', error);
    res.status(500).json({ success: false, message: 'Failed to end meeting.' });
  }
}

export async function getMeetingHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const history = await MeetingHistoryModel.find({ user: req.user._id });
    res.status(200).json({ success: true, history });
  } catch (error: any) {
    console.error('[Meeting Error] Get history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch meeting history.' });
  }
}
