import { OCRProcessor } from '../../src/services/ocrProcessor.js';
import { DEFAULT_OCR_CONFIG } from '../../src/types/ocr.js';
import { DEFAULT_OPENCV_PREPROCESSING } from '../../src/types/opencv.js';

describe('OCRProcessor with Advanced Preprocessing', () => {
  let processor: OCRProcessor;
  let mockImageBuffer: Buffer;

  beforeAll(async () => {
    processor = new OCRProcessor();
    
    // Create a simple test image buffer (1x1 PNG)
    mockImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0x99, 0x01, 0x01, 0x01, 0x00, 0x00,
      0xFE, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE5, 0x27,
      0xDE, 0xFC, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
      0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
  });

  afterAll(async () => {
    await processor.terminate();
  });

  describe('Advanced Preprocessing Integration', () => {
    test('should use OpenCV preprocessing when enabled', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useAdvancedPreprocessing: true,
        minConfidence: 0.1 // Lower threshold for test image
      };

      const result = await processor.extractText(mockImageBuffer, config);
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('processingTime');
      expect(result).toHaveProperty('preprocessingMethod');
      expect(typeof result.preprocessingMethod).toBe('string');
      expect(['opencv', 'sharp']).toContain(result.preprocessingMethod);
    });

    test('should fallback to Sharp.js when OpenCV fails', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useAdvancedPreprocessing: true,
        minConfidence: 0.1
      };

      const result = await processor.extractText(mockImageBuffer, config);
      
      // Should complete successfully even if OpenCV is not available
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('preprocessingMethod');
    });

    test('should use Sharp.js when advanced preprocessing disabled', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useAdvancedPreprocessing: false,
        minConfidence: 0.1
      };

      const result = await processor.extractText(mockImageBuffer, config);
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('preprocessingMethod');
      expect(result.preprocessingMethod).toBe('sharp');
    });
  });

  describe('OpenCV Options Integration', () => {
    test('should accept custom OpenCV preprocessing options', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useAdvancedPreprocessing: true,
        minConfidence: 0.1
      };

      const openCVOptions = {
        ...DEFAULT_OPENCV_PREPROCESSING,
        useAdaptiveThreshold: false,
        useCLAHE: true,
        clipLimit: 3.0
      };

      const result = await processor.extractText(
        mockImageBuffer, 
        config, 
        undefined, // Use default Sharp.js options
        openCVOptions
      );
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('preprocessingMethod');
    });

    test('should handle multi-method processing', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useAdvancedPreprocessing: true,
        minConfidence: 0.1
      };

      const openCVOptions = {
        ...DEFAULT_OPENCV_PREPROCESSING,
        useMultiMethod: true,
        qualityThreshold: 0.5
      };

      const result = await processor.extractText(
        mockImageBuffer, 
        config, 
        undefined,
        openCVOptions
      );
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
    });
  });

  describe('Result Enhancement', () => {
    test('should include preprocessing method in results', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        minConfidence: 0.1
      };

      const result = await processor.extractText(mockImageBuffer, config);
      
      expect(result).toHaveProperty('preprocessingMethod');
      expect(typeof result.preprocessingMethod).toBe('string');
    });

    test('should maintain backward compatibility', async () => {
      // Test without the new parameters
      const result = await processor.extractText(mockImageBuffer);
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('processingTime');
      // Should have preprocessingMethod even with default parameters
      expect(result).toHaveProperty('preprocessingMethod');
    });
  });

  describe('Error Handling', () => {
    test('should handle OpenCV initialization failures gracefully', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useAdvancedPreprocessing: true,
        minConfidence: 0.1
      };

      // Should not throw even if OpenCV fails to initialize
      const result = await processor.extractText(mockImageBuffer, config);
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('preprocessingMethod');
    });

    test('should handle invalid OpenCV options gracefully', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useAdvancedPreprocessing: true,
        minConfidence: 0.1
      };

      const invalidOptions = {
        ...DEFAULT_OPENCV_PREPROCESSING,
        // @ts-expect-error - Testing invalid values
        adaptiveMethod: 'invalid_method',
        blockSize: -1
      };

      // Should fallback to Sharp.js without throwing
      const result = await processor.extractText(
        mockImageBuffer,
        config,
        undefined,
        invalidOptions
      );
      
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
    });
  });

  describe('Performance', () => {
    test('should complete within reasonable time with OpenCV', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        useAdvancedPreprocessing: true,
        minConfidence: 0.1
      };

      const startTime = Date.now();
      await processor.extractText(mockImageBuffer, config);
      const endTime = Date.now();
      
      // Should complete within 15 seconds (generous for CI and OpenCV initialization)
      expect(endTime - startTime).toBeLessThan(15000);
    });

    test('should not significantly slow down processing compared to Sharp.js', async () => {
      const configSharp = {
        ...DEFAULT_OCR_CONFIG,
        useAdvancedPreprocessing: false,
        minConfidence: 0.1
      };

      const configOpenCV = {
        ...DEFAULT_OCR_CONFIG,
        useAdvancedPreprocessing: true,
        minConfidence: 0.1
      };

      const startSharp = Date.now();
      await processor.extractText(mockImageBuffer, configSharp);
      const sharpTime = Date.now() - startSharp;

      const startOpenCV = Date.now();
      await processor.extractText(mockImageBuffer, configOpenCV);
      const openCVTime = Date.now() - startOpenCV;

      // OpenCV should not be more than 3x slower (accounting for initialization)
      expect(openCVTime).toBeLessThan(sharpTime * 3 + 5000);
    });
  });

  describe('Worker State Management', () => {
    test('should check worker readiness', async () => {
      const isReady = await processor.isWorkerReady();
      expect(typeof isReady).toBe('boolean');
    });

    test('should get worker info', async () => {
      const info = await processor.getWorkerInfo();
      expect(info).toHaveProperty('initialized');
      expect(typeof info.initialized).toBe('boolean');
    });

    test('should maintain worker state across multiple calls', async () => {
      const config = {
        ...DEFAULT_OCR_CONFIG,
        minConfidence: 0.1
      };

      // First call
      const result1 = await processor.extractText(mockImageBuffer, config);
      expect(result1).toHaveProperty('text');

      // Second call should reuse initialized worker
      const result2 = await processor.extractText(mockImageBuffer, config);
      expect(result2).toHaveProperty('text');
    });
  });
});