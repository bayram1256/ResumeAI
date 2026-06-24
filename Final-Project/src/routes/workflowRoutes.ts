import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  analyzeFit,
  applySuggestions,
  downloadStoredExport,
  exportResume,
  generateCoverLetter,
  listExportedDownloads
} from '../controllers/workflowController';

const router = Router();

router.get('/exports/recent', authMiddleware, listExportedDownloads);
router.get('/exports/:id/download', authMiddleware, downloadStoredExport);
router.post('/analyze', authMiddleware, analyzeFit);
router.post('/apply-suggestions', authMiddleware, applySuggestions);
router.post('/cover-letter', authMiddleware, generateCoverLetter);
router.post('/export', authMiddleware, exportResume);

export default router;
