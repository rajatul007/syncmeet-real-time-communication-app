import { Router } from 'express';
import {
  createMeeting,
  getMeetings,
  getMeetingById,
  joinMeeting,
  leaveMeeting,
  endMeeting,
  getMeetingHistory
} from '../controllers/meetingController.ts';
import { getMeetingMessages } from '../controllers/messageController.ts';
import { uploadMeetingFile, getMeetingFiles, handleFileUpload } from '../controllers/fileController.ts';
import { protect } from '../middleware/authMiddleware.ts';

const router = Router();

router.use(protect);

router.post('/', createMeeting);
router.get('/', getMeetings);
router.get('/history/all', getMeetingHistory);
router.get('/:meetingId', getMeetingById);
router.post('/:meetingId/join', joinMeeting);
router.post('/:meetingId/leave', leaveMeeting);
router.post('/:meetingId/end', endMeeting);

// Sub-resources for meeting messages & files
router.get('/:meetingId/messages', getMeetingMessages);
router.get('/:meetingId/files', getMeetingFiles);
router.post('/:meetingId/files', handleFileUpload, uploadMeetingFile);

export default router;
