import { validateEnv } from "../config/env.js";
import type { 
  TelegramFileInfo, 
  FileDownloadResult, 
  ProcessingError, 
  FileValidationOptions
} from "../types/ocr.js";
import { DEFAULT_FILE_VALIDATION } from "../types/ocr.js";

export class TelegramFileManager {
  private readonly botToken: string;
  private readonly baseUrl: string;

  constructor() {
    const env = validateEnv();
    if (!env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is required for file operations");
    }
    this.botToken = env.TELEGRAM_BOT_TOKEN;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async downloadPhoto(fileId: string, options: FileValidationOptions = DEFAULT_FILE_VALIDATION): Promise<FileDownloadResult> {
    try {
      // Step 1: Get file information from Telegram API
      const fileInfo = await this.getFileInfo(fileId);
      
      // Step 2: Validate file before download
      await this.validateFile(fileInfo, options);
      
      // Step 3: Download the actual file
      const buffer = await this.downloadFileBuffer(fileInfo.file_path!);
      
      // Step 4: Additional validation on downloaded content
      const mimeType = await this.detectMimeType(buffer);
      if (!options.allowedMimeTypes.includes(mimeType)) {
        throw this.createProcessingError(
          'INVALID_FILE', 
          `Unsupported file type: ${mimeType}. Allowed: ${options.allowedMimeTypes.join(', ')}`
        );
      }

      console.log(`✅ Successfully downloaded file ${fileId} (${fileInfo.file_size} bytes)`);
      
      return {
        buffer,
        fileInfo,
        mimeType
      };
    } catch (error) {
      console.error(`❌ Failed to download file ${fileId}:`, error);
      
      if (error instanceof Error && 'code' in error) {
        throw error as ProcessingError;
      }
      
      throw this.createProcessingError(
        'DOWNLOAD_FAILED', 
        `Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getFileInfo(fileId: string): Promise<TelegramFileInfo> {
    try {
      const response = await fetch(`${this.baseUrl}/getFile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId })
      });

      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(`Telegram API returned error: ${data.description}`);
      }

      const fileInfo: TelegramFileInfo = {
        file_id: data.result.file_id,
        file_unique_id: data.result.file_unique_id,
        file_size: data.result.file_size,
        file_path: data.result.file_path
      };

      return fileInfo;
    } catch (error) {
      throw this.createProcessingError(
        'NETWORK_ERROR',
        `Failed to get file info from Telegram API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async validateFile(fileInfo: TelegramFileInfo, options: FileValidationOptions): Promise<void> {
    // Check file size
    if (fileInfo.file_size && fileInfo.file_size > options.maxSizeBytes) {
      throw this.createProcessingError(
        'FILE_TOO_LARGE',
        `File size ${fileInfo.file_size} bytes exceeds maximum ${options.maxSizeBytes} bytes`
      );
    }

    // Check if file_path exists (required for download)
    if (!fileInfo.file_path) {
      throw this.createProcessingError(
        'INVALID_FILE',
        'File path not available from Telegram API'
      );
    }
  }

  private async downloadFileBuffer(filePath: string): Promise<Buffer> {
    const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
    
    try {
      const response = await fetch(fileUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw this.createProcessingError(
        'DOWNLOAD_FAILED',
        `Failed to download file from ${fileUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async detectMimeType(buffer: Buffer): Promise<string> {
    // Simple magic number detection for common image types
    const header = buffer.subarray(0, 12);
    
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
      return 'image/jpeg';
    }
    
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
      return 'image/png';
    }
    
    if (header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WEBP') {
      return 'image/webp';
    }
    
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
      return 'image/gif';
    }
    
    // Default to JPEG if we can't detect (common for Telegram photos)
    return 'image/jpeg';
  }

  private createProcessingError(code: ProcessingError['code'], message: string, originalError?: Error): ProcessingError {
    return {
      code,
      message,
      originalError
    };
  }
}