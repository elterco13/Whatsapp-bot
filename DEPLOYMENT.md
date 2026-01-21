# Deployment Guide - Oracle Cloud (Always Free Tier)

This guide explains how to deploy the WhatsApp Assistant bot to Oracle Cloud's free tier using Baileys (lightweight WhatsApp library).

## Prerequisites

- Oracle Cloud account (Always Free tier)
- SSH key pair for authentication
- Node.js 20+ installed locally for building

## 1. Create Oracle Cloud VM

### Recommended Instance Configuration

**Shape**: VM.Standard.A1.Flex (Ampere ARM64)
- **OCPUs**: 2-4 (Free tier allows up to 4)
- **RAM**: 12-24GB (Free tier allows up to 24GB)
- **Storage**: 50GB (Boot volume)

**Alternative (x86)**: VM.Standard.E2.1.Micro
- **OCPUs**: 1
- **RAM**: 1GB
- ⚠️ Requires 2GB swap file for stability

### Networking Setup

1. **Create VCN** (Virtual Cloud Network) with default settings
2. **Reserve Public IP** (static, so it doesn't change)
3. **Configure Security List**:
   - Allow ingress: `0.0.0.0/0` → TCP Port `22` (SSH)
   - Allow ingress: `0.0.0.0/0` → TCP Port `3000` (Dashboard)

## 2. Server Setup

### Connect via SSH
```bash
ssh -i path/to/your-key.key ubuntu@YOUR_IP_ADDRESS
```

### Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install system libraries for Baileys
sudo apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libgbm1 libasound2 libpangocairo-1.0-0 \
  libpango-1.0-0 libxshmfence1 unzip

# Install PM2 for process management
sudo npm install -g pm2
```

### Optional: Swap File (for 1GB VM only)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Deploy the Bot

### Prepare Locally (Windows PowerShell)

```powershell
# Navigate to project directory
cd path\to\whatsapp-assistant

# Build the project
npm run build

# Create deployment package (includes compiled dist/)
Compress-Archive -Path src,dist,public,package.json,package-lock.json,tsconfig.json,.env,service-account.json -DestinationPath bot.zip -Force

# Upload to server
scp -i "path\to\your-key.key" bot.zip ubuntu@YOUR_IP:~/
```

### Deploy on Server

```bash
# Extract and setup
cd ~
rm -rf whatsapp-bot  # Clean previous installation
mkdir whatsapp-bot
unzip bot.zip -d whatsapp-bot
cd whatsapp-bot

# Install production dependencies only
npm install --omit=dev

# Start with PM2
pm2 start dist/index.js --name "whatsapp-bot"
pm2 save
pm2 startup  # Follow the command it outputs to enable auto-start on reboot
```

## 4. First Run - QR Code Authentication

The first time you run the bot, it will generate a QR code in the PM2 logs:

```bash
pm2 logs whatsapp-bot
```

Scan the QR code with WhatsApp on your phone to link the bot.

## 5. Ubuntu Firewall Configuration

Oracle Cloud instances have an internal firewall (`iptables`) that needs manual configuration:

```bash
# Open port 3000 for dashboard
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT

# Save rules
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

## 6. Verify Deployment

### Check Bot Status
```bash
pm2 status
pm2 logs whatsapp-bot
```

### Access Dashboard
Open browser: `http://YOUR_IP:3000`

### Monitor Memory Usage
```bash
pm2 status  # Check "mem" column - should be ~50-150MB
free -h     # Check overall system memory
```

## 7. Maintenance

### Update Bot
```bash
# On local machine: rebuild and upload new bot.zip
# On server:
cd ~/whatsapp-bot
pm2 stop whatsapp-bot
unzip -o ../bot.zip
npm install --omit=dev
pm2 restart whatsapp-bot
```

### View Logs
```bash
pm2 logs whatsapp-bot
pm2 logs whatsapp-bot --lines 100  # Last 100 lines
```

### Restart Bot
```bash
pm2 restart whatsapp-bot
```

### Stop Bot
```bash
pm2 stop whatsapp-bot
pm2 delete whatsapp-bot
```

## Troubleshooting

### Port 3000 Not Accessible
1. Check Security List in Oracle Cloud Console
2. Verify iptables: `sudo iptables -L -n | grep 3000`
3. Ensure bot is running: `pm2 status`

### Bot Crashes / Out of Memory
- Check swap is active: `free -h`
- Reduce Baileys log level in `dist/index.js`: change `level: 'warn'` to `level: 'error'`
- Consider upgrading to Ampere A1.Flex (4 OCPUs, 24GB RAM - still free)

### Session Errors in Logs
Normal behavior - Baileys attempts to decrypt all messages including ignored ones. These warnings are harmless if the bot responds correctly.

### Bot Not Responding to Messages
- Check `ALLOWED_CHATS` in `.env` matches your group ID
- Verify the bot is authenticated: look for "✅ WhatsApp Bot is Ready!" in logs
- Test with a simple command like `/?`

## Cost Estimate

**Monthly Cost**: $0.00 (Everything is free)

- Oracle Cloud VM: Free Forever (Always Free tier)
- Google Sheets API: Free (unlimited for personal use)
- Google Calendar API: Free (1M requests/day)
- Gemini API: Free (1500 requests/day, ~50/day typical usage)
- WhatsApp (Baileys): Free (no Business API charges)

Set up billing alerts in Google Cloud Console if concerned about Gemini usage.
