export interface OpenCVPreprocessingOptions {
  // Adaptive Thresholding
  useAdaptiveThreshold?: boolean;
  adaptiveMethod?: 'gaussian' | 'mean';
  thresholdType?: 'binary' | 'binary_inv';
  blockSize?: number;
  C?: number;
  
  // CLAHE (Contrast Limited Adaptive Histogram Equalization)
  useCLAHE?: boolean;
  clipLimit?: number;
  gridSize?: [number, number];
  
  // Morphological Operations
  useMorphological?: boolean;
  morphOperation?: 'opening' | 'closing' | 'gradient' | 'blackhat' | 'tophat';
  kernelShape?: 'rect' | 'ellipse' | 'cross';
  kernelSize?: [number, number];
  
  // Advanced Denoising
  useAdvancedDenoising?: boolean;
  denoiseMethod?: 'bilateral' | 'non_local_means' | 'gaussian';
  bilateralD?: number;
  bilateralSigmaColor?: number;
  bilateralSigmaSpace?: number;
  
  // Text-Specific Enhancements
  useSkewCorrection?: boolean;
  useTextRegionDetection?: boolean;
  useLineDetection?: boolean;
  
  // Multi-method processing
  useMultiMethod?: boolean;
  qualityThreshold?: number;
}

export const DEFAULT_OPENCV_PREPROCESSING: OpenCVPreprocessingOptions = {
  // Adaptive Thresholding - excellent for varying lighting
  useAdaptiveThreshold: true,
  adaptiveMethod: 'gaussian',
  thresholdType: 'binary',
  blockSize: 11,
  C: 2,
  
  // CLAHE - superior local contrast enhancement
  useCLAHE: true,
  clipLimit: 2.0,
  gridSize: [8, 8],
  
  // Morphological Operations - clean up text structure
  useMorphological: true,
  morphOperation: 'closing',
  kernelShape: 'rect',
  kernelSize: [2, 2],
  
  // Advanced Denoising - preserve edges while reducing noise
  useAdvancedDenoising: true,
  denoiseMethod: 'bilateral',
  bilateralD: 9,
  bilateralSigmaColor: 75,
  bilateralSigmaSpace: 75,
  
  // Text-Specific Enhancements
  useSkewCorrection: true,
  useTextRegionDetection: false, // Can be computationally expensive
  useLineDetection: false,
  
  // Multi-method processing
  useMultiMethod: true,
  qualityThreshold: 0.7
};

export interface PreprocessingMethod {
  name: string;
  description: string;
  config: Partial<OpenCVPreprocessingOptions>;
}

export const PREPROCESSING_METHODS: PreprocessingMethod[] = [
  {
    name: 'schedule_optimized',
    description: 'Optimized for schedule tables with clear text',
    config: {
      useAdaptiveThreshold: true,
      adaptiveMethod: 'gaussian',
      blockSize: 15,
      useCLAHE: true,
      clipLimit: 3.0,
      useMorphological: true,
      morphOperation: 'closing'
    }
  },
  {
    name: 'high_contrast',
    description: 'For images with good contrast but noise',
    config: {
      useAdaptiveThreshold: true,
      adaptiveMethod: 'mean',
      useAdvancedDenoising: true,
      denoiseMethod: 'bilateral',
      useMorphological: true,
      morphOperation: 'opening'
    }
  },
  {
    name: 'low_contrast',
    description: 'For faded or low contrast documents',
    config: {
      useCLAHE: true,
      clipLimit: 4.0,
      gridSize: [6, 6],
      useAdaptiveThreshold: true,
      blockSize: 21,
      useMorphological: true,
      morphOperation: 'gradient'
    }
  },
  {
    name: 'noisy_image',
    description: 'For images with significant noise',
    config: {
      useAdvancedDenoising: true,
      denoiseMethod: 'non_local_means',
      useMorphological: true,
      morphOperation: 'opening',
      kernelSize: [3, 3],
      useAdaptiveThreshold: true,
      blockSize: 9
    }
  }
];

export interface PreprocessingResult {
  buffer: Buffer;
  method: string;
  qualityScore: number;
  processingTime: number;
  metadata: {
    contrast: number;
    sharpness: number;
    brightness: number;
  };
}

export interface OpenCVError {
  code: 'OPENCV_INIT_FAILED' | 'OPENCV_PROCESSING_FAILED' | 'OPENCV_NOT_AVAILABLE';
  message: string;
  originalError?: Error | undefined;
}