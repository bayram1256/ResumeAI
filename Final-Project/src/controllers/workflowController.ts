import { Response } from 'express';
import { ExportKind } from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import fitScoreService from '../services/fitScoreService';
import aiSuggestionService, { ResumeSuggestion } from '../services/aiSuggestionService';
import { buildCoverLetterDocx, renderCoverLetterPdf } from '../services/coverLetterExport';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun
} from 'docx';

type SelectedSuggestion = {
  id: string;
  apply: boolean;
};

type ParsedResumeSection = {
  title: string;
  lines: string[];
};

type ParsedResume = {
  name: string;
  contactLines: string[];
  sections: ParsedResumeSection[];
};

function buildImprovedResumeText(
  resumeText: string,
  suggestions: ResumeSuggestion[],
  selections: SelectedSuggestion[]
): string {
  const selected = suggestions.filter((suggestion) =>
    selections.some((selection) => selection.id === suggestion.id && selection.apply)
  );

  if (selected.length === 0) {
    return resumeText;
  }

  const resumeLines = resumeText.split('\n');
  const usedLineIndexes = new Set<number>();

  const tokenize = (value: string): string[] =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2);

  const scoreLineMatch = (line: string, keywords: Set<string>): number => {
    const lineTokens = tokenize(line);
    if (lineTokens.length === 0) return 0;
    let matches = 0;
    for (const token of lineTokens) {
      if (keywords.has(token)) matches += 1;
    }
    return matches;
  };

  selected.forEach((suggestion) => {
    const improvedLine = suggestion.change.trim().replace(/^-+\s*/, '').replace(/^[•\s]+/, '');
    if (!improvedLine) return;

    const keywordSet = new Set<string>([
      ...tokenize(suggestion.title),
      ...tokenize(suggestion.reason),
      ...tokenize(suggestion.change)
    ]);

    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < resumeLines.length; i += 1) {
      if (usedLineIndexes.has(i)) continue;
      const line = resumeLines[i].trim();
      if (!line || isHeadingLine(line)) continue;
      const score = scoreLineMatch(line, keywordSet);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestScore > 0) {
      const bullet = asResumeBulletLine(improvedLine);
      resumeLines.splice(bestIndex + 1, 0, bullet);
      usedLineIndexes.add(bestIndex);
      return;
    }

    const bullet = asResumeBulletLine(improvedLine);

    let insertAfter = -1;
    if (suggestionPrefersSkillsSection(suggestion)) {
      insertAfter = findSectionLastContentLineIndex(resumeLines, (h) =>
        /\bskills?\b|technical|technologies|\btools\b|core\s+skills|tech\s+stack/i.test(h)
      );
    }
    if (insertAfter < 0 && suggestionPrefersExperienceSection(suggestion)) {
      insertAfter = findSectionLastContentLineIndex(resumeLines, (h) =>
        /experience|employment|work|professional|career/i.test(h)
      );
    }
    if (insertAfter >= 0) {
      resumeLines.splice(insertAfter + 1, 0, bullet);
      return;
    }

    const summaryIndex = resumeLines.findIndex((line) => /^summary:?$/i.test(line.trim()));
    if (summaryIndex >= 0) {
      resumeLines.splice(summaryIndex + 1, 0, bullet);
    } else {
      resumeLines.push('', bullet);
    }
  });

  return resumeLines.join('\n');
}

function isHeadingLine(line: string): boolean {
  const normalized = line.replace(/[:\s]/g, '');
  if (!normalized) return false;
  const knownHeadings = [
    'PROFESSIONALSUMMARY',
    'SUMMARY',
    'TECHNICALSKILLS',
    'SKILLS',
    'WORKEXPERIENCE',
    'EXPERIENCE',
    'PROJECTS',
    'EDUCATION',
    'CERTIFICATIONS',
    'LANGUAGES'
  ];
  if (knownHeadings.includes(normalized.toUpperCase())) return true;
  const hasLetters = /[a-zA-Z]/.test(line);
  const looksUpper = line === line.toUpperCase();
  return hasLetters && looksUpper && line.length <= 40;
}

function findSectionLastContentLineIndex(
  lines: string[],
  headingPredicate: (trimmed: string) => boolean
): number {
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (headingPredicate(t) && isHeadingLine(t)) {
      sectionStart = i;
      break;
    }
  }
  if (sectionStart < 0) return -1;
  let last = sectionStart;
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (isHeadingLine(t)) break;
    if (t) last = i;
  }
  return last;
}

function suggestionPrefersSkillsSection(s: ResumeSuggestion): boolean {
  const blob = `${s.title} ${s.reason} ${s.change}`.toLowerCase();
  return (
    /\bskills?\b|\btech(nical)?\b|technologies|\btools\b|\bstack\b|kubernetes|docker|terraform|aws|azure|gcp|ci\/cd|\bml\b|python|java|react|\bnode\.?js\b|\bnode\b|sql|database|typescript/.test(
      blob
    ) || /evidence for|keyword|gap|missing|emphasizes/.test(blob)
  );
}

function suggestionPrefersExperienceSection(s: ResumeSuggestion): boolean {
  const blob = `${s.title} ${s.reason} ${s.change}`.toLowerCase();
  return /experience|employment|work history|achievement|delivered|led |owned |built |improved |reduced |increased |migration|rollout|platform/.test(
    blob
  );
}

function asResumeBulletLine(text: string): string {
  const t = text.trim().replace(/^[•\-\*\s\u2022]+/u, '').trim();
  if (!t) return '- ';
  return `- ${t}`;
}

function parseResumeContent(content: string): ParsedResume {
  const rawLines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const sections: ParsedResumeSection[] = [];
  const contactLines: string[] = [];
  let name = 'Candidate Name';

  if (rawLines.length > 0) {
    name = rawLines[0];
  }

  let firstHeadingIndex = rawLines.findIndex((line, idx) => idx > 0 && isHeadingLine(line));
  if (firstHeadingIndex < 0) firstHeadingIndex = rawLines.length;

  for (let i = 1; i < firstHeadingIndex; i += 1) {
    contactLines.push(rawLines[i]);
  }

  let current: ParsedResumeSection | null = null;
  for (let i = firstHeadingIndex; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    if (isHeadingLine(line)) {
      current = {
        title: line.replace(/:$/, ''),
        lines: []
      };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: 'Summary', lines: [] };
      sections.push(current);
    }
    current.lines.push(line);
  }

  if (sections.length === 0) {
    sections.push({
      title: 'Summary',
      lines: rawLines.slice(1)
    });
  }

  return { name, contactLines, sections };
}

/** Classic single-column layout: centered header, teal accents, section underlines (ATS-friendly). */
function renderTailoredTemplate(doc: PDFKit.PDFDocument, parsed: ParsedResume): void {
  const teal = '#0d9488';
  const textDark = '#0f172a';
  const textMuted = '#475569';
  const body = '#334155';
  const pageMargin = 50;
  const w = doc.page.width - 2 * pageMargin;

  const drawTopBar = () => {
    doc.save();
    doc.rect(0, 0, doc.page.width, 16).fill(teal);
    doc.restore();
  };

  drawTopBar();
  let y = 28;
  doc.fillColor(textDark).font('Helvetica-Bold').fontSize(22).text(parsed.name, pageMargin, y, {
    width: w,
    align: 'center'
  });
  y = doc.y + 6;
  doc.font('Helvetica').fontSize(9).fillColor(textMuted);
  parsed.contactLines.slice(0, 8).forEach((line) => {
    doc.text(line, pageMargin, y, { width: w, align: 'center', lineGap: 2 });
    y = doc.y + 2;
  });
  y += 14;
  doc.x = pageMargin;
  doc.y = y;

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > doc.page.height - pageMargin) {
      doc.addPage();
      drawTopBar();
      doc.x = pageMargin;
      doc.y = pageMargin + 8;
    }
  };

  for (const section of parsed.sections) {
    ensureSpace(44);
    doc.fillColor(textDark).font('Helvetica-Bold').fontSize(11.5);
    doc.text(section.title.toUpperCase(), pageMargin, doc.y, { width: w });
    const underlineY = doc.y + 2;
    doc
      .strokeColor(teal)
      .lineWidth(2.5)
      .moveTo(pageMargin, underlineY)
      .lineTo(pageMargin + Math.min(220, w * 0.42), underlineY)
      .stroke();
    doc.moveDown(0.5);
    doc.fillColor(body).font('Helvetica').fontSize(10.5);
    for (const line of section.lines) {
      ensureSpace(26);
      if (line.startsWith('- ')) {
        doc.text(`• ${line.slice(2)}`, { width: w, lineGap: 3, indent: 14 });
      } else {
        doc.text(line, { width: w, lineGap: 3 });
      }
    }
    doc.moveDown(0.55);
  }
}

function renderModernTemplate(doc: PDFKit.PDFDocument, parsed: ParsedResume): void {
  const navy = '#0f172a';
  const accent = '#1d4ed8';
  const body = '#334155';
  const muted = '#cbd5e1';
  const pageMargin = 50;
  const w = doc.page.width - 2 * pageMargin;
  let bodyStartY = 108;

  const drawHero = () => {
    doc.save();
    doc.rect(0, 0, doc.page.width, 88).fill(navy);
    doc.restore();
    let y = 26;
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(21).text(parsed.name, pageMargin, y, { width: w });
    y = doc.y + 5;
    doc.font('Helvetica').fontSize(9).fillColor(muted);
    parsed.contactLines.slice(0, 8).forEach((line) => {
      doc.text(line, pageMargin, y, { width: w, lineGap: 1 });
      y = doc.y + 2;
    });
    bodyStartY = Math.max(y + 14, 98);
  };

  const drawContinuationStrip = () => {
    doc.save();
    doc.rect(0, 0, doc.page.width, 14).fill(navy);
    doc.restore();
    bodyStartY = 28;
  };

  const placeBodyCursor = () => {
    doc.x = pageMargin;
    doc.y = bodyStartY;
  };

  const ensureSpace = (needed: number) => {
    if (doc.y + needed <= doc.page.height - pageMargin) {
      return;
    }
    doc.addPage();
    drawContinuationStrip();
    placeBodyCursor();
  };

  drawHero();
  placeBodyCursor();

  for (const section of parsed.sections) {
    ensureSpace(44);
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(12);
    doc.text(section.title.toUpperCase(), pageMargin, doc.y, { width: w });
    const underlineY = doc.y + 2;
    doc
      .strokeColor(accent)
      .lineWidth(2)
      .moveTo(pageMargin, underlineY)
      .lineTo(pageMargin + Math.min(200, w * 0.42), underlineY)
      .stroke();
    doc.moveDown(0.45);
    doc.fillColor(body).font('Helvetica').fontSize(10.5);
    for (const line of section.lines) {
      ensureSpace(26);
      if (line.startsWith('- ')) {
        doc.text(`• ${line.slice(2)}`, pageMargin, doc.y, { width: w, lineGap: 3, indent: 12 });
      } else {
        doc.text(line, pageMargin, doc.y, { width: w, lineGap: 3 });
      }
    }
    doc.moveDown(0.5);
  }
}

async function buildTailoredDocx(parsed: ParsedResume): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: parsed.name, bold: true, size: 40, color: '0F172A' })]
    })
  );

  parsed.contactLines.slice(0, 8).forEach((line) => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: line, size: 20, color: '475569' })]
      })
    );
  });

  children.push(new Paragraph({ spacing: { after: 200 } }));

  for (const section of parsed.sections) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 120 },
        border: {
          bottom: {
            color: '0D9488',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 12
          }
        },
        children: [
          new TextRun({
            text: section.title.toUpperCase(),
            bold: true,
            size: 26,
            color: '0F172A'
          })
        ]
      })
    );

    for (const line of section.lines) {
      if (line.startsWith('- ')) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80 },
            children: [new TextRun({ text: line.slice(2), size: 22, color: '334155' })]
          })
        );
      } else {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: line, size: 22, color: '334155' })]
          })
        );
      }
    }
  }

  const document = new Document({
    sections: [{ children }]
  });
  return Packer.toBuffer(document);
}

async function buildModernDocx(parsed: ParsedResume): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: parsed.name, bold: true, size: 44, color: '0F172A' })]
    })
  );

  parsed.contactLines.slice(0, 8).forEach((line) => {
    children.push(
      new Paragraph({
        spacing: { after: 50 },
        children: [new TextRun({ text: line, size: 20, color: '64748B' })]
      })
    );
  });

  children.push(new Paragraph({ spacing: { after: 200 } }));

  for (const section of parsed.sections) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 120 },
        border: {
          bottom: {
            color: '2563EB',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 12
          }
        },
        children: [
          new TextRun({
            text: section.title.toUpperCase(),
            bold: true,
            size: 26,
            color: '1D4ED8'
          })
        ]
      })
    );

    for (const line of section.lines) {
      if (line.startsWith('- ')) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80 },
            children: [new TextRun({ text: line.slice(2), size: 22, color: '334155' })]
          })
        );
      } else {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: line, size: 22, color: '334155' })]
          })
        );
      }
    }
  }

  const document = new Document({
    sections: [{ children }]
  });
  return Packer.toBuffer(document);
}

export async function analyzeFit(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { resumeId, jobDescriptionId } = req.body;

    if (!resumeId || !jobDescriptionId) {
      return res.status(400).json({ error: 'resumeId and jobDescriptionId are required' });
    }

    const resume = await prisma.resume.findFirst({
      where: { id: resumeId, userId }
    });
    const job = await prisma.jobDescription.findFirst({
      where: { id: jobDescriptionId, userId }
    });

    if (!resume || !job) {
      return res.status(404).json({ error: 'Resume or job description not found' });
    }

    const score = await fitScoreService.calculate(resume.parsedText, job.normalizedText);
    const suggestions = await aiSuggestionService.generate(
      resume.parsedText,
      job.normalizedText,
      score.missingSkills
    );

    const report = await prisma.fitReport.create({
      data: {
        userId,
        resumeId: resume.id,
        jobDescriptionId: job.id,
        overallScore: score.overallScore,
        skillsScore: score.skillsScore,
        experienceScore: score.experienceScore,
        educationScore: score.educationScore,
        missingSkills: score.missingSkills,
        matchedSkills: score.matchedSkills
      }
    });

    res.json({
      reportId: report.id,
      scores: {
        overall: score.overallScore,
        skills: score.skillsScore,
        experience: score.experienceScore,
        education: score.educationScore
      },
      matchedSkills: score.matchedSkills,
      missingSkills: score.missingSkills,
      suggestions
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze fit score' });
  }
}

export async function applySuggestions(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { resumeId, jobDescriptionId, suggestions, selections } = req.body as {
      resumeId: string;
      jobDescriptionId: string;
      suggestions: ResumeSuggestion[];
      selections: SelectedSuggestion[];
    };

    if (!resumeId || !jobDescriptionId || !Array.isArray(suggestions) || !Array.isArray(selections)) {
      return res.status(400).json({ error: 'resumeId, jobDescriptionId, suggestions and selections are required' });
    }

    const resume = await prisma.resume.findFirst({
      where: { id: resumeId, userId }
    });
    const job = await prisma.jobDescription.findFirst({
      where: { id: jobDescriptionId, userId }
    });

    if (!resume || !job) {
      return res.status(404).json({ error: 'Resume or job description not found' });
    }

    const improvedResumeText = buildImprovedResumeText(
      resume.parsedText,
      suggestions,
      selections
    );
    const newScore = await fitScoreService.calculate(improvedResumeText, job.normalizedText);

    const report = await prisma.fitReport.create({
      data: {
        userId,
        resumeId: resume.id,
        jobDescriptionId: job.id,
        overallScore: newScore.overallScore,
        skillsScore: newScore.skillsScore,
        experienceScore: newScore.experienceScore,
        educationScore: newScore.educationScore,
        missingSkills: newScore.missingSkills,
        matchedSkills: newScore.matchedSkills
      }
    });

    res.json({
      reportId: report.id,
      improvedResumeText,
      scores: {
        overall: newScore.overallScore,
        skills: newScore.skillsScore,
        experience: newScore.experienceScore,
        education: newScore.educationScore
      },
      matchedSkills: newScore.matchedSkills,
      missingSkills: newScore.missingSkills
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to apply suggestions' });
  }
}

export async function generateCoverLetter(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { jobDescriptionId, resumeId, resumeText: bodyResumeText } = req.body as {
      jobDescriptionId?: string;
      resumeId?: string;
      resumeText?: string;
    };

    if (!jobDescriptionId) {
      return res.status(400).json({ error: 'jobDescriptionId is required' });
    }

    const job = await prisma.jobDescription.findFirst({
      where: { id: jobDescriptionId, userId }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job description not found' });
    }

    // Resolve resume text: direct body text > resumeId lookup
    let resumeText: string | undefined;
    if (bodyResumeText && bodyResumeText.trim().length > 80) {
      resumeText = bodyResumeText.trim();
    } else if (resumeId) {
      const resume = await prisma.resume.findFirst({
        where: { id: resumeId, userId }
      });
      if (resume?.parsedText) {
        resumeText = resume.parsedText;
      }
    }

    const jobText = job.normalizedText?.trim() ? job.normalizedText : job.rawText;
    const coverLetter = await aiSuggestionService.generateCoverLetterFromJob(jobText, resumeText);

    try {
      await prisma.coverLetter.create({
        data: {
          userId,
          jobDescriptionId: job.id,
          title: job.title?.trim() ? job.title : 'Cover letter',
          body: coverLetter
        }
      });
    } catch (e) {
      console.warn('[generateCoverLetter] could not persist cover letter row:', e);
    }

    res.json({ coverLetter });
  } catch (error) {
    console.error('[generateCoverLetter]', error);
    res.status(500).json({ error: 'Failed to generate cover letter' });
  }
}

const EXPORT_RECORD_MAX_CHARS = 500000;

async function tryRecordExportedDownload(params: {
  userId: string;
  kind: ExportKind;
  format: 'pdf' | 'docx';
  displayName: string;
  template: string | null;
  content: string;
}): Promise<void> {
  try {
    const body =
      params.content.length > EXPORT_RECORD_MAX_CHARS
        ? params.content.slice(0, EXPORT_RECORD_MAX_CHARS)
        : params.content;
    await prisma.exportedDownload.create({
      data: {
        userId: params.userId,
        kind: params.kind,
        format: params.format,
        displayName: params.displayName.slice(0, 200),
        template: params.template,
        content: body
      }
    });
  } catch (e) {
    console.warn('[exportResume] could not record exported download:', e);
  }
}

export async function listExportedDownloads(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const items = await prisma.exportedDownload.findMany({
      where: { userId },
      select: {
        id: true,
        kind: true,
        format: true,
        displayName: true,
        template: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list downloads' });
  }
}

export async function downloadStoredExport(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;

    const row = await prisma.exportedDownload.findFirst({
      where: { id, userId }
    });
    if (!row) {
      return res.status(404).json({ error: 'Export not found' });
    }

    const safeName = row.displayName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60);
    const template = (row.template === 'modern' ? 'modern' : 'tailored') as 'tailored' | 'modern';

    if (row.kind === ExportKind.COVER_LETTER) {
      if (row.format === 'docx') {
        const buffer = await buildCoverLetterDocx(row.content);
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
      renderCoverLetterPdf(doc, row.content);
      doc.end();
      return;
    }

    const parsed = parseResumeContent(row.content);
    if (row.format === 'docx') {
      const buffer =
        template === 'modern' ? await buildModernDocx(parsed) : await buildTailoredDocx(parsed);
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
    if (template === 'modern') {
      renderModernTemplate(doc, parsed);
    } else {
      renderTailoredTemplate(doc, parsed);
    }
    doc.end();
  } catch (error) {
    console.error('[downloadStoredExport]', error);
    res.status(500).json({ error: 'Failed to download export' });
  }
}

export async function exportResume(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { content, fileName, resumeId, exportMode } = req.body as {
      content?: string;
      fileName?: string;
      resumeId?: string;
      exportMode?: 'original' | 'improvedPdf';
      template?: 'tailored' | 'modern';
      exportFormat?: 'pdf' | 'docx';
      documentType?: 'resume' | 'coverLetter';
    };
    const template = (req.body?.template as 'tailored' | 'modern' | undefined) || 'tailored';
    const exportFormat = (req.body?.exportFormat as 'pdf' | 'docx' | undefined) || 'pdf';
    const documentType = (req.body?.documentType as 'resume' | 'coverLetter' | undefined) || 'resume';

    const safeName = (fileName || (documentType === 'coverLetter' ? 'cover_letter' : 'improved_resume'))
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 60);

    if (resumeId && exportMode !== 'improvedPdf') {
      const resume = await prisma.resume.findFirst({
        where: { id: resumeId, userId }
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
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content or resumeId is required' });
    }

    if (documentType === 'coverLetter') {
      if (exportFormat === 'docx') {
        const buffer = await buildCoverLetterDocx(content);
        await tryRecordExportedDownload({
          userId,
          kind: ExportKind.COVER_LETTER,
          format: 'docx',
          displayName: safeName,
          template: null,
          content
        });
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
        return res.send(buffer);
      }

      await tryRecordExportedDownload({
        userId,
        kind: ExportKind.COVER_LETTER,
        format: 'pdf',
        displayName: safeName,
        template: null,
        content
      });
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
      doc.pipe(res);
      renderCoverLetterPdf(doc, content);
      doc.end();
      return;
    }

    const parsed = parseResumeContent(content);

    if (exportFormat === 'docx') {
      const buffer =
        template === 'modern' ? await buildModernDocx(parsed) : await buildTailoredDocx(parsed);
      await tryRecordExportedDownload({
        userId,
        kind: ExportKind.IMPROVED_RESUME,
        format: 'docx',
        displayName: safeName,
        template,
        content
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
      return res.send(buffer);
    }

    await tryRecordExportedDownload({
      userId,
      kind: ExportKind.IMPROVED_RESUME,
      format: 'pdf',
      displayName: safeName,
      template,
      content
    });
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    doc.pipe(res);

    if (template === 'modern') {
      renderModernTemplate(doc, parsed);
    } else {
      renderTailoredTemplate(doc, parsed);
    }

    doc.end();
  } catch (error) {
    res.status(500).json({ error: 'Failed to export resume' });
  }
}