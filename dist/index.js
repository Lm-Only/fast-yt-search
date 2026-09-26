import { request } from 'undici';

const BASE_URL = 'https://www.youtube.com/results';
const INNERTUBE_SEARCH_URL = 'https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const DEFAULT_YT_URL = 'https://www.youtube.com/watch?v=';
const YT_DATA_START = 'var ytInitialData = ';
const CONSENT_COOKIE = 'CONSENT=YES+cb.20210328-17-p0.en+FX+999';
const MAX_302_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 250;

class RequestStatusError extends Error {
    constructor(statusCode, locationHeader) {
        super(`Request failed with status code: ${statusCode}${locationHeader ? ` (location: ${locationHeader})` : ''}`);
        this.name = 'RequestStatusError';
        this.statusCode = statusCode;
        this.locationHeader = locationHeader;
    }
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestHeaders(forceConsent) {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        ...(forceConsent ? { 'Cookie': CONSENT_COOKIE } : {})
    };
}

async function fetchHTML(url) {
    let forceConsent = false;

    for (let attempt = 0; attempt <= MAX_302_RETRIES; attempt++) {
        const { statusCode, headers, body } = await request(url, {
            method: 'GET',
            maxRedirections: 0,
            headers: buildRequestHeaders(forceConsent)
        });

        if (statusCode === 200) {
            return body.text();
        }

        const locationHeader = typeof headers.location === 'string' ? headers.location : '';
        await body.dump();

        if (statusCode === 302 && attempt < MAX_302_RETRIES) {
            if (locationHeader.includes('consent.youtube.com') || locationHeader.includes('/sorry/')) {
                forceConsent = true;
            }

            await wait(BASE_RETRY_DELAY_MS * (attempt + 1));
            continue;
        }

        if (statusCode === 302) {
            throw new RequestStatusError(302, locationHeader);
        }

        throw new RequestStatusError(statusCode, locationHeader);
    }
}

async function fetchInitialDataFromInnertube(query) {
    const payload = {
        context: {
            client: {
                clientName: 'WEB',
                clientVersion: '2.20240709.01.00',
                hl: 'en',
                gl: 'US'
            }
        },
        query
    };

    const { statusCode, headers, body } = await request(INNERTUBE_SEARCH_URL, {
        method: 'POST',
        maxRedirections: 0,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive'
        },
        body: JSON.stringify(payload)
    });

    if (statusCode !== 200) {
        const locationHeader = typeof headers.location === 'string' ? headers.location : '';
        await body.dump();
        throw new RequestStatusError(statusCode, locationHeader);
    }

    return body.json();
}

function extractInitialData(html) {
    const startIdx = html.indexOf(YT_DATA_START);
    if (startIdx === -1) return null;

    const jsonStart = startIdx + YT_DATA_START.length;
    const endIdx = html.indexOf(';</script>', jsonStart);
    if (endIdx === -1) return null;

    try {
        return JSON.parse(html.slice(jsonStart, endIdx));
    } catch {
        return null;
    }
}

function createResults(data) {
    const results = { all: [] };
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    
    if (!contents || !contents[0]?.itemSectionRenderer?.contents) return results;

    const items = contents[0].itemSectionRenderer.contents;
    const len = items.length;

    for (let i = 0; i < len; i++) {
        const item = items[i];
        
        if (!item.videoRenderer) continue;

        const video = item.videoRenderer;
        const thumbs = video.thumbnail?.thumbnails;
        const snippets = video.detailedMetadataSnippets?.[0]?.snippetText?.runs;
        
        let description = '';
        if (snippets) {
            const snippetsLen = snippets.length;
            for (let j = 0; j < snippetsLen; j++) {
                description += snippets[j].text;
            }
        }

        results.all.push({
            type: 'video',
            videoId: video.videoId,
            title: video.title?.runs?.[0]?.text || '',
            url: DEFAULT_YT_URL + video.videoId,
            image: thumbs && thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '',
            author: { name: video.longBylineText?.runs?.[0]?.text || '' },
            description,
            views: video.viewCountText?.simpleText || '',
            timestamp: video.lengthText?.simpleText || '',
            ago: video.publishedTimeText?.simpleText || ''
        });
    }

    return results;
}

export async function yts(query) {
    const params = new URLSearchParams({
        app: 'desktop',
        sp: 'mAEA',
        hl: 'en',
        search_query: query
    });

    let ytData;
    try {
        const html = await fetchHTML(`${BASE_URL}?${params.toString()}`);
        ytData = extractInitialData(html);
    } catch (error) {
        if (error instanceof RequestStatusError && error.statusCode === 302) {
            ytData = await fetchInitialDataFromInnertube(query);
        } else {
            throw error;
        }
    }

    if (!ytData) {
        ytData = await fetchInitialDataFromInnertube(query);
    }

    return createResults(ytData);
}
