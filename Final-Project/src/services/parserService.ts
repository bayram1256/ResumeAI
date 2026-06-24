const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import fs from 'fs/promises';

class ParserService {

  async parsePDF(filePath: string): Promise<string> {

    const dataBuffer = await fs.readFile(filePath);
    try {
      const data = await pdfParse(dataBuffer);
      const normalized = this.normalizeText(data.text || '');
      if (normalized) return normalized;
    } catch (error) {
      // Fallback to keep workflow running even for malformed/scanned PDFs.
    }
    return 'Resume content could not be extracted automatically from PDF.';

  }

  async parseDOCX(filePath: string): Promise<string> {

    try {
      const result = await mammoth.extractRawText({
        path: filePath
      });
      const normalized = this.normalizeText(result.value || '');
      if (normalized) return normalized;
    } catch (error) {
      // Fallback if extraction fails for unsupported DOCX structure.
    }
    return 'Resume content could not be extracted automatically from DOCX.';

  }

  normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')        // Windows linebreaks → Unix
      .replace(/[ \t]+/g, ' ')       // только горизонтальные пробелы
      .replace(/\n{3,}/g, '\n\n')    // максимум одна пустая строка
      .trim();
  }

  async parseFile(filePath: string, fileType: string): Promise<string> {

    if (fileType === 'application/pdf') {

      return this.parsePDF(filePath);

    }

    if (
      fileType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {

      return this.parseDOCX(filePath);

    }

    throw new Error('Unsupported file type');

  }

}

export default new ParserService();