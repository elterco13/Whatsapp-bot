import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  google: {
    // We will expect the JSON key file path to be passed in ENV or we'll look for it in root
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'service-account.json'),
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  }
};
