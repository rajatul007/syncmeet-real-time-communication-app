import { Router } from 'express';
import { register, login, getMe, updateProfile, logout } from '../controllers/authController.ts';
import { protect } from '../middleware/authMiddleware.ts';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.post('/logout', protect, logout);

export default router;
