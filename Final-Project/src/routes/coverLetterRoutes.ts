import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { downloadCoverLetter, listCoverLetters } from '../controllers/coverLetterController';

const router = Router();

router.get('/', authMiddleware, listCoverLetters);
router.get('/:id/download', authMiddleware, downloadCoverLetter);

export default router;
