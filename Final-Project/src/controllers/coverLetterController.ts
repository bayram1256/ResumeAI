import { Response } from 'express';
import PDFDocument from 'pdfkit';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { buildCoverLetterDocx, renderCoverLetterPdf } from '../services/coverLetterExport';

const LIST_LIMIT = 10;

export async function listCoverLetters(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const items = await prisma.coverLetter.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        jobDescriptionId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cover letters' });
  }
}

export async function downloadCoverLetter(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;
    const format = (req.query.format as string)?.toLowerCase() === 'docx' ? 'docx' : 'pdf';

    const letter = await prisma.coverLetter.findFirst({
      where: { id, userId }
    });
    if (!letter) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }

    const safeName = letter.title.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60) || 'cover_letter';

    if (format === 'docx') {
      const buffer = await buildCoverLetterDocx(letter.body);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
      return res.send(buffer);
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    doc.pipe(res);
    renderCoverLetterPdf(doc, letter.body);
    doc.end();
  } catch (error) {
    console.error('[downloadCoverLetter]', error);
    res.status(500).json({ error: 'Failed to export cover letter' });
  }
}
