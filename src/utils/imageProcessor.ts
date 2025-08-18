export interface ImagePreprocessingOptions {
  enhanceContrast?: boolean;
  grayscale?: boolean;
  denoise?: boolean;
  targetWidth?: number;
  targetHeight?: number;
  sharpen?: boolean;
  normalizeWhiteBalance?: boolean;
}

export const DEFAULT_PREPROCESSING: ImagePreprocessingOptions = {
  enhanceContrast: true,
  grayscale: true,
  denoise: false, // Sharp's built-in denoise can be aggressive
  targetWidth: 1600, // Higher resolution for better OCR
  targetHeight: 2000,
  sharpen: true,
  normalizeWhiteBalance: true
};

export class ImagePreprocessor {
  async preprocessImage(
    imageBuffer: Buffer, 
    options: ImagePreprocessingOptions = DEFAULT_PREPROCESSING
  ): Promise<Buffer> {
    try {
      const sharp = (await import('sharp')).default;
      let pipeline = sharp(imageBuffer);
      
      console.log('🔧 Starting image preprocessing...');
      
      // Convert to grayscale first for better OCR performance
      if (options.grayscale) {
        console.log('  → Converting to grayscale');
        pipeline = pipeline.grayscale();
      }
      
      // Resize image for optimal OCR processing
      if (options.targetWidth || options.targetHeight) {
        console.log(`  → Resizing to max ${options.targetWidth}x${options.targetHeight}`);
        pipeline = pipeline.resize(options.targetWidth, options.targetHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      
      // Normalize white balance and contrast
      if (options.normalizeWhiteBalance) {
        console.log('  → Normalizing white balance');
        pipeline = pipeline.normalize();
      }
      
      // Enhance contrast for better text recognition
      if (options.enhanceContrast) {
        console.log('  → Enhancing contrast');
        pipeline = pipeline.linear(1.2, 0); // Slight contrast boost
      }
      
      // Apply sharpening for clearer text edges
      if (options.sharpen) {
        console.log('  → Applying sharpening');
        pipeline = pipeline.sharpen({
          sigma: 1,      // Light sharpening
          m1: 0.5,       // Threshold for flat areas
          m2: 2,         // Threshold for jagged areas  
          x1: 2,         // Sharpening strength for flat areas
          y2: 10,        // Sharpening strength for jagged areas
          y3: 20         // Maximum sharpening
        });
      }
      
      // Denoise if requested (can be aggressive, so disabled by default)
      if (options.denoise) {
        console.log('  → Applying denoise');
        pipeline = pipeline.median(3); // Light median filter to reduce noise
      }
      
      // Convert to PNG for consistent OCR input
      const processedBuffer = await pipeline.png({
        compressionLevel: 0, // No compression for best quality
        adaptiveFiltering: false
      }).toBuffer();
      
      const originalSize = (imageBuffer.length / 1024).toFixed(1);
      const processedSize = (processedBuffer.length / 1024).toFixed(1);
      console.log(`✅ Image preprocessing complete: ${originalSize}KB → ${processedSize}KB`);
      
      return processedBuffer;
    } catch (error) {
      console.error('❌ Image preprocessing failed:', error);
      console.log('⚠️ Falling back to original image');
      // Fallback to original image if preprocessing fails
      return imageBuffer;
    }
  }

  async validateImageDimensions(imageBuffer: Buffer): Promise<{ width: number; height: number }> {
    try {
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(imageBuffer).metadata();
      
      const dimensions = {
        width: metadata.width || 800,
        height: metadata.height || 600
      };
      
      console.log(`📏 Image dimensions: ${dimensions.width}x${dimensions.height}`);
      return dimensions;
    } catch (error) {
      console.error('❌ Failed to get image dimensions:', error);
      // Return safe defaults
      return { width: 800, height: 600 };
    }
  }

  async estimateFileSize(imageBuffer: Buffer): Promise<number> {
    return imageBuffer.length;
  }
}