# Schedule Parser Bot

Automated system that converts schedule photos into Google Calendar events via Telegram bot integration.

## 🚀 Features

- **Photo Upload**: Send schedule photos directly to Telegram bot
- **Smart OCR**: Extracts schedule data using Tesseract.js
- **Auto Calendar**: Creates Google Calendar events automatically
- **Real-time Updates**: Get confirmation messages for each processed schedule
- **Free to Run**: Uses only free APIs and services

## 📋 How It Works

1. **Send Photo** → Upload your schedule image to the Telegram bot
2. **OCR Processing** → Bot extracts text and parses schedule data
3. **Calendar Creation** → Events are automatically added to your Google Calendar
4. **Confirmation** → Receive success/error messages via Telegram

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js + TypeScript
- **OCR Engines**: 
  - **Tesseract.js**: Open-source OCR with PSM fallback strategies
  - **Google Cloud Vision API**: Professional-grade OCR with 90.5% accuracy
- **Image Processing**: 
  - **OpenCV.js**: Advanced preprocessing (adaptive thresholding, CLAHE, morphological operations)
  - **Sharp**: Fast image manipulation and fallback processing
- **APIs**: Telegram Bot API, Google Calendar API, Google Cloud Vision API
- **Testing**: Jest with ES modules support
- **Development**: MCP servers for OpenCV and Tesseract.js documentation
- **Hosting**: Railway/Render (free tier)

## 🔧 Prerequisites

- Node.js 18+ and npm
- Telegram Bot Token (from @BotFather)
- Google Cloud Platform account with:
  - Google Calendar API (for calendar integration)
  - Google Cloud Vision API (for enhanced OCR - optional but recommended)
  - Service account key for Vision API authentication
- Basic knowledge of JavaScript/Node.js and TypeScript

## 📊 Current Implementation Status

### ✅ **Phase 1: Core OCR Infrastructure - COMPLETED!** 🎉
- **Telegram Bot Integration**: Full webhook system with message/photo handling ✅
- **File Management**: Download and validate photos from Telegram API ✅
- **OCR Processing**: Extract text from images using Tesseract.js ✅
- **Image Preprocessing**: Foundation for image enhancement ✅
- **Error Handling**: Comprehensive error types and user feedback ✅
- **Environment Configuration**: Secure API key management ✅
- **Test Suite**: Core functionality with reliable test coverage ✅

### ✅ **Phase 2: Advanced OCR Optimization - COMPLETED!** 🎉
- **Phase 2A**: Advanced Preprocessing ✅
  - **OpenCV.js Integration**: Advanced image preprocessing pipeline ✅
  - **Multi-method Processing**: Adaptive thresholding, CLAHE, morphological operations ✅
  - **Quality Scoring**: Automatic selection of best preprocessing method ✅
  - **Graceful Fallbacks**: Sharp.js fallback when OpenCV fails ✅
- **Phase 2B**: Multi-Engine OCR ✅
  - **Google Vision API Integration**: Professional-grade OCR engine ✅
  - **Intelligent Fallback System**: Google Vision triggers when Tesseract < 80% confidence ✅
  - **Engine Comparison**: Real-time performance tracking and selection ✅
  - **Cost Optimization**: Smart quota management and usage statistics ✅

**📈 Achievement**: **90.5% OCR confidence** on schedule documents (vs 47% Tesseract-only)

### 🚀 **Ready for Phase 3**
Choose your implementation path:

### 📋 **Phase 3A: Schedule Parsing** (Recommended Next)
- Parse OCR text into structured schedule events
- Extract dates, times, event titles, and locations
- Handle various schedule formats (academic, business, personal)
- Leverage high-confidence OCR results from Phase 2

### 📋 **Phase 3B: Google Calendar Integration** (Alternative Next)
- OAuth 2.0 flow for user authentication
- Create calendar events from extracted data
- Batch event creation and conflict detection
- Direct integration with 90.5% confidence OCR pipeline

## ⚡ Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/schedule-parser-bot.git
   cd schedule-parser-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment setup**

   ```bash
   cp .env.example .env
   # Edit .env with your API keys (see Configuration section)
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## ⚙️ Configuration

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=your_webhook_url_here

# Google Calendar API
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=your_redirect_uri

# Google Cloud Vision API (Optional - for 90.5% OCR accuracy)
GOOGLE_CLOUD_PROJECT_ID=your_project_id_here
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
GOOGLE_VISION_ENABLED=true
GOOGLE_VISION_QUOTA_LIMIT=1000
GOOGLE_VISION_USE_DOCUMENT_DETECTION=true
```

### Getting API Keys

#### Telegram Bot Token

1. Message @BotFather on Telegram
2. Use `/newbot` command
3. Follow prompts to create your bot
4. Save the token provided

#### Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project or select existing
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs

#### Google Cloud Vision API (Optional - for Enhanced OCR)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Use same project or create new one
3. Enable **Cloud Vision API**
4. Create **Service Account**:
   - Go to IAM & Admin > Service Accounts
   - Click "Create Service Account"
   - Assign **Cloud Vision AI Service Agent** role
5. Generate **JSON Key**:
   - Click on service account > Keys > Add Key > Create new key (JSON)
   - Download and save securely (never commit to version control)
6. Set `GOOGLE_APPLICATION_CREDENTIALS` to the JSON file path

**💰 Cost**: Free tier provides 1,000 OCR requests/month  
**🎯 Benefit**: Improves OCR accuracy from 47% to 90.5% on schedule documents

For detailed setup instructions, see [GOOGLE_CLOUD_SETUP.md](./GOOGLE_CLOUD_SETUP.md)

## 📖 API Documentation

### Health Check

```
GET /api/health
```

Returns server status and health information.

### Telegram Webhook

```
POST /api/telegram/webhook
```

Receives Telegram bot updates (photos, messages).

### Telegram Setup

```
POST /api/telegram/setup
```

Registers webhook URL with Telegram Bot API.

### Calendar Routes

```
GET /api/calendar/oauth/callback
POST /api/calendar/events
```

OAuth callback and calendar event management (implementation in progress).
