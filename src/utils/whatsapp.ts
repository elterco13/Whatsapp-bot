import type { WASocket, WAMessage as BaileysMessage, proto } from 'baileys';

export type WAMessage = proto.IWebMessageInfo;
export type WAMessageKey = proto.IMessageKey;

/**
 * Safely sends a reply to a message
 */
export async function safeReply(sock: WASocket, message: WAMessage, content: string) {
    try {
        await sock.sendMessage(message.key.remoteJid!, {
            text: content
        });
        return true;
    } catch (e) {
        console.error('❌ Error in safeReply (trying without quote):', (e as Error).message);

        // Fallback: try without quoting
        try {
            await sock.sendMessage(message.key.remoteJid!, {
                text: content
            });
            return true;
        } catch (e2) {
            console.error('❌ Critical error in safeReply fallback:', (e2 as Error).message);
            return false;
        }
    }
}

/**
 * Safely reacts to a message
 */
export async function safeReact(sock: WASocket, message: WAMessage, emoji: string) {
    try {
        await sock.sendMessage(message.key.remoteJid!, {
            react: { text: emoji, key: message.key }
        });
        return true;
    } catch (e) {
        console.warn('❌ Error in safeReact (ignoring):', (e as Error).message);
        return false;
    }
}
