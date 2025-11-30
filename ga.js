const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const MEASUREMENT_ID = 'G-0BXX9SVV9F';
const API_SECRET = 'Z0MVjl4wQsui_pK55bDuHQ';
const DEFAULT_ENGAGEMENT_TIME_MSEC = 100;
const SESSION_EXPIRATION_IN_MIN = 30;

class Analytics {
    constructor() {
        this.debug = false;
    }

    async getOrCreateClientId() {
        const result = await chrome.storage.local.get('clientId');
        let clientId = result.clientId;
        if (!clientId) {
            clientId = self.crypto.randomUUID();
            await chrome.storage.local.set({ clientId });
        }
        return clientId;
    }

    async getOrCreateSessionId() {
        // Use storage.session if available (Chrome 102+), otherwise fallback to local
        // For MV3 service workers, storage.session is best for session data
        // But to keep it simple and persistent across service worker restarts (which happen frequently),
        // we can use local storage with a timestamp.

        let sessionData = await chrome.storage.local.get('sessionData');
        const now = Date.now();
        let { sessionId, lastEventTime } = sessionData.sessionData || {};

        if (sessionId && lastEventTime && (now - lastEventTime) < SESSION_EXPIRATION_IN_MIN * 60 * 1000) {
            // Extend session
            lastEventTime = now;
        } else {
            // New session
            sessionId = now.toString();
            lastEventTime = now;
        }

        await chrome.storage.local.set({ sessionData: { sessionId, lastEventTime } });
        return sessionId;
    }

    async fireEvent(name, params = {}) {
        if (!params.session_id) {
            params.session_id = await this.getOrCreateSessionId();
        }
        if (!params.engagement_time_msec) {
            params.engagement_time_msec = DEFAULT_ENGAGEMENT_TIME_MSEC;
        }

        const clientId = await this.getOrCreateClientId();

        const payload = {
            client_id: clientId,
            events: [{
                name,
                params,
            }],
        };

        const url = `${GA_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            if (this.debug) {
                console.log(`[GA] Event ${name} sent.`, payload);
            }
        } catch (e) {
            console.error('[GA] Failed to send event', e);
        }
    }
}

export default new Analytics();
