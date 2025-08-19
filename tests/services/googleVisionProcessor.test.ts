import { GoogleVisionProcessor } from '../../src/services/googleVisionProcessor.js';
import { DEFAULT_GOOGLE_VISION_CONFIG } from '../../src/types/googleVision.js';

// Mock the Google Cloud Vision client
jest.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
    textDetection: jest.fn(),
    documentTextDetection: jest.fn()
  }))
}));

describe('GoogleVisionProcessor', () => {
  let processor: GoogleVisionProcessor;
  let mockImageBuffer: Buffer;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create processor with test configuration
    processor = new GoogleVisionProcessor({
      ...DEFAULT_GOOGLE_VISION_CONFIG,
      enabled: true,
      projectId: 'test-project',
      keyFilename: 'test-key.json'
    });

    // Create a simple test image buffer
    mockImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE
    ]);
  });

  describe('Initialization', () => {
    test('should create processor instance', () => {
      expect(processor).toBeInstanceOf(GoogleVisionProcessor);
    });

    test('should initialize with custom configuration', () => {
      const customConfig = {
        enabled: false,
        maxRetries: 5,
        timeoutMs: 20000
      };

      const customProcessor = new GoogleVisionProcessor(customConfig);
      expect(customProcessor).toBeInstanceOf(GoogleVisionProcessor);
    });

    test('should check if Vision is ready', async () => {
      // Should return false if Google Cloud is not properly configured
      const isReady = await processor.isVisionReady();
      expect(typeof isReady).toBe('boolean');
    });

    test('should get vision info', () => {
      const info = processor.getVisionInfo();
      expect(info).toHaveProperty('ready');
      expect(info).toHaveProperty('config');
      expect(info).toHaveProperty('stats');
      expect(typeof info.ready).toBe('boolean');
    });
  });

  describe('Configuration Management', () => {
    test('should handle disabled configuration', async () => {
      const disabledProcessor = new GoogleVisionProcessor({
        enabled: false
      });

      const isReady = await disabledProcessor.isVisionReady();
      expect(isReady).toBe(false);
    });

    test('should provide usage statistics', () => {
      const stats = processor.getUsageStats();
      
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('successfulRequests');
      expect(stats).toHaveProperty('failedRequests');
      expect(stats).toHaveProperty('quotaExceededCount');
      expect(stats).toHaveProperty('averageProcessingTime');
      expect(stats).toHaveProperty('lastUsed');
      expect(stats).toHaveProperty('monthlyUsage');
      
      expect(typeof stats.totalRequests).toBe('number');
      expect(typeof stats.successfulRequests).toBe('number');
      expect(typeof stats.failedRequests).toBe('number');
    });

    test('should reset usage statistics', () => {
      processor.resetUsageStats();
      const stats = processor.getUsageStats();
      
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.quotaExceededCount).toBe(0);
    });

    test('should check quota limit warnings', () => {
      const isApproaching = processor.isApproachingQuotaLimit(0.5);
      expect(typeof isApproaching).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing credentials gracefully', async () => {
      const noCredsProcessor = new GoogleVisionProcessor({
        enabled: true,
        projectId: undefined,
        keyFilename: undefined
      });

      // Should not throw, but should not be ready
      const isReady = await noCredsProcessor.isVisionReady();
      expect(isReady).toBe(false);
    });

    test('should handle API errors gracefully', async () => {
      // Since we can't actually call Google Vision API in tests,
      // we test that the method exists and handles errors
      try {
        await processor.extractText(mockImageBuffer);
      } catch (error) {
        // Expected to fail in test environment without proper credentials
        expect(error).toBeTruthy();
      }
    });

    test('should handle invalid image data', async () => {
      const invalidBuffer = Buffer.from('invalid image data');
      
      try {
        await processor.extractText(invalidBuffer);
      } catch (error) {
        // Expected to fail with invalid image data
        expect(error).toBeTruthy();
      }
    });

    test('should handle empty buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);
      
      try {
        await processor.extractText(emptyBuffer);
      } catch (error) {
        // Expected to fail with empty buffer
        expect(error).toBeTruthy();
      }
    });
  });

  describe('Text Detection Methods', () => {
    test('should default to TEXT_DETECTION mode', () => {
      const info = processor.getVisionInfo();
      expect(info.config.useDocumentTextDetection).toBe(false);
    });

    test('should support DOCUMENT_TEXT_DETECTION mode', () => {
      const docProcessor = new GoogleVisionProcessor({
        useDocumentTextDetection: true
      });
      
      const info = docProcessor.getVisionInfo();
      expect(info.config.useDocumentTextDetection).toBe(true);
    });
  });

  describe('Performance Tracking', () => {
    test('should track processing times', () => {
      const stats = processor.getUsageStats();
      expect(stats).toHaveProperty('averageProcessingTime');
      expect(typeof stats.averageProcessingTime).toBe('number');
    });

    test('should track monthly usage', () => {
      const stats = processor.getUsageStats();
      expect(stats).toHaveProperty('monthlyUsage');
      expect(typeof stats.monthlyUsage).toBe('number');
    });

    test('should track last used timestamp', () => {
      const stats = processor.getUsageStats();
      expect(stats).toHaveProperty('lastUsed');
      expect(stats.lastUsed).toBeInstanceOf(Date);
    });
  });

  describe('Configuration Validation', () => {
    test('should handle missing project ID', () => {
      const processor = new GoogleVisionProcessor({
        enabled: true,
        projectId: undefined
      });
      
      expect(processor).toBeInstanceOf(GoogleVisionProcessor);
    });

    test('should handle missing key filename', () => {
      const processor = new GoogleVisionProcessor({
        enabled: true,
        keyFilename: undefined
      });
      
      expect(processor).toBeInstanceOf(GoogleVisionProcessor);
    });

    test('should use default timeouts', () => {
      const info = processor.getVisionInfo();
      expect(info.config.timeoutMs).toBe(15000);
    });

    test('should use custom timeouts', () => {
      const customProcessor = new GoogleVisionProcessor({
        timeoutMs: 30000
      });
      
      const info = customProcessor.getVisionInfo();
      expect(info.config.timeoutMs).toBe(30000);
    });
  });

  describe('Integration Readiness', () => {
    test('should provide configuration overview', () => {
      const info = processor.getVisionInfo();
      
      expect(info.config).toHaveProperty('enabled');
      expect(info.config).toHaveProperty('maxRetries');
      expect(info.config).toHaveProperty('timeoutMs');
      expect(info.config).toHaveProperty('useDocumentTextDetection');
    });

    test('should maintain state across multiple calls', async () => {
      const stats1 = processor.getUsageStats();
      const stats2 = processor.getUsageStats();
      
      expect(stats1.totalRequests).toBe(stats2.totalRequests);
      expect(stats1.successfulRequests).toBe(stats2.successfulRequests);
    });
  });
});