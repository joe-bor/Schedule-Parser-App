import type { 
  OpenCVPreprocessingOptions, 
  PreprocessingResult, 
  OpenCVError,
  PreprocessingMethod
} from '../types/opencv.js';
import { DEFAULT_OPENCV_PREPROCESSING, PREPROCESSING_METHODS } from '../types/opencv.js';
import { ImagePreprocessor } from './imageProcessor.js';

export class AdvancedImageProcessor {
  private cv: any = null;
  private isInitialized = false;
  private fallbackProcessor: ImagePreprocessor;

  constructor() {
    this.fallbackProcessor = new ImagePreprocessor();
  }

  /**
   * Initialize OpenCV.js with error handling
   */
  private async initializeOpenCV(): Promise<void> {
    if (this.isInitialized && this.cv) {
      return;
    }

    try {
      console.log('🚀 Initializing OpenCV.js...');
      
      // Import OpenCV.js
      const cv = await import('@techstark/opencv-js');
      
      // Wait for OpenCV to be ready
      await new Promise<void>((resolve, reject) => {
        if (cv.default.getBuildInformation && typeof cv.default.getBuildInformation === 'function') {
          // Already ready
          this.cv = cv.default;
          this.isInitialized = true;
          resolve();
        } else {
          // Set up onRuntimeInitialized callback
          cv.default.onRuntimeInitialized = () => {
            this.cv = cv.default;
            this.isInitialized = true;
            console.log('✅ OpenCV.js initialized successfully');
            resolve();
          };
          
          // Timeout after 10 seconds
          setTimeout(() => {
            reject(new Error('OpenCV initialization timeout'));
          }, 10000);
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to initialize OpenCV:', error);
      throw this.createOpenCVError(
        'OPENCV_INIT_FAILED',
        `OpenCV initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Advanced preprocessing with OpenCV using multi-method approach
   */
  async preprocessImage(
    imageBuffer: Buffer,
    options: OpenCVPreprocessingOptions = DEFAULT_OPENCV_PREPROCESSING
  ): Promise<Buffer> {
    try {
      await this.initializeOpenCV();
      
      if (options.useMultiMethod) {
        return await this.processWithMultipleMethods(imageBuffer, options);
      } else {
        const result = await this.processSingleMethod(imageBuffer, 'custom', options);
        return result.buffer;
      }
    } catch (error) {
      console.error('❌ OpenCV preprocessing failed, falling back to Sharp.js:', error);
      // Fallback to Sharp.js preprocessing
      return await this.fallbackProcessor.preprocessImage(imageBuffer);
    }
  }

  /**
   * Process image with multiple preprocessing methods and select the best result
   */
  private async processWithMultipleMethods(
    imageBuffer: Buffer,
    options: OpenCVPreprocessingOptions
  ): Promise<Buffer> {
    console.log('🔧 Starting multi-method OpenCV preprocessing...');
    
    const methods = [
      { name: 'schedule_optimized', config: PREPROCESSING_METHODS[0]?.config || {} },
      { name: 'high_contrast', config: PREPROCESSING_METHODS[1]?.config || {} },
      { name: 'low_contrast', config: PREPROCESSING_METHODS[2]?.config || {} }
    ];

    const results: PreprocessingResult[] = [];

    for (const method of methods) {
      try {
        console.log(`  🧪 Trying method: ${method.name}`);
        const methodOptions = { ...options, ...method.config };
        const result = await this.processSingleMethod(imageBuffer, method.name, methodOptions);
        results.push(result);
        console.log(`     Result: Quality score ${result.qualityScore.toFixed(3)}`);
      } catch (error) {
        console.warn(`     ⚠️ Method ${method.name} failed:`, error);
        continue;
      }
    }

    if (results.length === 0) {
      throw new Error('All preprocessing methods failed');
    }

    // Select the best result based on quality score
    const bestResult = results.reduce((best, current) => 
      current.qualityScore > best.qualityScore ? current : best
    );

    console.log(`🏆 Best result: ${bestResult.method} with quality score ${bestResult.qualityScore.toFixed(3)}`);
    console.log(`⏱️ Total preprocessing time: ${results.reduce((sum, r) => sum + r.processingTime, 0)}ms`);

    return bestResult.buffer;
  }

  /**
   * Process image with a single preprocessing method
   */
  private async processSingleMethod(
    imageBuffer: Buffer,
    methodName: string,
    options: OpenCVPreprocessingOptions
  ): Promise<PreprocessingResult> {
    const startTime = Date.now();

    // Convert Buffer to OpenCV Mat
    const src = this.bufferToMat(imageBuffer);
    let processed = new this.cv.Mat();

    try {
      // Convert to grayscale if needed
      if (src.channels() > 1) {
        this.cv.cvtColor(src, processed, this.cv.COLOR_RGBA2GRAY);
      } else {
        processed = src.clone();
      }

      // Apply CLAHE for local contrast enhancement
      if (options.useCLAHE) {
        processed = this.applyCLAHE(processed, options);
      }

      // Apply advanced denoising
      if (options.useAdvancedDenoising) {
        processed = this.applyAdvancedDenoising(processed, options);
      }

      // Apply adaptive thresholding
      if (options.useAdaptiveThreshold) {
        processed = this.applyAdaptiveThresholding(processed, options);
      }

      // Apply morphological operations
      if (options.useMorphological) {
        processed = this.applyMorphologicalOperations(processed, options);
      }

      // Apply skew correction if enabled
      if (options.useSkewCorrection) {
        processed = this.applySkewCorrection(processed);
      }

      // Convert back to buffer
      const resultBuffer = this.matToBuffer(processed);
      const qualityScore = this.calculateQualityScore(processed);
      const processingTime = Date.now() - startTime;

      return {
        buffer: resultBuffer,
        method: methodName,
        qualityScore,
        processingTime,
        metadata: {
          contrast: this.calculateContrast(processed),
          sharpness: this.calculateSharpness(processed),
          brightness: this.calculateBrightness(processed)
        }
      };

    } finally {
      // Clean up OpenCV Mats
      src.delete();
      processed.delete();
    }
  }

  /**
   * Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
   */
  private applyCLAHE(src: any, options: OpenCVPreprocessingOptions): any {
    const clahe = new this.cv.CLAHE();
    clahe.setClipLimit(options.clipLimit || 2.0);
    clahe.setTilesGridSize(new this.cv.Size(
      options.gridSize?.[0] || 8,
      options.gridSize?.[1] || 8
    ));
    
    const dst = new this.cv.Mat();
    clahe.apply(src, dst);
    clahe.delete();
    return dst;
  }

  /**
   * Apply advanced denoising
   */
  private applyAdvancedDenoising(src: any, options: OpenCVPreprocessingOptions): any {
    const dst = new this.cv.Mat();
    
    switch (options.denoiseMethod) {
      case 'bilateral':
        this.cv.bilateralFilter(
          src, dst,
          options.bilateralD || 9,
          options.bilateralSigmaColor || 75,
          options.bilateralSigmaSpace || 75
        );
        break;
      case 'gaussian':
        this.cv.GaussianBlur(src, dst, new this.cv.Size(5, 5), 0);
        break;
      case 'non_local_means':
        // Note: fastNlMeansDenoising may not be available in all OpenCV.js builds
        try {
          this.cv.fastNlMeansDenoising(src, dst);
        } catch {
          // Fallback to bilateral filter
          this.cv.bilateralFilter(src, dst, 9, 75, 75);
        }
        break;
      default:
        return src.clone();
    }
    
    return dst;
  }

  /**
   * Apply adaptive thresholding
   */
  private applyAdaptiveThresholding(src: any, options: OpenCVPreprocessingOptions): any {
    const dst = new this.cv.Mat();
    
    const adaptiveMethod = options.adaptiveMethod === 'gaussian' 
      ? this.cv.ADAPTIVE_THRESH_GAUSSIAN_C 
      : this.cv.ADAPTIVE_THRESH_MEAN_C;
    
    const thresholdType = options.thresholdType === 'binary_inv'
      ? this.cv.THRESH_BINARY_INV
      : this.cv.THRESH_BINARY;

    this.cv.adaptiveThreshold(
      src, dst,
      255, // maxValue
      adaptiveMethod,
      thresholdType,
      options.blockSize || 11,
      options.C || 2
    );
    
    return dst;
  }

  /**
   * Apply morphological operations
   */
  private applyMorphologicalOperations(src: any, options: OpenCVPreprocessingOptions): any {
    const dst = new this.cv.Mat();
    
    // Create morphological kernel
    const kernelShape = options.kernelShape === 'ellipse' ? this.cv.MORPH_ELLIPSE :
                       options.kernelShape === 'cross' ? this.cv.MORPH_CROSS :
                       this.cv.MORPH_RECT;
    
    const kernel = this.cv.getStructuringElement(
      kernelShape,
      new this.cv.Size(options.kernelSize?.[0] || 2, options.kernelSize?.[1] || 2)
    );

    // Apply morphological operation
    const operation = this.getMorphOperation(options.morphOperation || 'closing');
    this.cv.morphologyEx(src, dst, operation, kernel);
    
    kernel.delete();
    return dst;
  }

  /**
   * Apply skew correction using Hough Line Transform
   */
  private applySkewCorrection(src: any): any {
    try {
      // Edge detection for line detection
      const edges = new this.cv.Mat();
      this.cv.Canny(src, edges, 50, 150);

      // Hough Line Transform
      const lines = new this.cv.Mat();
      this.cv.HoughLines(edges, lines, 1, Math.PI / 180, 100);

      if (lines.rows > 0) {
        // Calculate average angle of detected lines
        let angleSum = 0;
        let count = 0;
        
        for (let i = 0; i < lines.rows; i++) {
          const rho = lines.data32F[i * 2];
          const theta = lines.data32F[i * 2 + 1];
          const angle = theta * 180 / Math.PI - 90;
          
          // Only consider lines that are roughly horizontal (±30 degrees)
          if (Math.abs(angle) < 30) {
            angleSum += angle;
            count++;
          }
        }

        if (count > 0) {
          const avgAngle = angleSum / count;
          
          // Only correct if angle is significant (> 0.5 degrees)
          if (Math.abs(avgAngle) > 0.5) {
            const dst = new this.cv.Mat();
            const center = new this.cv.Point2(src.cols / 2, src.rows / 2);
            const rotationMatrix = this.cv.getRotationMatrix2D(center, avgAngle, 1.0);
            
            this.cv.warpAffine(src, dst, rotationMatrix, src.size());
            
            rotationMatrix.delete();
            edges.delete();
            lines.delete();
            
            return dst;
          }
        }
      }

      edges.delete();
      lines.delete();
    } catch (error) {
      console.warn('⚠️ Skew correction failed, using original image:', error);
    }

    return src.clone();
  }

  /**
   * Convert Buffer to OpenCV Mat
   */
  private bufferToMat(buffer: Buffer): any {
    const uint8Array = new Uint8Array(buffer);
    return this.cv.imdecode(uint8Array, this.cv.IMREAD_COLOR);
  }

  /**
   * Convert OpenCV Mat to Buffer
   */
  private matToBuffer(mat: any): Buffer {
    const vector = new this.cv.MatVector();
    vector.push_back(mat);
    const buffer = this.cv.imencode('.png', mat);
    const result = Buffer.from(buffer.data);
    vector.delete();
    buffer.delete();
    return result;
  }

  /**
   * Calculate quality score based on multiple metrics
   */
  private calculateQualityScore(mat: any): number {
    const contrast = this.calculateContrast(mat);
    const sharpness = this.calculateSharpness(mat);
    const brightness = this.calculateBrightness(mat);
    
    // Weighted combination of metrics
    // Contrast and sharpness are more important for OCR
    return (contrast * 0.4 + sharpness * 0.4 + brightness * 0.2);
  }

  /**
   * Calculate image contrast using standard deviation
   */
  private calculateContrast(mat: any): number {
    const mean = new this.cv.Mat();
    const stddev = new this.cv.Mat();
    this.cv.meanStdDev(mat, mean, stddev);
    
    const contrast = stddev.data64F[0] / 255.0; // Normalize to 0-1
    
    mean.delete();
    stddev.delete();
    
    return Math.min(contrast, 1.0);
  }

  /**
   * Calculate image sharpness using Laplacian variance
   */
  private calculateSharpness(mat: any): number {
    const laplacian = new this.cv.Mat();
    this.cv.Laplacian(mat, laplacian, this.cv.CV_64F);
    
    const mean = new this.cv.Mat();
    const stddev = new this.cv.Mat();
    this.cv.meanStdDev(laplacian, mean, stddev);
    
    const variance = stddev.data64F[0] * stddev.data64F[0];
    const sharpness = Math.min(variance / 1000.0, 1.0); // Normalize
    
    laplacian.delete();
    mean.delete();
    stddev.delete();
    
    return sharpness;
  }

  /**
   * Calculate image brightness
   */
  private calculateBrightness(mat: any): number {
    const mean = new this.cv.Mat();
    const stddev = new this.cv.Mat();
    this.cv.meanStdDev(mat, mean, stddev);
    
    const brightness = mean.data64F[0] / 255.0; // Normalize to 0-1
    
    mean.delete();
    stddev.delete();
    
    // Ideal brightness is around 0.5, so calculate distance from ideal
    return 1.0 - Math.abs(brightness - 0.5) * 2;
  }

  /**
   * Get OpenCV morphological operation constant
   */
  private getMorphOperation(operation: string): number {
    switch (operation) {
      case 'opening': return this.cv.MORPH_OPEN;
      case 'closing': return this.cv.MORPH_CLOSE;
      case 'gradient': return this.cv.MORPH_GRADIENT;
      case 'blackhat': return this.cv.MORPH_BLACKHAT;
      case 'tophat': return this.cv.MORPH_TOPHAT;
      default: return this.cv.MORPH_CLOSE;
    }
  }

  /**
   * Create OpenCV error object
   */
  private createOpenCVError(
    code: OpenCVError['code'],
    message: string,
    originalError?: Error
  ): OpenCVError {
    return { code, message, originalError };
  }

  /**
   * Check if OpenCV is available and ready
   */
  async isOpenCVReady(): Promise<boolean> {
    try {
      await this.initializeOpenCV();
      return this.isInitialized;
    } catch {
      return false;
    }
  }

  /**
   * Get OpenCV build information for debugging
   */
  getOpenCVInfo(): { ready: boolean; buildInfo?: string } {
    if (!this.isInitialized || !this.cv) {
      return { ready: false };
    }

    try {
      return {
        ready: true,
        buildInfo: this.cv.getBuildInformation()
      };
    } catch {
      return { ready: false };
    }
  }
}