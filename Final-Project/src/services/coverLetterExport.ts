import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';

type PdfDoc = InstanceType<typeof PDFDocument>;

export function renderCoverLetterPdf(doc: PdfDoc, body: string): void {
  const margin = 50;
  const w = doc.page.width - 2 * margin;
  const chunks = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const paras = chunks.length > 0 ? chunks : [body.trim() || ' '];
  doc.fillColor('#0f172a').font('Helvetica').fontSize(11);
  for (const p of paras) {
    const text = p.replace(/\n/g, ' ');
    if (doc.y > doc.page.height - 72) {
      doc.addPage();
      doc.fillColor('#0f172a').font('Helvetica').fontSize(11);
    }
    doc.text(text, margin, doc.y, { width: w, align: 'left', lineGap: 3 });
    doc.moveDown(0.65);
  }
}

export async function buildCoverLetterDocx(body: string): Promise<Buffer> {
  const chunks = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const children =
    chunks.length > 0
      ? chunks.map(
          (p) =>
            new Paragraph({
              spacing: { after: 220 },
              children: [new TextRun({ text: p.replace(/\n/g, ' '), size: 22, color: '0F172A' })]
            })
        )
      : [
          new Paragraph({
            children: [new TextRun({ text: body.trim() || ' ', size: 22, color: '0F172A' })]
          })
        ];
  const document = new Document({
    sections: [{ children }]
  });
  return Packer.toBuffer(document);
}
