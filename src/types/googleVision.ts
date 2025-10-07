export interface GoogleVisionConfig {
  projectId?: string | undefined;
  keyFilename?: string | undefined;
  enabled: boolean;
  maxRetries: number;
  timeoutMs: number;
  useDocumentTextDetection: boolean;
}

export const DEFAULT_GOOGLE_VISION_CONFIG: GoogleVisionConfig = {
  enabled: true,
  maxRetries: 2,
  timeoutMs: 15000,
  useDocumentTextDetection: true // Use DOCUMENT_TEXT_DETECTION for better confidence scoring
};

export interface GoogleVisionResult {
  text: string;
  confidence: number;
  processingTime: number;
  blocks?: GoogleVisionBlock[];
  pages?: GoogleVisionPage[];
  words?: GoogleVisionWord[];
  tableStructure?: TableStructure;
}

export interface GoogleVisionWord {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
}

export interface GoogleVisionParagraph {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
  words: GoogleVisionWord[];
}

export interface GoogleVisionBlock {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
  paragraphs?: GoogleVisionParagraph[];
}

export interface GoogleVisionPage {
  text: string;
  confidence: number;
  blocks: GoogleVisionBlock[];
  width: number;
  height: number;
}

export interface BoundingBox {
  vertices: Array<{
    x: number;
    y: number;
  }>;
}

export interface TableCell {
  text: string;
  boundingBox: BoundingBox;
  rowIndex: number;
  columnIndex: number;
  confidence: number;
}

export interface TableRow {
  cells: TableCell[];
  rowIndex: number;
  yPosition: number;
  boundingBox: BoundingBox;
}

export interface TableStructure {
  rows: TableRow[];
  columnCount: number;
  rowCount: number;
  dateHeaderRow?: TableRow;
  employeeNameColumn?: number;
  confidence: number;
}

export interface GoogleVisionError {
  code: 'VISION_API_DISABLED' | 'VISION_API_FAILED' | 'VISION_QUOTA_EXCEEDED' | 'VISION_INVALID_IMAGE' | 'VISION_AUTH_FAILED';
  message: string;
  originalError?: Error | undefined;
  quotaExceeded?: boolean;
  retryAfter?: number;
}

export interface GoogleVisionUsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  quotaExceededCount: number;
  averageProcessingTime: number;
  lastUsed: Date;
  monthlyUsage: number;
}

export type OCREngine = 'tesseract' | 'google-vision' | 'hybrid';

export interface EnhancedOCRResult {
  text: string;
  confidence: number;
  processingTime: number;
  preprocessingMethod?: string;
  qualityScore?: number;
  engine: OCREngine;
  fallbackUsed?: boolean;
  tesseractResult?: {
    confidence: number;
    processingTime: number;
  };
  googleVisionResult?: {
    confidence: number;
    processingTime: number;
  };
}

export interface OCREngineComparison {
  tesseract: {
    confidence: number;
    processingTime: number;
    success: boolean;
  };
  googleVision?: {
    confidence: number;
    processingTime: number;
    success: boolean;
  };
  selectedEngine: OCREngine;
  fallbackTriggered: boolean;
  costIncurred: boolean;
}