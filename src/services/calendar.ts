import { google } from 'googleapis';
import { ENV } from '../config/env.js';

const auth = new google.auth.GoogleAuth({
    keyFile: ENV.GOOGLE_SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth });

interface CalendarEvent {
    summary: string;
    description?: string;
    location?: string;
    start: string; // ISO String
    end: string;   // ISO String
}

export async function createEvent(eventData: CalendarEvent) {
    try {
        const event: any = {
            summary: eventData.summary,
            location: eventData.location,
            description: eventData.description || null,
            start: {
                dateTime: eventData.start,
                timeZone: 'Europe/Madrid',
            },
            end: {
                dateTime: eventData.end,
                timeZone: 'Europe/Madrid',
            },
        };

        const res = await calendar.events.insert({
            calendarId: ENV.CALENDAR_ID,
            requestBody: event,
        });

        console.log('📅 Event created:', res.data.htmlLink);
        return res.data;
    } catch (error) {
        console.error('❌ Error creating calendar event:', error);
        return null;
    }
}
