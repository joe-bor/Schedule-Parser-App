import { ImageAnnotatorClient } from '@google-cloud/vision';
import type {
  GoogleVisionConfig,
  GoogleVisionResult,
  GoogleVisionError,
  GoogleVisionUsageStats,
  BoundingBox,
  GoogleVisionWord,
  TableStructure,
  TableRow,
  TableCell
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
      
      // Extract words and reconstruct table structure
      const words = this.extractWords(result);
      const tableStructure = this.reconstructTable(words);

      const visionResult: GoogleVisionResult = {
        text: extractedText,
        confidence,
        processingTime,
        blocks: this.extractBlocks(result),
        pages: this.extractPages(result),
        words,
        tableStructure
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

  /**
   * Extract individual words with bounding boxes from Vision API result
   */
  private extractWords(result: any): GoogleVisionWord[] {
    if (!this.config.useDocumentTextDetection) {
      return [];
    }

    const words: GoogleVisionWord[] = [];
    const pages = result.fullTextAnnotation?.pages || [];

    for (const page of pages) {
      const blocks = page.blocks || [];
      for (const block of blocks) {
        const paragraphs = block.paragraphs || [];
        for (const paragraph of paragraphs) {
          const paragraphWords = paragraph.words || [];
          for (const word of paragraphWords) {
            const symbols = word.symbols || [];
            const wordText = symbols.map((s: any) => s.text || '').join('');

            if (wordText.trim()) {
              words.push({
                text: wordText,
                boundingBox: this.convertBoundingBox(word.boundingBox),
                confidence: word.confidence || paragraph.confidence || block.confidence || 0.95
              });
            }
          }
        }
      }
    }

    console.log(`📝 Extracted ${words.length} words with spatial coordinates`);
    return words;
  }

  /**
   * Reconstruct table structure from words using spatial coordinates
   */
  private reconstructTable(words: GoogleVisionWord[]): TableStructure | undefined {
    if (words.length === 0) {
      console.log('⚠️ No words to reconstruct table from');
      return undefined;
    }

    console.log('🔨 Reconstructing table structure from spatial data...');

    // Group words into rows based on y-coordinate similarity
    const rowGroups = this.groupWordsIntoRows(words);

    if (rowGroups.length === 0) {
      console.log('⚠️ No rows identified from words');
      return undefined;
    }

    // Identify column boundaries across all rows
    const columnBoundaries = this.identifyColumnBoundaries(rowGroups);

    if (columnBoundaries.length === 0) {
      console.log('⚠️ No columns identified');
      return undefined;
    }

    // Assign words to cells based on row and column
    const tableRows = this.assignWordsToCells(rowGroups, columnBoundaries);

    // Find date header row (contains Mon, Tue, Wed, etc.)
    const dateHeaderRow = this.findDateHeaderRow(tableRows);

    // Estimate employee name column (usually first column)
    const employeeNameColumn = 0;

    const tableStructure: TableStructure = {
      rows: tableRows,
      columnCount: columnBoundaries.length,
      rowCount: tableRows.length,
      dateHeaderRow,
      employeeNameColumn,
      confidence: 0.9
    };

    console.log(`✅ Table reconstructed: ${tableRows.length} rows × ${columnBoundaries.length} columns`);
    if (dateHeaderRow) {
      console.log(`📅 Date header row found at index ${dateHeaderRow.rowIndex}`);
    }

    return tableStructure;
  }

  /**
   * Group words into rows based on y-coordinate similarity
   */
  private groupWordsIntoRows(words: GoogleVisionWord[]): Array<{ words: GoogleVisionWord[]; yPosition: number }> {
    const ROW_Y_THRESHOLD = 15; // pixels - words within this vertical distance are on same row

    const rows: Array<{ words: GoogleVisionWord[]; yPosition: number }> = [];

    for (const word of words) {
      const wordY = this.getAverageY(word.boundingBox);

      // Find existing row within threshold
      const existingRow = rows.find(row => Math.abs(row.yPosition - wordY) < ROW_Y_THRESHOLD);

      if (existingRow) {
        existingRow.words.push(word);
        // Update average y position
        existingRow.yPosition = (existingRow.yPosition * (existingRow.words.length - 1) + wordY) / existingRow.words.length;
      } else {
        rows.push({ words: [word], yPosition: wordY });
      }
    }

    // Sort rows by y-position (top to bottom)
    rows.sort((a, b) => a.yPosition - b.yPosition);

    // Sort words within each row by x-position (left to right)
    rows.forEach(row => {
      row.words.sort((a, b) => this.getAverageX(a.boundingBox) - this.getAverageX(b.boundingBox));
    });

    console.log(`📊 Grouped ${words.length} words into ${rows.length} rows`);
    return rows;
  }

  /**
   * Identify column boundaries from row data
   */
  private identifyColumnBoundaries(rows: Array<{ words: GoogleVisionWord[]; yPosition: number }>): number[] {
    const COLUMN_X_THRESHOLD = 30; // pixels - x positions within this are same column

    // Collect all x-positions from all words
    const allXPositions: number[] = [];
    for (const row of rows) {
      for (const word of row.words) {
        allXPositions.push(this.getAverageX(word.boundingBox));
      }
    }

    if (allXPositions.length === 0) {
      return [];
    }

    // Sort x positions
    allXPositions.sort((a, b) => a - b);

    // Find column boundaries by clustering x-positions
    const columnBoundaries: number[] = [allXPositions[0]];

    for (let i = 1; i < allXPositions.length; i++) {
      const prevX = columnBoundaries[columnBoundaries.length - 1];
      const currentX = allXPositions[i];

      if (currentX - prevX > COLUMN_X_THRESHOLD) {
        columnBoundaries.push(currentX);
      }
    }

    console.log(`📐 Identified ${columnBoundaries.length} column boundaries`);
    return columnBoundaries;
  }

  /**
   * Assign words to table cells based on row and column positions
   */
  private assignWordsToCells(
    rows: Array<{ words: GoogleVisionWord[]; yPosition: number }>,
    columnBoundaries: number[]
  ): TableRow[] {
    const COLUMN_ASSIGNMENT_THRESHOLD = 50; // pixels - how close word must be to column boundary

    const tableRows: TableRow[] = [];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const cells: TableCell[] = [];

      // Initialize cells for each column
      for (let colIndex = 0; colIndex < columnBoundaries.length; colIndex++) {
        cells.push({
          text: '',
          boundingBox: { vertices: [] },
          rowIndex,
          columnIndex: colIndex,
          confidence: 0
        });
      }

      // Assign words to cells
      for (const word of row.words) {
        const wordX = this.getAverageX(word.boundingBox);

        // Find closest column
        let closestColumnIndex = 0;
        let minDistance = Math.abs(wordX - columnBoundaries[0]);

        for (let colIndex = 1; colIndex < columnBoundaries.length; colIndex++) {
          const distance = Math.abs(wordX - columnBoundaries[colIndex]);
          if (distance < minDistance) {
            minDistance = distance;
            closestColumnIndex = colIndex;
          }
        }

        // Assign word to cell if within threshold
        if (minDistance < COLUMN_ASSIGNMENT_THRESHOLD) {
          const cell = cells[closestColumnIndex];
          cell.text += (cell.text ? ' ' : '') + word.text;
          cell.confidence = Math.max(cell.confidence, word.confidence);

          // Expand bounding box
          if (cell.boundingBox.vertices.length === 0) {
            cell.boundingBox = word.boundingBox;
          }
        }
      }

      // Calculate row bounding box
      const rowBoundingBox = this.calculateRowBoundingBox(row.words);

      tableRows.push({
        cells,
        rowIndex,
        yPosition: row.yPosition,
        boundingBox: rowBoundingBox
      });
    }

    return tableRows;
  }

  /**
   * Find the date header row (contains day names like Mon, Tue, Wed)
   */
  private findDateHeaderRow(tableRows: TableRow[]): TableRow | undefined {
    const dayPatterns = /\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

    for (const row of tableRows) {
      const rowText = row.cells.map(cell => cell.text).join(' ').toLowerCase();

      // Count how many day names are in this row
      const dayMatches = rowText.match(new RegExp(dayPatterns, 'gi'));

      if (dayMatches && dayMatches.length >= 3) {
        console.log(`📅 Date header row found: "${row.cells.map(c => c.text).join(' | ')}"`);
        return row;
      }
    }

    console.log('⚠️ No date header row found');
    return undefined;
  }

  /**
   * Get average Y coordinate from bounding box
   */
  private getAverageY(boundingBox: BoundingBox): number {
    if (boundingBox.vertices.length === 0) return 0;
    const sum = boundingBox.vertices.reduce((acc, v) => acc + v.y, 0);
    return sum / boundingBox.vertices.length;
  }

  /**
   * Get average X coordinate from bounding box
   */
  private getAverageX(boundingBox: BoundingBox): number {
    if (boundingBox.vertices.length === 0) return 0;
    const sum = boundingBox.vertices.reduce((acc, v) => acc + v.x, 0);
    return sum / boundingBox.vertices.length;
  }

  /**
   * Calculate bounding box that encompasses all words in a row
   */
  private calculateRowBoundingBox(words: GoogleVisionWord[]): BoundingBox {
    if (words.length === 0) {
      return { vertices: [] };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const word of words) {
      for (const vertex of word.boundingBox.vertices) {
        minX = Math.min(minX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxX = Math.max(maxX, vertex.x);
        maxY = Math.max(maxY, vertex.y);
      }
    }

    return {
      vertices: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
      ]
    };
  }
}