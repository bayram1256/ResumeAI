import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';

export async function createJobDescription(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { title, company, rawText } = req.body;
    
    if (!rawText) {
      return res.status(400).json({ error: 'Job description text required' });
    }
    
    // Normalize text
    const normalizedText = rawText.replace(/\s+/g, ' ').trim();
    
    // Save to database
    const jobDescription = await prisma.jobDescription.create({
      data: {
        userId,
        title: title || 'Untitled Position',
        company: company || '',
        rawText,
        normalizedText
      }
    });
    
    res.status(201).json({
      id: jobDescription.id,
      title: jobDescription.title,
      company: jobDescription.company,
      createdAt: jobDescription.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create job description' });
  }
}

export async function getJobDescriptions(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    
    const jobs = await prisma.jobDescription.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        company: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job descriptions' });
  }
}

export async function getJobDescription(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;
    
    const job = await prisma.jobDescription.findFirst({
      where: { id, userId }
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job description not found' });
    }
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job description' });
  }
}