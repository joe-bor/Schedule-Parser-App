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
      
      // Perform OCR with fallback strategy
      console.log('👁️ Starting OCR text extraction...');
      let result = await this.performOCRWithFallback(processedBuffer, config);
      
      const processingTime = Date.now() - startTime;
      result.processingTime = processingTime;
      
      // Validate minimum confidence threshold
      if (result.confidence < config.minConfidence) {
        console.warn(`⚠️ OCR confidence ${result.confidence.toFixed(2)} below threshold ${config.minConfidence}`);
      }
      
      console.log(`✅ OCR completed in ${processingTime}ms with ${(result.confidence * 100).toFixed(1)}% confidence`);
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

  /**
   * Perform OCR with fallback PSM modes for better schedule recognition
   */
  private async performOCRWithFallback(processedBuffer: Buffer, config: OCRConfig): Promise<OCRResult> {
    // Try primary PSM mode (SPARSE_TEXT) first - best for schedules
    const primaryResult = await this.worker!.recognize(processedBuffer);
    const primaryConfidence = primaryResult.data.confidence / 100;
    
    console.log(`🎯 Primary OCR (PSM 11): ${(primaryConfidence * 100).toFixed(1)}% confidence`);
    
    // If confidence is good enough, return primary result
    if (primaryConfidence >= config.minConfidence) {
      return {
        text: primaryResult.data.text.trim(),
        confidence: primaryConfidence,
        processingTime: 0 // Will be set by caller
      };
    }
    
    // Try fallback PSM modes for low confidence results
    console.log('🔄 Trying fallback PSM modes for better results...');
    const fallbackModes = [
      { mode: '3', name: 'AUTO' },          // Automatic page segmentation
      { mode: '4', name: 'SINGLE_COLUMN' }, // Single column of text
      { mode: '6', name: 'SINGLE_BLOCK' }   // Single uniform block
    ];
    
    let bestResult = {
      text: primaryResult.data.text.trim(),
      confidence: primaryConfidence,
      processingTime: 0
    };
    
    for (const fallback of fallbackModes) {
      try {
        console.log(`  🧪 Trying PSM ${fallback.mode} (${fallback.name})...`);
        
        // Update PSM mode
        await this.worker!.setParameters({
          tessedit_pageseg_mode: fallback.mode as any
        });
        
        const fallbackResult = await this.worker!.recognize(processedBuffer);
        const fallbackConfidence = fallbackResult.data.confidence / 100;
        
        console.log(`     Result: ${(fallbackConfidence * 100).toFixed(1)}% confidence`);
        
        // Keep the best result
        if (fallbackConfidence > bestResult.confidence) {
          bestResult = {
            text: fallbackResult.data.text.trim(),
            confidence: fallbackConfidence,
            processingTime: 0
          };
          console.log(`     ✅ New best result with PSM ${fallback.mode}!`);
        }
        
        // If we found a good result, stop trying
        if (fallbackConfidence >= config.minConfidence) {
          break;
        }
      } catch (error) {
        console.warn(`     ⚠️ PSM ${fallback.mode} failed:`, error);
        continue;
      }
    }
    
    // Reset to primary PSM mode for future calls
    try {
      await this.worker!.setParameters({
        tessedit_pageseg_mode: '11' as any
      });
    } catch (error) {
      console.warn('⚠️ Failed to reset PSM mode:', error);
    }
    
    console.log(`🏆 Final result: ${(bestResult.confidence * 100).toFixed(1)}% confidence`);
    return bestResult;
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
        // Expanded whitelist for schedule content (times, names, departments)
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,:-/@#&()[]{}|+*\'\"',
        // PSM 11 (SPARSE_TEXT) - better for schedules with scattered text blocks
        tessedit_pageseg_mode: '11' as any, 
        preserve_interword_spaces: '1' as any,
        // Improve word and line detection for table-like structures
        tessedit_write_images: '0' as any,
        user_defined_dpi: '300' as any, // Higher DPI for better text recognition
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