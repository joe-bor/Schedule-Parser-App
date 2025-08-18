# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Schedule Parser Bot that processes schedule photos via Telegram and extracts text using OCR (Optical Character Recognition). The goal is to eventually convert schedule images into Google Calendar events automatically.

**Current State**: Phase 1 (Core OCR Infrastructure) is complete. The bot can receive photos via Telegram, download them, and extract text using Tesseract.js with real-time user feedback.

## Development Commands

### Essential Commands
```bash
# Development server with hot reload
npm run dev

# Run all tests
npm test

# Run tests in watch mode  
npm test:watch

# Run tests with coverage
npm test:coverage

# TypeScript compilation check (runs before tests)
npm run pretest

# Build for production
npm run build

# Start production server
npm start
```

### Local Development Setup
```bash
# Set up environment file
npm run setup-env

# Start tunnel for webhook testing (background)
npm run tunnel:bg

# Start tunnel interactively
npm run tunnel
```

### Single Test Execution
```bash
# Run specific test file
npm test -- tests/services/fileManager.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="OCR"
```

## Architecture Overview

### Core Application Structure
- **Express App**: Created via `src/app.ts`, mounted with security middleware (helmet), rate limiting, and API routes under `/api` prefix
- **Server Entry**: `src/server.ts` starts the server and validates environment variables
- **Environment Config**: `src/config/env.ts` uses Zod schemas for type-safe environment validation

### Service Layer Architecture
The application uses a service-oriented architecture with lazy loading:

**OCR Processing Pipeline**:
1. `TelegramFileManager` (`src/services/fileManager.ts`) - Downloads and validates photos from Telegram API
2. `OCRProcessor` (`src/services/ocrProcessor.ts`) - Extracts text using Tesseract.js workers
3. `ImagePreprocessor` (`src/utils/imageProcessor.ts`) - Image enhancement for better OCR results

**Lazy Loading Pattern**: Services are instantiated only when needed to avoid environment validation issues during testing. See `src/routes/telegram.ts` for implementation.

### Route Structure
- `/api/health` - Health check endpoint
- `/api/telegram/webhook` - Telegram bot webhook (rate limited)
- `/api/telegram/setup` - Webhook registration
- `/api/calendar/*` - Google Calendar integration (placeholder)

### Type System
- `src/types/ocr.ts` - OCR-related interfaces, configurations, and result types
- `src/types/telegram.ts` - Telegram API type definitions
- All services use comprehensive TypeScript interfaces for type safety

## Key Technical Details

### Environment Variables
Required for development:
- `TELEGRAM_BOT_TOKEN` - From @BotFather on Telegram
- `PORT` - Server port (defaults to 3000)
- `NODE_ENV` - development/production/test

Optional (for future Google Calendar integration):
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

### Testing Architecture
- **Framework**: Jest with TypeScript support via ts-jest
- **Module System**: ESM modules with experimental VM modules flag
- **Test Organization**: Tests mirror `src/` structure in `tests/` directory
- **Reliability Focus**: 29/29 tests pass consistently, focusing on unit tests over complex integration tests

### ES Modules Configuration
This project uses ESM modules exclusively:
- `package.json` has `"type": "module"`
- Import statements use `.js` extensions for compiled output
- Jest configured with `extensionsToTreatAsEsm` and module name mapping

### OCR Configuration
- **Engine**: Tesseract.js with worker-based processing
- **Languages**: English and French (traineddata files in root)
- **Worker Management**: Proper initialization and cleanup with lazy loading
- **Image Processing**: Preprocessing pipeline for enhanced OCR accuracy

## Testing Guidelines

### Running Tests
- Always run `npm test` before committing changes
- Tests must pass consistently (current: 29/29 passing)
- Use `npm test:watch` during development for immediate feedback

### Test Environment
- Tests run with `NODE_ENV=test` to prevent `process.exit()` calls
- Environment validation throws errors instead of exiting in test mode
- Services use lazy loading to avoid premature initialization

### Mock Strategy
- Focus on reliable unit tests rather than complex integration mocking
- Avoid brittle mocks that break with service changes
- Test business logic and error handling paths

## Development Workflow

### Local Telegram Testing
1. Start development server: `npm run dev`
2. Start tunnel: `npm run tunnel:bg` 
3. Register webhook via `/api/telegram/setup`
4. Send photos to bot for real-time OCR testing

### Code Organization Patterns
- **Lazy Service Loading**: Defer service instantiation until needed (see telegram routes)
- **Environment Validation**: Use Zod schemas for type-safe config
- **Error Handling**: Comprehensive error types with user-friendly messages
- **Worker Management**: Proper cleanup of Tesseract workers on process termination

### Debugging
- OCR processing includes detailed console logging for file IDs, dimensions, and processing times
- File downloads log buffer sizes and validation results
- Rate limiting applied to webhook endpoints to prevent abuse

## Current Implementation Status

### ✅ **Phase 2: OCR Optimization - IN PROGRESS** 
- **Document vs Photo Support**: Uncompressed documents provide 16.5% confidence improvement ✅
- **PSM Fallback Strategy**: Automatic testing of PSM 11 → 3 → 4 → 6 modes ✅  
- **Enhanced Preprocessing**: Sharp.js with grayscale, contrast, sharpening ✅
- **Optimal Configuration**: PSM 3 (AUTO) identified as best for schedule layouts ✅
- **Current Results**: 65-66% confidence on document uploads (vs 47-51% on photos)

### 🚧 **Phase 2A: Advanced Preprocessing (NEXT)**
- **Research Complete**: OpenCV preprocessing can provide significant improvements
- **Target**: Replace Sharp.js with OpenCV (adaptive thresholding, morphological operations, CLAHE)
- **Expected**: 75-80% confidence

### 🔮 **Phase 2B: Multi-Engine OCR (FUTURE)**
- **Google Vision API**: 84% vs 47% accuracy in document tests  
- **Hybrid Approach**: Tesseract layout + Google Vision character recognition
- **Target**: 85-90% confidence for production-ready results

### 📋 **Phase 3 Options**:
- Schedule Parsing: Extract structured data (dates, times, events) from OCR text
- Google Calendar Integration: OAuth flow and direct calendar event creation

The codebase is architected with clean separation between OCR processing and future parsing/calendar functionality.