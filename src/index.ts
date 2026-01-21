import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from 'baileys';
import type { WASocket } from 'baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import qrcode from 'qrcode-terminal';
import { dispatchMessage } from './handlers/dispatcher.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import apiRoutes from './api/routes.js';
import { ENV } from './config/env.js';

const logger = P({ level: 'warn' });

// Store socket reference globally for handlers
export let sock: WASocket;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        getMessage: async () => undefined
    });

    // Connection updates (QR, ready, disconnected)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📱 QR Code:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ WhatsApp Bot was disconnected:', lastDisconnect?.error);

            if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                connectToWhatsApp();
            } else {
                console.log('🚪 Logged out. Exiting...');
            }
        }

        if (connection === 'open') {
            console.log('✅ WhatsApp Bot is Ready!');
            console.log(`👤 Logged in as: ${sock.user?.id}`);
        }
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const message of m.messages) {
            // Ignore if from status broadcast
            if (message.key.remoteJid === 'status@broadcast') continue;

            // Filter by allowed chats if configured
            const chatId = message.key.remoteJid!;
            if (ENV.ALLOWED_CHATS.length > 0 && !ENV.ALLOWED_CHATS.includes(chatId)) {
                console.log(`⏩ Ignored message from [Chat: ${chatId}]. Allowed: ${ENV.ALLOWED_CHATS.join(', ')}`);
                continue;
            }

            // Extract sender info
            const isGroup = chatId.endsWith('@g.us');
            const sender = message.key.fromMe ? 'Bot' : (message.key.participant || chatId);

            // Extract message text
            const text = message.message?.conversation ||
                message.message?.extendedTextMessage?.text || '';

            console.log(`📩 Message from [Chat: ${chatId}] [User: ${sender}]: ${text.slice(0, 50)}...`);

            try {
                await dispatchMessage(sock, message);
            } catch (e) {
                console.error('Error dispatching message:', e);
            }
        }
    });
}

// --- Express Server Setup ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/api', apiRoutes);

app.listen(PORT, () => {
    console.log(`🌐 Dashboard running at http://localhost:${PORT}`);
});
// ----------------------------

console.log('🚀 Initializing WhatsApp client...');
connectToWhatsApp().catch(err => console.error('❌ Error during initialization:', err));
