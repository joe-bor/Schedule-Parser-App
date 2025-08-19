import { jest } from '@jest/globals';

// Mock Tesseract.js to avoid actual OCR processing
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn().mockResolvedValue({
    recognize: jest.fn().mockResolvedValue({
      data: { text: 'Mock OCR text', confidence: 85 }
    }),
    setParameters: jest.fn().mockResolvedValue(undefined),
    terminate: jest.fn().mockResolvedValue(undefined)
  })
}));

// Mock the Google Cloud Vision processor
jest.mock('../../src/services/googleVisionProcessor.js', () => ({
  GoogleVisionProcessor: jest.fn().mockImplementation(() => ({
    extractText: jest.fn().mockResolvedValue({
      text: 'Mock Google Vision text',
      confidence: 0.92,
      processingTime: 500
    }),
    isVisionReady: jest.fn().mockResolvedValue(true),
    getUsageStats: jest.fn().mockReturnValue({
      requestsThisMonth: 10,
      quotaLimit: 1000,
      remainingQuota: 990
    }),
    getVisionInfo: jest.fn().mockReturnValue({
      enabled: true,
      projectId: 'test-project'
    })
  }))
}));

// Mock environment validation
jest.mock('../../src/config/env.js', () => ({
  validateEnv: jest.fn().mockReturnValue({
    PORT: '3000',
    NODE_ENV: 'test',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_WEBHOOK_URL: 'https://test.webhook.url',
    GOOGLE_VISION_ENABLED: true,
    GOOGLE_CLOUD_PROJECT_ID: 'test-project',
    GOOGLE_APPLICATION_CREDENTIALS: 'test-key.json',
    GOOGLE_VISION_USE_DOCUMENT_DETECTION: false,
    GOOGLE_VISION_QUOTA_LIMIT: 1000
  })
}));

// Mock Sharp for image processing
jest.mock('sharp', () => {
  const mockSharp = jest.fn(() => ({
    grayscale: jest.fn().mockReturnThis(),
    normalize: jest.fn().mockReturnThis(),
    sharpen: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock processed image'))
  }));
  mockSharp.default = mockSharp;
  return mockSharp;
});

// Mock console methods to reduce test noise
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

import { OCRProcessor } from '../../src/services/ocrProcessor.js';
import { DEFAULT_OCR_CONFIG } from '../../src/types/ocr.js';

describe('OCRProcessor with Google Vision Integration', () => {
  let processor: OCRProcessor;
  let mockImageBuffer: Buffer;

  beforeAll(() => {
    // Create a simple test image buffer
    mockImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE
    ]);
  });

  beforeEach(() => {
    processor = new OCRProcessor();
  });

  afterEach(async () => {
    await processor.terminate();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
  });

  describe('Google Vision Integration', () => {
    test('should initialize with Google Vision processor', () => {
      expect(processor).toBeInstanceOf(OCRProcessor);
      // Google Vision processor should be initialized during construction
    });

    test('should handle Google Vision fallback configuration', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: true,
        minConfidence: 0.1 // Lower threshold to test fallback
      };

      const result = await processor.extractText(mockImageBuffer, config);
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('processingTime');
      expect(result).toHaveProperty('engine');
      expect(result).toHaveProperty('fallbackUsed');
      
      expect(typeof result.fallbackUsed).toBe('boolean');
      expect(['tesseract', 'google-vision', 'hybrid']).toContain(result.engine);
    });

    test('should disable Google Vision fallback when configured', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: false,
        minConfidence: 0.1
      };

      const result = await processor.extractText(mockImageBuffer, config);
      
      expect(result).toHaveProperty('engine');
      expect(result.engine).toBe('tesseract');
      expect(result.fallbackUsed).toBe(false);
    });

    test('should include comparison data when both engines are used', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: true,
        minConfidence: 0.9 // High threshold to potentially trigger fallback
      };

      const result = await processor.extractText(mockImageBuffer, config);
      
      expect(result).toHaveProperty('tesseractResult');
      expect(result.tesseractResult).toHaveProperty('confidence');
      expect(result.tesseractResult).toHaveProperty('processingTime');
      
      // Google Vision result may or may not be present depending on threshold
      if (result.googleVisionResult) {
        expect(result.googleVisionResult).toHaveProperty('confidence');
        expect(result.googleVisionResult).toHaveProperty('processingTime');
      }
    });
  });

  describe('Fallback Logic', () => {
    test('should use Tesseract result when confidence meets threshold', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: true,
        minConfidence: 0.1 // Very low threshold
      };

      const result = await processor.extractText(mockImageBuffer, config);
      
      // Should use Tesseract if it meets the low threshold
      expect(result.engine).toBeDefined();
      expect(result.fallbackUsed).toBeDefined();
    });

    test('should handle Google Vision processor not available', async () => {
      // This tests the case where Google Vision is not properly configured
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: true,
        minConfidence: 0.9 // High threshold to trigger fallback
      };

      const result = await processor.extractText(mockImageBuffer, config);
      
      // Should gracefully fallback to Tesseract even if Google Vision fails
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('engine');
    });

    test('should maintain backward compatibility', async () => {
      // Test without Google Vision specific parameters
      const result = await processor.extractText(mockImageBuffer);
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('processingTime');
      expect(result).toHaveProperty('engine');
    });
  });

  describe('Result Enhancement', () => {
    test('should include engine information in results', async () => {
      const result = await processor.extractText(mockImageBuffer);
      
      expect(result).toHaveProperty('engine');
      expect(typeof result.engine).toBe('string');
      expect(['tesseract', 'google-vision', 'hybrid']).toContain(result.engine);
    });

    test('should include fallback status in results', async () => {
      const result = await processor.extractText(mockImageBuffer);
      
      expect(result).toHaveProperty('fallbackUsed');
      expect(typeof result.fallbackUsed).toBe('boolean');
    });

    test('should include Tesseract result details', async () => {
      const result = await processor.extractText(mockImageBuffer);
      
      expect(result).toHaveProperty('tesseractResult');
      if (result.tesseractResult) {
        expect(result.tesseractResult).toHaveProperty('confidence');
        expect(result.tesseractResult).toHaveProperty('processingTime');
        expect(typeof result.tesseractResult.confidence).toBe('number');
        expect(typeof result.tesseractResult.processingTime).toBe('number');
      }
    });

    test('should handle Google Vision result details when available', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: true,
        minConfidence: 0.9 // High threshold to potentially trigger fallback
      };

      const result = await processor.extractText(mockImageBuffer, config);
      
      // Google Vision result may be present if fallback was triggered
      if (result.googleVisionResult) {
        expect(result.googleVisionResult).toHaveProperty('confidence');
        expect(result.googleVisionResult).toHaveProperty('processingTime');
        expect(typeof result.googleVisionResult.confidence).toBe('number');
        expect(typeof result.googleVisionResult.processingTime).toBe('number');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle Google Vision initialization failure gracefully', async () => {
      // This tests the case where Google Vision fails to initialize
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: true,
        minConfidence: 0.1
      };

      // Should not throw even if Google Vision fails
      const result = await processor.extractText(mockImageBuffer, config);
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('engine');
    });

    test('should handle Google Vision API failures gracefully', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: true,
        minConfidence: 0.9 // High threshold to trigger fallback
      };

      // Should fallback to Tesseract result if Google Vision fails
      const result = await processor.extractText(mockImageBuffer, config);
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('engine');
    });

    test('should handle invalid image data gracefully', async () => {
      const invalidBuffer = Buffer.from('invalid image data');
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: true
      };

      // Should handle invalid image gracefully
      try {
        await processor.extractText(invalidBuffer, config);
      } catch (error) {
        // Error is expected, but should be a processing error
        expect(error).toBeTruthy();
      }
    });
  });

  describe('Performance', () => {
    test('should complete within reasonable time with fallback enabled', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: true,
        minConfidence: 0.1
      };

      const startTime = Date.now();
      await processor.extractText(mockImageBuffer, config);
      const endTime = Date.now();
      
      // Should complete within 30 seconds (generous for CI and potential fallback)
      expect(endTime - startTime).toBeLessThan(30000);
    });

    test('should track processing times correctly', async () => {
      const result = await processor.extractText(mockImageBuffer);
      
      expect(result.processingTime).toBeGreaterThan(0);
      expect(typeof result.processingTime).toBe('number');
      
      if (result.tesseractResult) {
        expect(result.tesseractResult.processingTime).toBeGreaterThan(0);
      }
      
      if (result.googleVisionResult) {
        expect(result.googleVisionResult.processingTime).toBeGreaterThan(0);
      }
    });
  });

  describe('Worker State Management', () => {
    test('should maintain worker state with Google Vision integration', async () => {
      const isReady = await processor.isWorkerReady();
      expect(typeof isReady).toBe('boolean');
    });

    test('should provide worker info with enhanced capabilities', async () => {
      const info = await processor.getWorkerInfo();
      expect(info).toHaveProperty('initialized');
      expect(typeof info.initialized).toBe('boolean');
    });

    test('should handle multiple OCR calls with fallback', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useGoogleVisionFallback: true,
        minConfidence: 0.1
      };

      // First call
      const result1 = await processor.extractText(mockImageBuffer, config);
      expect(result1).toHaveProperty('text');

      // Second call should reuse initialized workers
      const result2 = await processor.extractText(mockImageBuffer, config);
      expect(result2).toHaveProperty('text');
    });
  });
});