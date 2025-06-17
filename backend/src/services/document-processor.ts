import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { log } from '../utils/logger';

export interface DocumentContent {
  text: string;
  error?: string;
}

export const extractTextFromFile = async (filePath: string, mimeType: string): Promise<DocumentContent> => {
  try {
    if (!fs.existsSync(filePath)) {
      return { text: '', error: 'File not found' };
    }

    const buffer = fs.readFileSync(filePath);

    if (mimeType === 'application/pdf') {
      return await extractPdfText(buffer);
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return await extractDocxText(buffer);
    } else if (mimeType === 'application/msword') {
      return { text: '', error: 'Legacy .doc files are not supported. Please use .docx format.' };
    } else {
      return { text: '', error: `Unsupported file type: ${mimeType}` };
    }
  } catch (error) {
    log.error('Error extracting text from file:', error);
    return { text: '', error: 'Failed to extract text from document' };
  }
};

const extractPdfText = async (buffer: Buffer): Promise<DocumentContent> => {
  try {
    const data = await pdfParse(buffer);
    return { text: data.text.trim() };
  } catch (error) {
    log.error('Error parsing PDF:', error);
    return { text: '', error: 'Failed to parse PDF file' };
  }
};

const extractDocxText = async (buffer: Buffer): Promise<DocumentContent> => {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value.trim() };
  } catch (error) {
    log.error('Error parsing DOCX:', error);
    return { text: '', error: 'Failed to parse DOCX file' };
  }
}; 