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
        // storage.session을 사용할 수 있는 경우 사용(Chrome 102+), 그렇지 않으면 로컬로 대체
        // MV3 서비스 워커의 경우 storage.session이 세션 데이터에 가장 적합함
        // 하지만 서비스 워커 재시작(자주 발생함) 간에 간단하고 지속적으로 유지하기 위해,
        // 타임스탬프와 함께 로컬 스토리지를 사용할 수 있음.

        let sessionData = await chrome.storage.local.get('sessionData');
        const now = Date.now();
        let { sessionId, lastEventTime } = sessionData.sessionData || {};

        if (sessionId && lastEventTime && (now - lastEventTime) < SESSION_EXPIRATION_IN_MIN * 60 * 1000) {
            // 세션 연장
            lastEventTime = now;
        } else {
            // 새 세션
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
