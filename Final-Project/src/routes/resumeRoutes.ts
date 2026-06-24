import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  uploadResume,
  getResumes,
  getResume,
  deleteResume,
  downloadResumeFile
} from '../controllers/resumeController';

const router = Router();

router.post('/upload', authMiddleware, upload.single('resume'), uploadResume);
router.get('/', authMiddleware, getResumes);
router.get('/:id/download', authMiddleware, downloadResumeFile);
router.get('/:id', authMiddleware, getResume);
router.delete('/:id', authMiddleware, deleteResume);

export default router;