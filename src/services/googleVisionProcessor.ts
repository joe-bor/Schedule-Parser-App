import { ImageAnnotatorClient } from '@google-cloud/vision';
import type { 
  GoogleVisionConfig, 
  GoogleVisionResult, 
  GoogleVisionError,
  GoogleVisionUsageStats,
  BoundingBox
} from '../types/googleVision.js';
import { DEFAULT_GOOGLE_VISION_CONFIG } from '../types/googleVision.js';

export class GoogleVisionProcessor {
  private client: ImageAnnotatorClient | null = null;
  private config: GoogleVisionConfig;
  private isInitialized = false;
  private usageStats: GoogleVisionUsageStats;

  constructor(config: Partial<GoogleVisionConfig> = {}) {
    this.config = { ...DEFAULT_GOOGLE_VISION_CONFIG, ...config };
    this.usageStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      quotaExceededCount: 0,
      averageProcessingTime: 0,
      lastUsed: new Date(),
      monthlyUsage: 0
    };
  }

  /**
   * Initialize Google Cloud Vision client
   */
  private async initializeClient(): Promise<void> {
    if (this.isInitialized && this.client) {
      return;
    }

    if (!this.config.enabled) {
      throw this.createVisionError(
        'VISION_API_DISABLED',
        'Google Vision API is disabled in configuration'
      );
    }

    try {
      console.log('🚀 Initializing Google Cloud Vision client...');

      // Initialize client with configuration
      const clientConfig: any = {};
      
      if (this.config.projectId) {
        clientConfig.projectId = this.config.projectId;
      }
      
      if (this.config.keyFilename) {
        clientConfig.keyFilename = this.config.keyFilename;
      }

      this.client = new ImageAnnotatorClient(clientConfig);
      this.isInitialized = true;

      console.log('✅ Google Cloud Vision client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Google Vision client:', error);
      throw this.createVisionError(
        'VISION_AUTH_FAILED',
        `Google Vision client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Extract text from image using Google Cloud Vision API
   */
  async extractText(imageBuffer: Buffer): Promise<GoogleVisionResult> {
    const startTime = Date.now();
    
    try {
      await this.initializeClient();
      
      if (!this.client) {
        throw this.createVisionError(
          'VISION_API_FAILED',
          'Google Vision client not initialized'
        );
      }

      console.log('👁️ Starting Google Vision OCR processing...');
      this.updateUsageStats('request_started');

      // Choose detection method based on configuration
      const detectionMethod = this.config.useDocumentTextDetection 
        ? 'documentTextDetection' 
        : 'textDetection';

      console.log(`🔍 Config useDocumentTextDetection: ${this.config.useDocumentTextDetection}`);
      console.log(`🔍 Using ${detectionMethod} for OCR processing...`);

      // Perform OCR with timeout
      const [result] = await Promise.race([
        this.client[detectionMethod]({
          image: { content: imageBuffer }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Google Vision API timeout')), this.config.timeoutMs)
        )
      ]) as any[];

      const processingTime = Date.now() - startTime;

      // Handle API errors
      if (result.error) {
        throw this.createVisionError(
          'VISION_API_FAILED',
          `Google Vision API error: ${result.error.message}`,
          result.error
        );
      }

      // Extract text and confidence
      const extractedText = this.extractTextFromResult(result);
      const confidence = this.calculateConfidence(result);
      
      const visionResult: GoogleVisionResult = {
        text: extractedText,
        confidence,
        processingTime,
        blocks: this.extractBlocks(result),
        pages: this.extractPages(result)
      };

      this.updateUsageStats('request_success', processingTime);
      
      console.log(`✅ Google Vision OCR completed in ${processingTime}ms with ${(confidence * 100).toFixed(1)}% confidence`);
      console.log(`📝 Extracted text preview: "${extractedText.substring(0, 100)}${extractedText.length > 100 ? '...' : ''}"`);

      return visionResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Google Vision OCR failed after ${processingTime}ms:`, error);
      
      this.updateUsageStats('request_failed', processingTime);
      
      // Handle quota exceeded errors specifically
      if (this.isQuotaExceededError(error)) {
        this.updateUsageStats('quota_exceeded');
        throw this.createVisionError(
          'VISION_QUOTA_EXCEEDED',
          'Google Vision API quota exceeded',
          error instanceof Error ? error : undefined,
          true
        );
      }

      throw this.createVisionError(
        'VISION_API_FAILED',
        `Google Vision OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Extract text content from Google Vision API result
   */
  private extractTextFromResult(result: any): string {
    if (this.config.useDocumentTextDetection) {
      // Use fullTextAnnotation for document text detection
      return result.fullTextAnnotation?.text || '';
    } else {
      // Use textAnnotations for general text detection
      const textAnnotations = result.textAnnotations || [];
      return textAnnotations.length > 0 ? textAnnotations[0].description || '' : '';
    }
  }

  /**
   * Calculate overall confidence from Google Vision result
   */
  private calculateConfidence(result: any): number {
    console.log('🔍 Google Vision API response structure:', {
      hasTextAnnotations: !!result.textAnnotations,
      textAnnotationsLength: result.textAnnotations?.length || 0,
      hasFullTextAnnotation: !!result.fullTextAnnotation,
      firstAnnotationHasConfidence: result.textAnnotations?.[0]?.confidence !== undefined
    });

    if (this.config.useDocumentTextDetection && result.fullTextAnnotation) {
      // For document text detection, calculate average confidence from pages
      const pages = result.fullTextAnnotation.pages || [];
      if (pages.length === 0) return 0;

      let totalConfidence = 0;
      let blockCount = 0;

      for (const page of pages) {
        const blocks = page.blocks || [];
        for (const block of blocks) {
          if (block.confidence !== undefined) {
            totalConfidence += block.confidence;
            blockCount++;
          }
        }
      }

      return blockCount > 0 ? totalConfidence / blockCount : 0;
    } else {
      // For general text detection, use first annotation confidence
      const textAnnotations = result.textAnnotations || [];
      
      if (textAnnotations.length > 0) {
        // Check if we have confidence in the first annotation
        if (textAnnotations[0].confidence !== undefined) {
          console.log('🔍 Using explicit confidence:', textAnnotations[0].confidence);
          return textAnnotations[0].confidence;
        } else {
          // Google Vision often doesn't provide explicit confidence for textDetection
          // If we have text results, assume reasonable confidence
          const hasText = textAnnotations[0].description && textAnnotations[0].description.trim().length > 0;
          if (hasText) {
            console.log('🔍 No explicit confidence, text detected, using 0.85');
            return 0.85; // Assume good confidence if text was detected
          } else {
            console.log('🔍 No text detected, using 0.0');
            return 0;
          }
        }
      }
      
      console.log('🔍 No text annotations found, using 0.0');
      return 0;
    }
  }

  /**
   * Extract block information for advanced analysis
   */
  private extractBlocks(result: any): any[] {
    if (!this.config.useDocumentTextDetection) {
      return [];
    }

    const blocks: any[] = [];
    const pages = result.fullTextAnnotation?.pages || [];

    for (const page of pages) {
      const pageBlocks = page.blocks || [];
      for (const block of pageBlocks) {
        blocks.push({
          text: this.extractBlockText(block),
          boundingBox: this.convertBoundingBox(block.boundingBox),
          confidence: block.confidence || 0.95
        });
      }
    }

    return blocks;
  }

  /**
   * Extract page information for document analysis
   */
  private extractPages(result: any): any[] {
    if (!this.config.useDocumentTextDetection) {
      return [];
    }

    const pages: any[] = [];
    const visionPages = result.fullTextAnnotation?.pages || [];

    for (const page of visionPages) {
      pages.push({
        text: this.extractPageText(page),
        confidence: this.calculatePageConfidence(page),
        blocks: this.extractBlocks({ fullTextAnnotation: { pages: [page] } }),
        width: page.width || 0,
        height: page.height || 0
      });
    }

    return pages;
  }

  /**
   * Extract text from a block
   */
  private extractBlockText(block: any): string {
    const paragraphs = block.paragraphs || [];
    return paragraphs
      .map((p: any) => {
        const words = p.words || [];
        return words
          .map((w: any) => {
            const symbols = w.symbols || [];
            return symbols.map((s: any) => s.text || '').join('');
          })
          .join(' ');
      })
      .join('\n');
  }

  /**
   * Extract text from a page
   */
  private extractPageText(page: any): string {
    const blocks = page.blocks || [];
    return blocks.map((block: any) => this.extractBlockText(block)).join('\n\n');
  }

  /**
   * Calculate confidence for a page
   */
  private calculatePageConfidence(page: any): number {
    const blocks = page.blocks || [];
    if (blocks.length === 0) return 0;

    const totalConfidence = blocks.reduce((sum: number, block: any) => {
      return sum + (block.confidence || 0.95);
    }, 0);

    return totalConfidence / blocks.length;
  }

  /**
   * Convert Google Vision bounding box to our format
   */
  private convertBoundingBox(boundingBox: any): BoundingBox {
    const vertices = boundingBox?.vertices || [];
    return {
      vertices: vertices.map((v: any) => ({
        x: v.x || 0,
        y: v.y || 0
      }))
    };
  }

  /**
   * Check if error is due to quota exceeded
   */
  private isQuotaExceededError(error: any): boolean {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    return message.includes('quota') || 
           message.includes('rate limit') || 
           message.includes('too many requests') ||
           error.code === 'RESOURCE_EXHAUSTED';
  }

  /**
   * Update usage statistics
   */
  private updateUsageStats(
    event: 'request_started' | 'request_success' | 'request_failed' | 'quota_exceeded',
    processingTime?: number
  ): void {
    const now = new Date();
    
    switch (event) {
      case 'request_started':
        this.usageStats.totalRequests++;
        break;
      case 'request_success':
        this.usageStats.successfulRequests++;
        if (processingTime) {
          this.usageStats.averageProcessingTime = 
            (this.usageStats.averageProcessingTime * (this.usageStats.successfulRequests - 1) + processingTime) / 
            this.usageStats.successfulRequests;
        }
        break;
      case 'request_failed':
        this.usageStats.failedRequests++;
        break;
      case 'quota_exceeded':
        this.usageStats.quotaExceededCount++;
        break;
    }
    
    this.usageStats.lastUsed = now;
    
    // Update monthly usage (reset if new month)
    const currentMonth = now.getMonth();
    const lastUsedMonth = new Date(this.usageStats.lastUsed).getMonth();
    
    if (currentMonth !== lastUsedMonth) {
      this.usageStats.monthlyUsage = 0;
    }
    
    if (event === 'request_success') {
      this.usageStats.monthlyUsage++;
    }
  }

  /**
   * Create Google Vision error object
   */
  private createVisionError(
    code: GoogleVisionError['code'],
    message: string,
    originalError?: Error,
    quotaExceeded = false
  ): GoogleVisionError {
    return {
      code,
      message,
      originalError,
      quotaExceeded
    };
  }

  /**
   * Check if Google Vision is available and configured
   */
  async isVisionReady(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      await this.initializeClient();
      return this.isInitialized && this.client !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): GoogleVisionUsageStats {
    return { ...this.usageStats };
  }

  /**
   * Get configuration information
   */
  getVisionInfo(): { ready: boolean; config: GoogleVisionConfig; stats: GoogleVisionUsageStats } {
    return {
      ready: this.isInitialized && this.client !== null,
      config: { ...this.config },
      stats: this.getUsageStats()
    };
  }

  /**
   * Reset usage statistics (useful for testing)
   */
  resetUsageStats(): void {
    this.usageStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      quotaExceededCount: 0,
      averageProcessingTime: 0,
      lastUsed: new Date(),
      monthlyUsage: 0
    };
  }

  /**
   * Check if monthly quota is approaching limit
   */
  isApproachingQuotaLimit(warningThreshold = 0.8): boolean {
    const freeMonthlyLimit = 1000;
    return this.usageStats.monthlyUsage >= (freeMonthlyLimit * warningThreshold);
  }
}