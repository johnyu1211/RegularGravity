let usageCrawlerWv = null;
let isUsageCrawling = false;
let isFirstUsageLoad = true;
let lastKnownRemainingVal = null;
let lastKnownRemPct = null;
let currentDisplayPct = null;
let crawlTimeoutTimer = null;
let usageResetCountdownInterval = null;

function animatePercentCount(element, start, end, duration) {
    if (!element) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentVal = Math.floor(start + easeProgress * (end - start));
        element.innerText = currentVal + '%';
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            element.innerText = end + '%';
        }
    };
    window.requestAnimationFrame(step);
}

function parseRemainingMs(rawText) {
    if (!rawText || rawText === '--') return null;
    const txt = rawText.trim();

    // 1. Clock time match (e.g. "오전 12:14", "12:14 AM", "12:14 PM", "12:14")
    const clockMatch = txt.match(/(?:(오전|오후|AM|PM)\s*)?(\d{1,2}):(\d{2})(?:\s*(AM|PM|오전|오후))?/i);
    if (clockMatch) {
        const ampm = (clockMatch[1] || clockMatch[4] || '').toUpperCase();
        let hour = parseInt(clockMatch[2], 10);
        const min = parseInt(clockMatch[3], 10);
        const now = new Date();

        if (ampm === 'AM' || ampm === '오전') {
            if (hour === 12) hour = 0; // 12 AM (오전 12시) = 00:00 (Midnight)
        } else if (ampm === 'PM' || ampm === '오후') {
            if (hour < 12) hour += 12; // 12 PM = 12:00, 1 PM = 13:00
        }

        const candidates = [];
        if (ampm) {
            let target = new Date();
            target.setHours(hour, min, 0, 0);
            if (target <= now) {
                target.setDate(target.getDate() + 1);
            }
            candidates.push(target.getTime() - now.getTime());
        } else {
            const h1 = hour % 24;
            const h2 = (hour % 12) + 12;
            const hoursToTry = (h1 === h2) ? [h1] : [h1, h2];

            hoursToTry.forEach(h => {
                let target = new Date();
                target.setHours(h, min, 0, 0);
                if (target <= now) {
                    target.setDate(target.getDate() + 1);
                }
                candidates.push(target.getTime() - now.getTime());
            });
        }
        return Math.min(...candidates);
    }

    // 2. Relative duration match (e.g. 3h 45m, 45m 30s, 3시간 45분 30초)
    const hMatch = txt.match(/(\d+)\s*(?:h|hr|hours?|stunden|std|시간|時)/i);
    const mMatch = txt.match(/(\d+)\s*(?:m|min|minutes?|minuten|분)/i);
    const sMatch = txt.match(/(\d+)\s*(?:s|sec|seconds?|sekunden|초)/i);
    if (hMatch || mMatch || sMatch) {
        const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
        const mins = mMatch ? parseInt(mMatch[1], 10) : 0;
        const secs = sMatch ? parseInt(sMatch[1], 10) : 0;
        return (hours * 3600 + mins * 60 + secs) * 1000;
    }

    // 3. Fallback: single number hours
    const simpleDigit = txt.match(/(\d+)/);
    if (simpleDigit) return parseInt(simpleDigit[1], 10) * 3600 * 1000;

    return null;
}

function startResetCountdownTicker(remainingMs) {
    stopUsageMatrixShuffle();
    if (usageResetCountdownInterval) clearInterval(usageResetCountdownInterval);
    if (!remainingMs || remainingMs <= 0) {
        const elReset = document.getElementById('gemini-usage-reset-time');
        if (elReset) elReset.innerText = '--';
        return;
    }

    const targetTimestamp = Date.now() + remainingMs;
    
    const updateTicker = () => {
        const elReset = document.getElementById('gemini-usage-reset-time');
        if (!elReset) return;

        const now = Date.now();
        const diffMs = Math.max(0, targetTimestamp - now);
        
        if (diffMs <= 0) {
            elReset.innerText = '0s';
            clearInterval(usageResetCountdownInterval);
            if (typeof window.fetchGeminiUsagePercent === 'function') {
                window.fetchGeminiUsagePercent();
            }
            return;
        }

        const totalSecs = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;

        const pad2 = (n) => String(n).padStart(2, '0');
        let formatted = '';
        if (hours > 0) {
            if (mins > 0) {
                formatted = `${hours}h ${pad2(mins)}m`;
            } else {
                formatted = `${hours}h`;
            }
        } else {
            if (mins > 0) {
                formatted = `${mins}m ${pad2(secs)}s`;
            } else {
                formatted = `${secs}s`;
            }
        }

        elReset.innerText = formatted;
    };

    updateTicker();
    usageResetCountdownInterval = setInterval(updateTicker, 1000);
}

function startUsageMatrixShuffle() {}
function stopUsageMatrixShuffle() {}

window.fetchGeminiUsagePercent = function() {
    try {
        if (isUsageCrawling) {
            console.log('[GeminiUsage] Crawl already in progress, skipping...');
            return;
        }
        isUsageCrawling = true;
        startUsageMatrixShuffle();
        
        clearTimeout(crawlTimeoutTimer);
        crawlTimeoutTimer = setTimeout(() => {
            if (isUsageCrawling) {
                console.warn('[GeminiUsage] Crawl timed out after 15s. Resetting flag.');
                isUsageCrawling = false;
                stopUsageMatrixShuffle();
            }
        }, 15000);

        const isBrowserMode = (!window.process || window.process.platform === 'browser');
        if (isBrowserMode) {
            console.log('[GeminiUsage] Starting silent background usage check in browser mode...');
            setTimeout(() => {
                let res = null;
                try {
                    const activeWv = document.getElementById('active-agent-webview');
                    if (activeWv && activeWv.contentDocument) {
                        const winDoc = activeWv.contentDocument;
                        const bodyTxt = winDoc.body ? winDoc.body.innerText : '';
                        let foundPercent = null;
                        const candidates = Array.from(winDoc.querySelectorAll('.gds-emphasized-body-l, [class*="gds-emphasized-body-l"], div, span, p'));
                        for (const el of candidates) {
                            const txt = (el.innerText || el.textContent || '').trim();
                            const m = txt.match(/(\d{1,3})\s*%/);
                            if (m && m[1]) {
                                foundPercent = m[1] + '%';
                                break;
                            }
                        }
                        if (!foundPercent) {
                            const m = bodyTxt.match(/(\d{1,3})\s*%/);
                            if (m && m[1]) foundPercent = m[1] + '%';
                        }
                        let remainingText = '';
                        const allSpans = Array.from(winDoc.querySelectorAll('span, div, p'));
                        for (const el of allSpans) {
                            const txt = (el.innerText || el.textContent || '').trim();
                            if (txt.includes('남음') || txt.includes('까지') || txt.includes('재설정') || txt.toLowerCase().includes('reset') || txt.toLowerCase().includes('remaining')) {
                                if (txt.length < 60) { remainingText = txt; break; }
                            }
                        }
                        if (foundPercent) {
                            res = { foundPercent, remainingText };
                        }
                    }
                } catch(e) {}

                if (res && res.foundPercent) {
                    console.log('[GeminiUsage] Silently updated usage in browser mode:', res);
                    const el1 = document.getElementById('taskbar-gemini-usage-percent');
                    const el2 = document.getElementById('modal-gemini-usage-percent');
                    const gaugeBar = document.getElementById('taskbar-gemini-usage-gauge-fill');
                    const remPct = parseInt(res.foundPercent, 10);
                    if (!isNaN(remPct)) {
                        if (el1) el1.innerText = remPct + '%';
                        if (el2) el2.innerText = remPct + '%';
                        if (gaugeBar) gaugeBar.style.width = Math.min(100, remPct) + '%';
                    }
                }
                isUsageCrawling = false;
                clearTimeout(crawlTimeoutTimer);
                stopUsageMatrixShuffle();
            }, 1200);
            return;
        }

        console.log('[GeminiUsage] Starting usage percent crawl via background webview...');
        const activeWv = document.getElementById('active-agent-webview');
        const partition = activeWv ? activeWv.partition : 'persist:agent_hub';
        const userAgent = activeWv ? activeWv.useragent : undefined;

        if (usageCrawlerWv && usageCrawlerWv.parentNode) {
            usageCrawlerWv.parentNode.removeChild(usageCrawlerWv);
        }
        
        usageCrawlerWv = document.createElement('webview');
        usageCrawlerWv.id = 'gemini-usage-crawler-webview';
        usageCrawlerWv.style.cssText = 'position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; left:-9999px;';
        if (partition) usageCrawlerWv.partition = partition;
        if (userAgent) usageCrawlerWv.useragent = userAgent;
        document.body.appendChild(usageCrawlerWv);

        const onDomReady = () => {
            console.log('[GeminiUsage] Usage page DOM ready, waiting 2.5s for SPA rendering...');
            setTimeout(() => {
                if (!usageCrawlerWv || typeof usageCrawlerWv.executeJavaScript !== 'function') {
                    isUsageCrawling = false;
                    clearTimeout(crawlTimeoutTimer);
                    return;
                }
                usageCrawlerWv.executeJavaScript(`
                    (() => {
                        try {
                            const bodyTxt = document.body ? document.body.innerText : '';
                            const candidates = Array.from(document.querySelectorAll('.gds-emphasized-body-l, [class*="gds-emphasized-body-l"], div, span, p'));
                            let foundPercent = null;
                            for (const el of candidates) {
                                const txt = (el.innerText || el.textContent || '').trim();
                                const m = txt.match(/(\\d{1,3})\\s*%/);
                                if (m && m[1]) {
                                    foundPercent = m[1] + '%';
                                    break;
                                }
                            }
                            if (!foundPercent) {
                                const empEls = Array.from(document.querySelectorAll('.gds-emphasized-body-l, [class*="gds-emphasized-body-l"]'));
                                for (const el of empEls) {
                                    const txt = (el.innerText || el.textContent || '').trim();
                                    const m = txt.match(/(\\d+)/);
                                    if (m && m[1]) {
                                        foundPercent = m[1] + '%';
                                        break;
                                    }
                                }
                            }
                            if (!foundPercent) {
                                const m = bodyTxt.match(/(\\d{1,3})\\s*%/);
                                if (m && m[1]) foundPercent = m[1] + '%';
                            }

                            let foundReset = null;
                            const resetEl = document.querySelector('.reset-time-luminous, .gds-emphasized-body-m.reset-time-luminous, [class*="reset-time"]');
                            if (resetEl) {
                                foundReset = (resetEl.innerText || resetEl.textContent || '').trim();
                            }
                            if (!foundReset) {
                                const resetMatch = bodyTxt.match(/(?:resets?\\s+(?:in|at)\\s+([^\\n\\.,]+)|(?:초기화|남음)\\s*[:\\s]*([^\\n\\.,]+)|([^\\n\\.,]+)\\s*(?:후 초기화|남음))/i);
                                if (resetMatch) {
                                    foundReset = (resetMatch[1] || resetMatch[2] || resetMatch[3] || '').trim();
                                }
                            }
                            if (!foundReset) {
                                const timeMatch = bodyTxt.match(/(?:(?:AM|PM|오전|오후)\\s*)?\\d{1,2}:\\d{2}(?:\\s*(?:AM|PM))?|\\d+\\s*(?:h|hr|hours?|m|min|minutes?|시간|분)/i);
                                if (timeMatch && timeMatch[0]) {
                                    foundReset = timeMatch[0].trim();
                                }
                            }

                            return {
                                success: !!foundPercent,
                                text: foundPercent,
                                resetText: foundReset || '--',
                                raw: bodyTxt.slice(0, 300)
                            };
                        } catch(e) {
                            return { success: false, error: e.message };
                        }
                    })()
                `).then(res => {
                    stopUsageMatrixShuffle();
                    console.log('[GeminiUsage] Crawl Result:', res);
                    const el1 = document.getElementById('gemini-usage-percent-text');
                    const el2 = document.getElementById('taskbar-usage-value');
                    const gaugeBar = document.getElementById('gemini-usage-gauge-bar');
                    
                    if (res && res.success && res.text) {
                        const usedVal = parseInt(res.text, 10);
                        const remPct = isNaN(usedVal) ? 0 : Math.max(0, Math.min(100, 100 - usedVal));
                        const remainingVal = isNaN(usedVal) ? res.text : (remPct + '%');
                        
                        lastKnownRemainingVal = remainingVal;
                        lastKnownRemPct = remPct;

                        if (res.resetText && res.resetText !== '--') {
                            const ms = parseRemainingMs(res.resetText);
                            if (ms) startResetCountdownTicker(ms);
                        }

                        let barColor = 'var(--primary)';
                        if (remPct <= 10) {
                            barColor = '#ef4444';
                        } else if (remPct <= 30) {
                            barColor = '#f97316';
                        } else if (remPct <= 60) {
                            barColor = '#f59e0b';
                        }

                        if (isFirstUsageLoad) {
                            isFirstUsageLoad = false;
                            currentDisplayPct = remPct;
                            
                            if (el1) {
                                el1.classList.remove('usage-loading-pulse');
                                animatePercentCount(el1, 0, remPct, 1400);
                            }
                            if (el2) animatePercentCount(el2, 0, remPct, 1400);

                            if (gaugeBar) {
                                gaugeBar.classList.remove('usage-loading-shimmer');
                                gaugeBar.style.background = barColor;
                                gaugeBar.style.transition = 'none';
                                gaugeBar.style.width = '0%';
                                void gaugeBar.offsetWidth;
                                gaugeBar.style.transition = 'width 1.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.4s ease';
                                const targetWidth = (remPct >= 98) ? 100 : remPct;
                                gaugeBar.style.width = targetWidth + '%';
                            }
                        } else {
                            const oldPct = currentDisplayPct !== null ? currentDisplayPct : remPct;
                            currentDisplayPct = remPct;

                            if (oldPct !== remPct) {
                                if (el1) animatePercentCount(el1, oldPct, remPct, 800);
                                if (el2) animatePercentCount(el2, oldPct, remPct, 800);
                            } else {
                                if (el1) el1.innerText = remainingVal;
                                if (el2) el2.innerText = remainingVal;
                            }

                            if (gaugeBar) {
                                gaugeBar.style.transition = 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.4s ease';
                                gaugeBar.style.background = barColor;
                                const targetWidth = (remPct >= 98) ? 100 : remPct;
                                gaugeBar.style.width = targetWidth + '%';
                            }
                        }
                    } else {
                        console.warn('[GeminiUsage] Could not find percent value on refresh, preserving previous gauge state:', res);
                        if (isFirstUsageLoad) {
                            if (el1) el1.innerText = '--%';
                            if (el2) el2.innerText = '--%';
                            if (gaugeBar) {
                                gaugeBar.classList.remove('usage-loading-shimmer');
                                gaugeBar.style.width = '0%';
                            }
                        }
                    }
                }).catch(err => {
                    console.warn('[GeminiUsage] Script execution caught safely:', err.message || err);
                }).finally(() => {
                    isUsageCrawling = false;
                    clearTimeout(crawlTimeoutTimer);
                    stopUsageMatrixShuffle();
                });
            }, 2500);
        };

        usageCrawlerWv.addEventListener('dom-ready', onDomReady, { once: true });
        usageCrawlerWv.src = 'https://gemini.google.com/usage?t=' + Date.now();
    } catch(err) {
        console.error('[GeminiUsage] Error starting crawler:', err);
        isUsageCrawling = false;
        clearTimeout(crawlTimeoutTimer);
        stopUsageMatrixShuffle();
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

setTimeout(() => {
    if (typeof window.scheduleNextGeminiUsageFetch === 'function') {
        window.scheduleNextGeminiUsageFetch();
    }
}, 5000);
