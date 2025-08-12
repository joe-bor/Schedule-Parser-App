import { createWorker } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import type { OCRResult, ProcessingError, OCRConfig } from "../types/ocr.js";
import { DEFAULT_OCR_CONFIG } from "../types/ocr.js";
import { ImagePreprocessor, type ImagePreprocessingOptions, DEFAULT_PREPROCESSING } from "../utils/imageProcessor.js";

export class OCRProcessor {
  private worker: Worker | null = null;
  private imageProcessor: ImagePreprocessor;
  private isInitialized = false;

  constructor() {
    this.imageProcessor = new ImagePreprocessor();
  }

  async extractText(
    imageBuffer: Buffer,
    config: OCRConfig = DEFAULT_OCR_CONFIG,
    preprocessingOptions: ImagePreprocessingOptions = DEFAULT_PREPROCESSING
  ): Promise<OCRResult> {
    const startTime = Date.now();
    
    try {
      // Initialize worker if not already done
      await this.initializeWorker(config);
      
      // Preprocess image for better OCR results
      console.log('🔧 Preprocessing image for OCR...');
      const processedBuffer = await this.imageProcessor.preprocessImage(imageBuffer, preprocessingOptions);
      
      // Perform OCR
      console.log('👁️ Starting OCR text extraction...');
      const { data } = await this.worker!.recognize(processedBuffer);
      
      const processingTime = Date.now() - startTime;
      const confidence = data.confidence / 100; // Convert from 0-100 to 0-1
      
      // Validate minimum confidence threshold
      if (confidence < config.minConfidence) {
        console.warn(`⚠️ OCR confidence ${confidence.toFixed(2)} below threshold ${config.minConfidence}`);
      }
      
      const result: OCRResult = {
        text: data.text.trim(),
        confidence,
        processingTime
      };
      
      console.log(`✅ OCR completed in ${processingTime}ms with ${(confidence * 100).toFixed(1)}% confidence`);
      console.log(`📝 Extracted text preview: "${result.text.substring(0, 100)}${result.text.length > 100 ? '...' : ''}"`);
      
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ OCR failed after ${processingTime}ms:`, error);
      
      throw this.createProcessingError(
        'OCR_FAILED',
        `OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async initializeWorker(config: OCRConfig): Promise<void> {
    if (this.isInitialized && this.worker) {
      return;
    }

    try {
      console.log('🚀 Initializing Tesseract OCR worker...');
      
      this.worker = await createWorker(config.lang);
      
      // Worker is already initialized with the language
      
      // Optimize for schedule/document text recognition
      await this.worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,:-/()[]{}',
        tessedit_pageseg_mode: '6' as any, // Single uniform block of text (better for schedules)
        preserve_interword_spaces: '1' as any,
      });
      
      this.isInitialized = true;
      console.log(`✅ Tesseract worker initialized for language: ${config.lang}`);
    } catch (error) {
      console.error('❌ Failed to initialize Tesseract worker:', error);
      throw this.createProcessingError(
        'OCR_FAILED',
        `Failed to initialize OCR worker: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
        this.worker = null;
        this.isInitialized = false;
        console.log('✅ Tesseract worker terminated');
      } catch (error) {
        console.error('❌ Error terminating Tesseract worker:', error);
      }
    }
  }

  async isWorkerReady(): Promise<boolean> {
    return this.isInitialized && this.worker !== null;
  }

  async getWorkerInfo(): Promise<{ initialized: boolean; language?: string | undefined }> {
    return {
      initialized: this.isInitialized,
      language: this.isInitialized ? 'eng' : undefined
    };
  }

  private createProcessingError(
    code: ProcessingError['code'], 
    message: string, 
    originalError?: Error
  ): ProcessingError {
    return {
      code,
      message,
      originalError
    };
  }

  // Cleanup method for graceful shutdown
  static async cleanup(processor: OCRProcessor): Promise<void> {
    await processor.terminate();
  }
}