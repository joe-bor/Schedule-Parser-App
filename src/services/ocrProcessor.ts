import type { OCRResult, ProcessingError } from "../types/ocr.js";
import { GoogleVisionProcessor } from "./googleVisionProcessor.js";
import type { GoogleVisionConfig } from "../types/googleVision.js";
import { validateEnv } from "../config/env.js";
import { ScheduleParser } from "./scheduleParser.js";
import { ScheduleValidator } from "../utils/scheduleValidator.js";
import type { ParsedSchedule, ScheduleParsingConfig } from "../types/schedule.js";
import { DEFAULT_SCHEDULE_PARSING_CONFIG } from "../types/schedule.js";

export class OCRProcessor {
  private googleVisionProcessor: GoogleVisionProcessor;
  private scheduleParser: ScheduleParser;
  private scheduleValidator: ScheduleValidator;

  constructor(scheduleConfig: ScheduleParsingConfig = DEFAULT_SCHEDULE_PARSING_CONFIG) {
    this.scheduleParser = new ScheduleParser(scheduleConfig);
    this.scheduleValidator = new ScheduleValidator(scheduleConfig);
    this.googleVisionProcessor = this.initializeGoogleVision();
  }

  /**
   * Initialize Google Vision processor with environment configuration
   */
  private initializeGoogleVision(): GoogleVisionProcessor {
    const env = validateEnv();

    const googleVisionConfig: GoogleVisionConfig = {
      projectId: env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: env.GOOGLE_APPLICATION_CREDENTIALS,
      enabled: true,
      maxRetries: 2,
      timeoutMs: 15000,
      useDocumentTextDetection: env.GOOGLE_VISION_USE_DOCUMENT_DETECTION
    };

    console.log('🔧 Google Vision config:', {
      enabled: googleVisionConfig.enabled,
      useDocumentTextDetection: googleVisionConfig.useDocumentTextDetection,
      envValue: env.GOOGLE_VISION_USE_DOCUMENT_DETECTION
    });

    const processor = new GoogleVisionProcessor(googleVisionConfig);
    console.log('🔧 Google Vision processor initialized with document detection');

    return processor;
  }

  /**
   * Extract text from image using Google Vision OCR
   */
  async extractText(imageBuffer: Buffer): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      console.log('👁️ Starting Google Vision OCR extraction...');

      // Extract text using Google Vision
      const visionResult = await this.googleVisionProcessor.extractText(imageBuffer);

      const totalProcessingTime = Date.now() - startTime;

      const result: OCRResult = {
        text: visionResult.text,
        confidence: visionResult.confidence,
        processingTime: totalProcessingTime,
        engine: 'google-vision',
        tableStructure: visionResult.tableStructure
      };

      console.log(`✅ OCR completed in ${totalProcessingTime}ms with ${(result.confidence * 100).toFixed(1)}% confidence`);
      console.log(`🔧 Engine: google-vision`);
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
   * Extract text and parse as structured schedule data
   */
  async extractSchedule(
    imageBuffer: Buffer,
    scheduleConfig?: ScheduleParsingConfig
  ): Promise<{ ocr: OCRResult; schedule: ParsedSchedule; validation: any }> {
    console.log('📅 Starting schedule extraction with parsing...');

    // First, perform OCR extraction
    const ocrResult = await this.extractText(imageBuffer);
    console.log(`📄 OCR completed with ${(ocrResult.confidence * 100).toFixed(1)}% confidence`);

    // Update schedule parser config if provided
    if (scheduleConfig) {
      this.scheduleParser.updateConfig(scheduleConfig);
      this.scheduleValidator = new ScheduleValidator({ ...DEFAULT_SCHEDULE_PARSING_CONFIG, ...scheduleConfig });
    }

    // Parse the OCR text into structured schedule data
    const schedule = await this.scheduleParser.parseSchedule(
      ocrResult.text,
      {
        confidence: ocrResult.confidence,
        processingTime: ocrResult.processingTime,
        engine: 'google-vision'
      },
      ocrResult.tableStructure // Pass table structure from Google Vision
    );

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
}
