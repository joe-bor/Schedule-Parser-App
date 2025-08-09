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

## ⚡ Quick Start

> **Note**: This project is in active development. Setup instructions will be complete once MVP is ready.

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
