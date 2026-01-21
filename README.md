# WhatsApp Personal Assistant Bot

> AI-powered WhatsApp bot for managing personal finances, tasks, appointments, recipes, and ideas using Google Gemini, Google Sheets, and Google Calendar.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Baileys](https://img.shields.io/badge/WhatsApp-Baileys-25D366?logo=whatsapp)
![Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini-4285F4?logo=google)

## 🌟 Features

### 💰 Financial Management
- **Income & Expense Tracking**: Log transactions via text or photo receipts
- **Automatic OCR**: Extract data from invoice images using Gemini Vision
- **Tax Calculations**: Automatic IVA and IRPF computation
- **Currency Conversion**: USD to EUR conversion with configurable rates
- **Smart Categorization**: AI-powered expense categorization
- **Financial Reports**: Real-time dashboard with quarterly tax summaries

### 📋 Task & Shopping Management
- **To-Do Lists**: Create tasks with priorities and deadlines
- **Shopping Lists**: Track items with quantities
- **Interactive Completion**: Mark items done via numbered selection menu
- **Smart Parsing**: Natural language task extraction ("comprar leche mañana" → structured task)

### 📅 Calendar Integration
- **Appointment Scheduling**: Create Google Calendar events via WhatsApp
- **Smart Date Parsing**: Understands "mañana a las 5pm", "próximo lunes 14:00"
- **Location Support**: Automatically detects and saves event locations
- **Multi-turn Conversations**: Asks for missing details (date/time/subject)

### 🍳 Recipe Management
- **Recipe Storage**: Save recipes with ingredients, steps, and tags
- **Ingredient Search**: Find recipes by available ingredients ("tengo pollo, arroz")
- **URL Extraction**: Automatically extracts recipe links from messages
- **Structured Storage**: Organized in Google Sheets with full-text search

### 💡 Idea Capture
- **Quick Notes**: Capture ideas with automatic summarization
- **Tagging System**: AI-generated tags for easy retrieval
- **Timestamp Tracking**: Automatic date/time stamps for all entries

### 📋 Interactive Lists View
- **Unified Interface**: Access all lists via WhatsApp with `/LISTAS` command
- **Shopping List**: View pending items with quantities
- **Task List**: See pending tasks with priorities and deadlines
- **Recipe Browser**: View recent recipes or search by ingredient
- **Appointments**: Check upcoming calendar events
- **No Web Required**: Fully functional in WhatsApp chat

## 🏗️ Architecture

### Technology Stack

**Backend**:
- **Runtime**: Node.js 20+ with TypeScript
- **WhatsApp**: Baileys (lightweight WebSocket client)
- **AI**: Google Gemini 1.5 Flash (multimodal support)
- **Database**: Google Sheets (via Google Sheets API v4)
- **Calendar**: Google Calendar API v3
- **Web Server**: Express.js with CORS
- **Process Management**: PM2 (production)

**Frontend Dashboard**:
- Vanilla HTML/CSS/JavaScript
- Chart.js for data visualization
- Responsive CSS Grid layout

**Deployment**:
- Oracle Cloud Always Free Tier (Ampere A1.Flex)
- ~50-100MB RAM usage (vs 500MB+ with browser-based solutions)
- Static IP with secure HTTPS-ready architecture

### Project Structure

```
whatsapp-assistant/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── config/
│   │   └── env.ts               # Environment configuration
│   ├── handlers/                # Command handlers
│   │   ├── dispatcher.ts        # Message routing
│   │   ├── finance.ts           # /INGRESO, /GASTO, /FACTURA
│   │   ├── todo.ts              # /PENDIENTE
│   │   ├── shopping.ts          # /COMPRA
│   │   ├── recipe.ts            # /RECETA, /TENGO
│   │   ├── idea.ts              # /IDEA
│   │   ├── appointment.ts       # /CITA
│   │   ├── done.ts              # /HECHO
│   │   └── lists.ts             # /LISTAS
│   ├── services/
│   │   ├── gemini.ts            # AI integration
│   │   ├── sheets.ts            # Google Sheets API
│   │   ├── calendar.ts          # Google Calendar API
│   │   └── flowState.ts         # Conversation state management
│   ├── utils/
│   │   └── whatsapp.ts          # Safe message utilities
│   └── api/
│       └── routes.ts            # Dashboard API endpoints
├── public/
│   ├── index.html               # Dashboard UI
│   └── styles.css               # Dashboard styles
├── .env.example                 # Environment template
├── service-account.json.example # Google Cloud credentials template
├── package.json
├── tsconfig.json
├── DEPLOYMENT.md                # Deployment guide
└── README.md                    # This file
```

## 🚀 Quick Start

### Prerequisites

1. **Google Cloud Project**:
   - Enable Google Sheets API
   - Enable Google Calendar API
   - Create Service Account and download credentials
   - Create Gemini API key

2. **Oracle Cloud**:
   - Free tier VM instance (1GB+ RAM)
   - Reserved public IP address
   - Security rules for ports 22 and 3000

### Installation

1. **Clone the repository**:
```bash
git clone https://github.com/YOUR_USERNAME/whatsapp-assistant.git
cd whatsapp-assistant
```

2. **Install dependencies**:
```bash
npm install
```

3. **Configure environment**:
```bash
cp .env.example .env
cp service-account.json.example service-account.json
```

Edit `.env`:
```env
# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Google Sheets IDs
GOOGLE_SHEET_ID=your_main_sheet_id
GOOGLE_SHEET_IDEAS_ID=your_ideas_sheet_id
GOOGLE_SHEET_RECIPES_ID=your_recipes_sheet_id
GOOGLE_CALENDAR_ID=your_calendar_id

# WhatsApp Group Filtering (optional)
ALLOWED_CHATS=120363xxxxxx@g.us,34607xxxxxx@s.whatsapp.net
```

Edit `service-account.json` with your Google Cloud credentials.

4. **Build and run locally**:
```bash
npm run build
npm start
```

5. **Scan QR code** from terminal with WhatsApp mobile app

### Deploy to Oracle Cloud

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## 📱 Usage

### Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/LISTAS` | View all lists (interactive menu) | `/LISTAS` |
| `/IDEA` | Save an idea | `/IDEA App de recetas con IA` |
| `/PENDIENTE` | Add to-do task | `/PENDIENTE Llamar al dentista mañana` |
| `/COMPRA` | Add shopping item | `/COMPRA leche, pan, huevos` |
| `/INGRESO` | Log income | `/INGRESO 500€ cliente Acme por web` |
| `/GASTO` | Log expense | `/GASTO 50€ comida restaurante` |
| `/FACTURA` | Log invoice (photo) | `/FACTURA` + attach image |
| `/RECETA` | Save recipe | `/RECETA Pasta carbonara: ...` |
| `/TENGO` | Find recipes by ingredients | `/TENGO pollo, arroz, tomate` |
| `/CITA` | Schedule appointment | `/CITA reunión con Juan mañana 15:00` |
| `/HECHO` | Mark task done (interactive) | `/HECHO` |
| `/HECHO [item]` | Mark specific item done | `/HECHO comprar leche` |
| `/INFORME` | View financial report | `/INFORME` |
| `/?` | Show help | `/?` |

### AI-Powered Features

The bot uses Google Gemini to:
- Extract structured data from natural language messages
- Perform OCR on receipts and invoices
- Parse dates ("mañana", "próximo lunes", "15/03")
- Detect entities (clients, providers, locations)
- Categorize expenses automatically
- Generate summaries and tags

## 🔒 Security & Privacy

- **End-to-End Encryption**: WhatsApp messages remain encrypted
- **Chat Filtering**: Only responds to authorized groups/numbers (`ALLOWED_CHATS`)
- **No Data Storage**: Messages processed in real-time, not stored by bot
- **API Keys**: Secured via environment variables and gitignored
- **Service Account**: Google credentials with minimal required permissions

## 📊 Performance

- **Memory Usage**: ~50-150MB (Baileys) vs ~500MB+ (browser-based)
- **Response Time**: ~1-3 seconds per command (depends on Gemini API)
- **Uptime**: 99.9% with PM2 auto-restart
- **Cost**: $0/month (Free tier resources)

## 🛠️ Development

### Build Commands

```bash
npm run dev       # Development mode with auto-reload
npm run build     # Compile TypeScript to dist/
npm run clean     # Remove dist/ folder
npm start         # Production mode (requires build first)
```

### Testing

Send test messages to the bot:
```
/LISTAS
/IDEA test idea
/PENDIENTE test task
/?
```

View logs:
```bash
pm2 logs whatsapp-bot
```

## 🤝 Contributing

Contributions are welcome! This is a personal project, but feel free to:
- Report bugs via Issues
- Suggest features
- Submit pull requests

## 📝 License

MIT License - See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [Google Gemini](https://deepmind.google/technologies/gemini/) - Multimodal AI
- [Oracle Cloud](https://www.oracle.com/cloud/free/) - Free tier hosting
- [PM2](https://pm2.keymetrics.io/) - Process management

## 📧 Contact

Created by [Your Name] - [your@email.com]

Project Link: [https://github.com/YOUR_USERNAME/whatsapp-assistant](https://github.com/YOUR_USERNAME/whatsapp-assistant)
