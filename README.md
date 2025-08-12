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

- **Backend**: Node.js + Express.js
- **OCR**: Tesseract.js
- **APIs**: Telegram Bot API, Google Calendar API
- **Hosting**: Railway/Render (free tier)

## 🔧 Prerequisites

- Node.js 18+ and npm
- Telegram Bot Token (from @BotFather)
- Google Cloud Platform account (for Calendar API)
- Basic knowledge of JavaScript/Node.js

## 📊 Current Implementation Status

### ✅ **Phase 1: Core OCR Infrastructure - COMPLETED!** 🎉
- **Telegram Bot Integration**: Full webhook system with message/photo handling ✅
- **File Management**: Download and validate photos from Telegram API ✅
- **OCR Processing**: Extract text from images using Tesseract.js ✅
- **Image Preprocessing**: Foundation for image enhancement (ready for optimization) ✅
- **Error Handling**: Comprehensive error types and user feedback ✅
- **Environment Configuration**: Secure API key management ✅
- **Test Suite**: 29/29 tests passing with reliable test coverage ✅

**📈 Live Testing Results**: Successfully processes schedule photos in ~3 seconds with real-time user feedback

### 🚀 Ready for Next Phase
Choose your implementation path:

### 📋 **Phase 2: Schedule Parsing** (Recommended Next)
- Parse OCR text into structured schedule events
- Extract dates, times, event titles, and locations
- Handle various schedule formats (academic, business, personal)

### 📋 **Phase 3: Google Calendar Integration** (Alternative Next)
- OAuth 2.0 flow for user authentication
- Create calendar events from extracted data
- Batch event creation and conflict detection

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
