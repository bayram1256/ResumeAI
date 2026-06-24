import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createJobDescription,
  getJobDescriptions,
  getJobDescription
} from '../controllers/jobController';

const router = Router();

router.post('/', authMiddleware, createJobDescription);
router.get('/', authMiddleware, getJobDescriptions);
router.get('/:id', authMiddleware, getJobDescription);

export default router;