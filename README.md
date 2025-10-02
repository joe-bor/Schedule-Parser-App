# Schedule Parser Bot

Convert your work schedule photos into Google Calendar events automatically through Telegram.

## 🚀 Features

- **📸 Photo Upload**: Send schedule photos directly to Telegram bot
- **🔍 Smart OCR**: High-accuracy text extraction using dual OCR engines
- **📅 Auto Calendar**: Creates Google Calendar events with proper timezones
- **🎯 Personal Filtering**: Extracts your shifts from team schedules
- **🔐 Secure OAuth**: One-click Google Calendar authentication
- **⚡ Fast Processing**: Real-time schedule parsing and event creation

## 📋 How It Works

```
📱 Telegram Photo
        ↓
🔍 OCR Processing (Tesseract + Google Vision)
        ↓
📊 Schedule Parsing (Extract dates, times, shifts)
        ↓
🎯 Personal Filtering (Your shifts only)
        ↓
🔐 Auth Check (Google Calendar connection)
        ↓
📅 Calendar Events (Auto-created with reminders)
        ↓
✅ Confirmation (Success message with details)
```

**Simple Workflow:**
1. Send your schedule photo to the bot
2. Bot extracts and parses your work shifts  
3. Automatically creates Google Calendar events
4. Get confirmation with event details

*First time? Use `/calendar` command to connect your Google Calendar*

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js, TypeScript
- **OCR**: Tesseract.js, Google Cloud Vision API
- **Image Processing**: OpenCV.js, Sharp
- **APIs**: Telegram Bot API, Google Calendar API
- **Testing**: Jest
- **Database**: In-memory session storage

## 🔧 Prerequisites

- Node.js 18+ and npm
- Telegram Bot Token (from @BotFather)
- Google Cloud Platform account with:
  - Google Calendar API (for calendar integration)
  - Google Cloud Vision API (for enhanced OCR - optional but recommended)
  - Service account key for Vision API authentication
- Basic knowledge of JavaScript/Node.js and TypeScript

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

# Google Calendar API (Required)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/oauth/callback

# Calendar Settings
CALENDAR_DEFAULT_TIMEZONE=America/Los_Angeles
CALENDAR_BATCH_SIZE=10
CALENDAR_CONFLICT_DETECTION=false

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

### Telegram Integration
```
POST /api/telegram/webhook    # Bot webhook endpoint
POST /api/telegram/setup      # Register webhook
```

### Calendar Integration
```
GET  /api/calendar/auth/:telegramUserId        # OAuth URL
GET  /api/calendar/oauth/callback              # OAuth callback
POST /api/calendar/events                      # Create event
POST /api/calendar/events/batch                # Batch create events
GET  /api/calendar/status/:telegramUserId      # Auth status
GET  /api/calendar/calendars/:telegramUserId   # User calendars
DELETE /api/calendar/auth/:telegramUserId      # Revoke access
POST /api/calendar/test/personal-schedule      # Test endpoint
```

## 🧪 Development & Testing

```bash
# Start development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm test:coverage

# Test personal schedule filtering
curl -X POST http://localhost:3000/api/calendar/test/personal-schedule
```


## 📋 License

MIT License - see [LICENSE](./LICENSE) for details.
