import { Router } from 'express';
import { getProfile } from '../controllers/profileController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/profile', authMiddleware, getProfile);

export default router;