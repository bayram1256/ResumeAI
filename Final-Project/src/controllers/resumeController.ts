import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import parserService from '../services/parserService';

export async function uploadResume(req: AuthRequest, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const userId = req.userId as string;
    const file = req.file;
    
    // Parse the file
    const parsedText = await parserService.parseFile(file.path, file.mimetype);
    
    // Save to database
    const resume = await prisma.resume.create({
      data: {
        userId,
        originalFilename: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        fileType: file.mimetype,
        parsedText
      }
    });
    
    res.status(201).json({
      id: resume.id,
      filename: resume.originalFilename,
      size: resume.fileSize,
      createdAt: resume.createdAt
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
}

export async function getResumes(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const rawLimit = req.query.limit;
    let take = 100;
    if (rawLimit !== undefined) {
      const n = parseInt(String(rawLimit), 10);
      if (!Number.isNaN(n) && n > 0) take = Math.min(n, 50);
    }

    const resumes = await prisma.resume.findMany({
      where: { userId },
      select: {
        id: true,
        originalFilename: true,
        fileSize: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take
    });

    res.json(resumes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resumes' });
  }
}

export async function downloadResumeFile(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;

    const resume = await prisma.resume.findFirst({
      where: { id, userId }
    });
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const absolutePath = path.isAbsolute(resume.filePath)
      ? resume.filePath
      : path.join(process.cwd(), resume.filePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Resume file not found on server' });
    }

    res.setHeader('Content-Type', resume.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${resume.originalFilename}"`);
    return res.sendFile(absolutePath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download resume' });
  }
}

export async function getResume(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;
        
    const resume = await prisma.resume.findFirst({
      where: { id, userId }
    });
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }
    
    res.json(resume);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
}

export async function deleteResume(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;
    
    const resume = await prisma.resume.findFirst({
      where: { id, userId }
    });
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }
    
    await prisma.resume.delete({ where: { id } });
    
    res.json({ message: 'Resume deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete resume' });
  }
}