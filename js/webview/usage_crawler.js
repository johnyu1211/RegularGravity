let usageCrawlerWv = null;
let isUsageCrawling = false;

window.fetchGeminiUsagePercent = function() {
    try {
        if (isUsageCrawling) return;
        isUsageCrawling = true;
        
        console.log('[GeminiUsage] Starting usage percent crawl via background webview...');
        const activeWv = document.getElementById('active-agent-webview');
        const partition = activeWv ? activeWv.partition : 'persist:agent_hub';
        const userAgent = activeWv ? activeWv.useragent : undefined;

        if (!usageCrawlerWv) {
            usageCrawlerWv = document.createElement('webview');
            usageCrawlerWv.id = 'gemini-usage-crawler-webview';
            usageCrawlerWv.style.cssText = 'position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; left:-9999px;';
            if (partition) usageCrawlerWv.partition = partition;
            if (userAgent) usageCrawlerWv.useragent = userAgent;
            document.body.appendChild(usageCrawlerWv);
        }

        const onDomReady = () => {
            console.log('[GeminiUsage] Usage page DOM ready, waiting 2.5s for SPA rendering...');
            setTimeout(() => {
                if (!usageCrawlerWv || typeof usageCrawlerWv.executeJavaScript !== 'function') {
                    isUsageCrawling = false;
                    return;
                }
                usageCrawlerWv.executeJavaScript(`
                    (() => {
                        try {
                            const candidates = Array.from(document.querySelectorAll('.gds-emphasized-body-l, [class*="gds-emphasized-body-l"], div, span, p'));
                            
                            // 1. Priority: Find element containing % symbol and extract number
                            for (const el of candidates) {
                                const txt = (el.innerText || el.textContent || '').trim();
                                const m = txt.match(/(\\d{1,3})\\s*%/);
                                if (m && m[1]) {
                                    return { success: true, text: m[1] + '%', raw: txt, source: 'percent_match' };
                                }
                            }
                            
                            // 2. Priority: Find .gds-emphasized-body-l element and extract pure number
                            const empEls = Array.from(document.querySelectorAll('.gds-emphasized-body-l, [class*="gds-emphasized-body-l"]'));
                            for (const el of empEls) {
                                const txt = (el.innerText || el.textContent || '').trim();
                                const m = txt.match(/(\\d+)/);
                                if (m && m[1]) {
                                    return { success: true, text: m[1] + '%', raw: txt, source: 'emphasized_number' };
                                }
                            }

                            const bodyText = document.body ? document.body.innerText : '';
                            const m = bodyText.match(/(\\d{1,3})\\s*%/);
                            if (m) {
                                return { success: true, text: m[1] + '%', raw: bodyText.slice(0, 100), source: 'body_regex' };
                            }
                            return { success: false, raw: bodyText.slice(0, 300) };
                        } catch(e) {
                            return { success: false, error: e.message };
                        }
                    })()
                `).then(res => {
                    console.log('[GeminiUsage] Crawl Result:', res);
                    const el1 = document.getElementById('gemini-usage-percent-text');
                    const el2 = document.getElementById('taskbar-usage-value');
                    if (res && res.success && res.text) {
                        const usedVal = parseInt(res.text, 10);
                        const remainingVal = isNaN(usedVal) ? res.text : (Math.max(0, Math.min(100, 100 - usedVal)) + '%');
                        if (el1) el1.innerText = remainingVal;
                        if (el2) el2.innerText = remainingVal;
                    } else {
                        console.warn('[GeminiUsage] Could not find percent value in rendered page.', res);
                        if (el1) el1.innerText = '--%';
                        if (el2) el2.innerText = '--%';
                    }
                }).catch(err => {
                    console.warn('[GeminiUsage] Script execution caught safely:', err.message || err);
                }).finally(() => {
                    isUsageCrawling = false;
                });
            }, 2500);
        };

        usageCrawlerWv.addEventListener('dom-ready', onDomReady, { once: true });
        usageCrawlerWv.src = 'https://gemini.google.com/usage?t=' + Date.now();
    } catch(err) {
        console.error('[GeminiUsage] Error starting crawler:', err);
        isUsageCrawling = false;
    }
};

window.scheduleNextGeminiUsageFetch = function() {
    const minSec = 42;
    const maxSec = 67;
    const randomSec = Math.floor(minSec + Math.random() * (maxSec - minSec + 1));
    console.log(`[GeminiUsage] Next auto-refresh scheduled in ${randomSec}s`);
    setTimeout(() => {
        if (typeof window.fetchGeminiUsagePercent === 'function') {
            window.fetchGeminiUsagePercent();
        }
        window.scheduleNextGeminiUsageFetch();
    }, randomSec * 1000);
};

// Initialize random auto-refresh timer loop (starts 5s after boot)
setTimeout(() => {
    if (typeof window.scheduleNextGeminiUsageFetch === 'function') {
        window.scheduleNextGeminiUsageFetch();
    }
}, 5000);
