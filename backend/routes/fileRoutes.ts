import { Router } from 'express';
import { downloadFile, deleteMeetingFile } from '../controllers/fileController.ts';
import { protect } from '../middleware/authMiddleware.ts';

const router = Router();

router.use(protect);

router.get('/:fileId/download', downloadFile);
router.delete('/:fileId', deleteMeetingFile);

export default router;
