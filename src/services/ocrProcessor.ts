import { createWorker } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import type { OCRResult, ProcessingError, OCRConfig } from "../types/ocr.js";
import { DEFAULT_OCR_CONFIG } from "../types/ocr.js";
import { ImagePreprocessor, type ImagePreprocessingOptions, DEFAULT_PREPROCESSING } from "../utils/imageProcessor.js";
import { AdvancedImageProcessor } from "../utils/advancedImageProcessor.js";
import type { OpenCVPreprocessingOptions } from "../types/opencv.js";
import { DEFAULT_OPENCV_PREPROCESSING } from "../types/opencv.js";
import { GoogleVisionProcessor } from "./googleVisionProcessor.js";
import type { GoogleVisionConfig } from "../types/googleVision.js";
import { validateEnv } from "../config/env.js";
import { ScheduleParser } from "./scheduleParser.js";
import { ScheduleValidator } from "../utils/scheduleValidator.js";
import type { ParsedSchedule, ScheduleParsingConfig } from "../types/schedule.js";
import { DEFAULT_SCHEDULE_PARSING_CONFIG } from "../types/schedule.js";

export class OCRProcessor {
  private worker: Worker | null = null;
  private imageProcessor: ImagePreprocessor;
  private advancedProcessor: AdvancedImageProcessor;
  private googleVisionProcessor: GoogleVisionProcessor | null = null;
  private scheduleParser: ScheduleParser;
  private scheduleValidator: ScheduleValidator;
  private isInitialized = false;

  constructor(scheduleConfig: ScheduleParsingConfig = DEFAULT_SCHEDULE_PARSING_CONFIG) {
    this.imageProcessor = new ImagePreprocessor();
    this.advancedProcessor = new AdvancedImageProcessor();
    this.scheduleParser = new ScheduleParser(scheduleConfig);
    this.scheduleValidator = new ScheduleValidator(scheduleConfig);
    this.initializeGoogleVision();
  }

  /**
   * Initialize Google Vision processor with environment configuration
   */
  private initializeGoogleVision(): void {
    try {
      const env = validateEnv();
      
      if (env.GOOGLE_VISION_ENABLED) {
        const googleVisionConfig: GoogleVisionConfig = {
          projectId: env.GOOGLE_CLOUD_PROJECT_ID,
          keyFilename: env.GOOGLE_APPLICATION_CREDENTIALS,
          enabled: env.GOOGLE_VISION_ENABLED,
          maxRetries: 2,
          timeoutMs: 15000,
          useDocumentTextDetection: env.GOOGLE_VISION_USE_DOCUMENT_DETECTION
        };

        console.log('🔧 Google Vision config:', { 
          enabled: googleVisionConfig.enabled,
          useDocumentTextDetection: googleVisionConfig.useDocumentTextDetection,
          envValue: env.GOOGLE_VISION_USE_DOCUMENT_DETECTION
        });

        this.googleVisionProcessor = new GoogleVisionProcessor(googleVisionConfig);
        console.log('🔧 Google Vision processor initialized with document detection');
      } else {
        console.log('ℹ️ Google Vision disabled in configuration');
      }
    } catch (error) {
      console.warn('⚠️ Failed to initialize Google Vision processor:', error);
      this.googleVisionProcessor = null;
    }
  }

  async extractText(
    imageBuffer: Buffer,
    config: OCRConfig = DEFAULT_OCR_CONFIG,
    preprocessingOptions: ImagePreprocessingOptions = DEFAULT_PREPROCESSING,
    openCVOptions: OpenCVPreprocessingOptions = DEFAULT_OPENCV_PREPROCESSING
  ): Promise<OCRResult> {
    const startTime = Date.now();
    
    try {
      // Initialize worker if not already done
      await this.initializeWorker(config);
      
      // Choose preprocessing method based on config and environment
      let processedBuffer: Buffer;
      let preprocessingMethod = 'sharp';
      const env = validateEnv();
      
      if (config.useAdvancedPreprocessing && env.OPENCV_ENABLED) {
        try {
          console.log('🔧 Using advanced OpenCV preprocessing...');
          const isOpenCVReady = await this.advancedProcessor.isOpenCVReady();
          
          if (isOpenCVReady) {
            processedBuffer = await this.advancedProcessor.preprocessImage(imageBuffer, openCVOptions);
            preprocessingMethod = 'opencv';
            console.log('✅ OpenCV preprocessing completed successfully');
          } else {
            console.warn('⚠️ OpenCV not ready, falling back to Sharp.js');
            processedBuffer = await this.imageProcessor.preprocessImage(imageBuffer, preprocessingOptions);
          }
        } catch (error) {
          console.warn('⚠️ OpenCV preprocessing failed, falling back to Sharp.js:', error);
          processedBuffer = await this.imageProcessor.preprocessImage(imageBuffer, preprocessingOptions);
        }
      } else {
        console.log('🔧 Using standard Sharp.js preprocessing...');
        processedBuffer = await this.imageProcessor.preprocessImage(imageBuffer, preprocessingOptions);
      }
      
      // Perform OCR with fallback strategy
      console.log('👁️ Starting OCR text extraction...');
      let result = await this.performOCRWithFallback(processedBuffer, config);
      
      // Store Tesseract result for comparison
      const tesseractResult = {
        confidence: result.confidence,
        processingTime: result.processingTime
      };
      
      // Check if Google Vision fallback should be triggered
      let fallbackUsed = false;
      let googleVisionResult: { confidence: number; processingTime: number } | undefined;
      
      if (config.useGoogleVisionFallback && 
          result.confidence < config.minConfidence && 
          this.googleVisionProcessor) {
        
        console.log(`🔄 Tesseract confidence ${(result.confidence * 100).toFixed(1)}% below threshold, trying Google Vision fallback...`);
        
        try {
          const visionStartTime = Date.now();
          const visionOCRResult = await this.googleVisionProcessor.extractText(imageBuffer);
          const visionProcessingTime = Date.now() - visionStartTime;
          
          googleVisionResult = {
            confidence: visionOCRResult.confidence,
            processingTime: visionProcessingTime
          };
          
          console.log(`🔍 Google Vision result: ${(visionOCRResult.confidence * 100).toFixed(1)}% confidence in ${visionProcessingTime}ms`);
          
          // Use Google Vision result if it has higher confidence
          if (visionOCRResult.confidence > result.confidence) {
            console.log(`🎯 Google Vision has better confidence, switching to Vision result`);
            result = {
              text: visionOCRResult.text,
              confidence: visionOCRResult.confidence,
              processingTime: visionOCRResult.processingTime,
              preprocessingMethod,
              engine: 'google-vision',
              fallbackUsed: true,
              tesseractResult,
              googleVisionResult
            };
            fallbackUsed = true;
          } else {
            console.log(`📊 Tesseract result still better, keeping original result`);
            result.engine = 'tesseract';
            result.fallbackUsed = false;
            result.tesseractResult = tesseractResult;
            result.googleVisionResult = googleVisionResult;
          }
          
        } catch (error) {
          console.warn('⚠️ Google Vision fallback failed:', error);
          // Continue with Tesseract result
          result.engine = 'tesseract';
          result.fallbackUsed = false;
          result.tesseractResult = tesseractResult;
        }
      } else {
        // No fallback needed or available
        result.engine = 'tesseract';
        result.fallbackUsed = false;
        result.tesseractResult = tesseractResult;
        
        if (!config.useGoogleVisionFallback) {
          console.log('ℹ️ Google Vision fallback disabled in configuration');
        } else if (!this.googleVisionProcessor) {
          console.log('ℹ️ Google Vision processor not available');
        } else {
          console.log(`✅ Tesseract confidence ${(result.confidence * 100).toFixed(1)}% meets threshold, no fallback needed`);
        }
      }
      
      const totalProcessingTime = Date.now() - startTime;
      result.processingTime = totalProcessingTime;
      result.preprocessingMethod = preprocessingMethod;
      
      // Final validation
      if (result.confidence < config.minConfidence) {
        console.warn(`⚠️ Final OCR confidence ${(result.confidence * 100).toFixed(1)}% still below threshold ${(config.minConfidence * 100).toFixed(1)}%`);
      }
      
      console.log(`✅ OCR completed in ${totalProcessingTime}ms with ${(result.confidence * 100).toFixed(1)}% confidence`);
      console.log(`🔧 Engine: ${result.engine}${fallbackUsed ? ' (fallback)' : ''}`);
      console.log(`🔧 Preprocessing: ${preprocessingMethod}`);
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
    const primaryResult = await this.performOCRWithTimeout(
      () => this.worker!.recognize(processedBuffer), 
      15000 // 15 second timeout
    );
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
        
        const fallbackResult = await this.performOCRWithTimeout(
          () => this.worker!.recognize(processedBuffer),
          10000 // 10 second timeout for fallback modes
        );
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

  /**
   * Perform OCR operation with timeout to prevent hanging
   */
  private async performOCRWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`OCR operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
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

  /**
   * Extract text and parse as structured schedule data (Phase 3A)
   */
  async extractSchedule(
    imageBuffer: Buffer,
    config: OCRConfig = DEFAULT_OCR_CONFIG,
    preprocessingOptions: ImagePreprocessingOptions = DEFAULT_PREPROCESSING,
    openCVOptions: OpenCVPreprocessingOptions = DEFAULT_OPENCV_PREPROCESSING,
    scheduleConfig?: ScheduleParsingConfig
  ): Promise<{ ocr: OCRResult; schedule: ParsedSchedule; validation: any }> {
    console.log('📅 Starting schedule extraction with parsing...');
    
    // First, perform standard OCR extraction
    const ocrResult = await this.extractText(imageBuffer, config, preprocessingOptions, openCVOptions);
    console.log(`📄 OCR completed with ${(ocrResult.confidence * 100).toFixed(1)}% confidence`);
    
    // Update schedule parser config if provided
    if (scheduleConfig) {
      this.scheduleParser.updateConfig(scheduleConfig);
      this.scheduleValidator = new ScheduleValidator({ ...DEFAULT_SCHEDULE_PARSING_CONFIG, ...scheduleConfig });
    }
    
    // Parse the OCR text into structured schedule data
    const schedule = await this.scheduleParser.parseSchedule(ocrResult.text, {
      confidence: ocrResult.confidence,
      processingTime: ocrResult.processingTime,
      engine: ocrResult.engine || 'tesseract'
    });
    
    console.log(`📊 Schedule parsed: ${schedule.totalEmployees} employees across ${Object.keys(schedule.departments).length} departments`);
    
    // Validate the parsed schedule
    const validation = this.scheduleValidator.validateSchedule(schedule);
    console.log(`🔍 Validation: ${validation.isValid ? 'PASSED' : 'FAILED'} (${validation.errors.length} errors, ${validation.warnings.length} warnings)`);
    
    // Attempt to fix common issues if validation failed
    let finalSchedule = schedule;
    if (!validation.isValid && validation.errors.length > 0) {
      console.log('🔧 Attempting to fix parsing issues...');
      const fixResult = this.scheduleValidator.fixCommonIssues(schedule);
      if (fixResult.changes.length > 0) {
        finalSchedule = fixResult.fixed;
        console.log(`🔧 Applied ${fixResult.changes.length} fixes to schedule data`);
        
        // Re-validate after fixes
        const revalidation = this.scheduleValidator.validateSchedule(finalSchedule);
        console.log(`🔍 Re-validation: ${revalidation.isValid ? 'PASSED' : 'FAILED'} after fixes`);
      }
    }
    
    return {
      ocr: ocrResult,
      schedule: finalSchedule,
      validation
    };
  }

  /**
   * Update schedule parsing configuration
   */
  updateScheduleConfig(config: Partial<ScheduleParsingConfig>): void {
    this.scheduleParser.updateConfig(config);
    this.scheduleValidator = new ScheduleValidator({ ...DEFAULT_SCHEDULE_PARSING_CONFIG, ...config });
    console.log('🔧 Updated schedule parsing configuration');
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