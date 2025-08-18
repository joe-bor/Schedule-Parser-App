export interface OCRResult {
  text: string;
  confidence: number;
  processingTime: number;
}

export interface TelegramFileInfo {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface ProcessingError {
  code: 'DOWNLOAD_FAILED' | 'INVALID_FILE' | 'OCR_FAILED' | 'FILE_TOO_LARGE' | 'NETWORK_ERROR';
  message: string;
  originalError?: Error | undefined;
}

export interface FileDownloadResult {
  buffer: Buffer;
  fileInfo: TelegramFileInfo;
  mimeType?: string;
}

export interface FileValidationOptions {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  minWidth?: number;
  minHeight?: number;
}

export const DEFAULT_FILE_VALIDATION: FileValidationOptions = {
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  minWidth: 100,
  minHeight: 100
};

export const DEFAULT_OCR_CONFIG = {
  lang: 'eng',
  minConfidence: 0.8, // High threshold for usable text quality
  timeoutMs: 30000
} as const;

export type OCRConfig = typeof DEFAULT_OCR_CONFIG;