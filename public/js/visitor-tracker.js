/**
 * Visitor Tracking for TownRanker
 * Captures detailed visitor data and sends to backend
 */

(function() {
    'use strict';

    // Skip tracking when the site is embedded inside an iframe (e.g. portfolio previews)
    if (window.top !== window.self) {
        console.log('🖼️  Embedded preview detected - visitor tracking disabled');
        return;
    }

    // Generate unique session ID
    function generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    }

    // Get or create session ID
    let sessionId = sessionStorage.getItem('townranker_session_id');
    if (!sessionId) {
        sessionId = generateSessionId();
        sessionStorage.setItem('townranker_session_id', sessionId);
    }

    // Track session pages
    let sessionPages = JSON.parse(sessionStorage.getItem('townranker_session_pages') || '[]');

    // Track current page stats
    let pageStartTime = Date.now();
    let maxScrollDepth = 0;
    let interactions = {
        clicks: 0,
        mouseMovements: 0,
        keyPresses: 0,
        touches: 0
    };

    // Track scroll depth
    function updateScrollDepth() {
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollHeight > 0) {
            const scrollPercentage = Math.round((window.scrollY / scrollHeight) * 100);
            if (scrollPercentage > maxScrollDepth) {
                maxScrollDepth = scrollPercentage;
            }
        }
    }

    // Track interactions
    let mouseMoveThrottle;
    window.addEventListener('mousemove', function() {
        if (!mouseMoveThrottle) {
            interactions.mouseMovements++;
            mouseMoveThrottle = setTimeout(function() {
                mouseMoveThrottle = null;
            }, 100);
        }
    }, { passive: true });

    window.addEventListener('click', function() {
        interactions.clicks++;
    }, { passive: true });

    window.addEventListener('keypress', function() {
        interactions.keyPresses++;
    }, { passive: true });

    window.addEventListener('touchstart', function() {
        interactions.touches++;
    }, { passive: true });

    window.addEventListener('scroll', updateScrollDepth, { passive: true });

    // Get UTM parameters
    function getUTMParameters() {
        const params = new URLSearchParams(window.location.search);
        return {
            source: params.get('utm_source') || null,
            medium: params.get('utm_medium') || null,
            campaign: params.get('utm_campaign') || null,
            term: params.get('utm_term') || null,
            content: params.get('utm_content') || null
        };
    }

    // Get performance metrics
    function getPerformanceMetrics() {
        if (!window.performance || !window.performance.timing) {
            return null;
        }

        const timing = window.performance.timing;
        const navigation = window.performance.navigation;

        return {
            pageLoad: timing.loadEventEnd - timing.navigationStart,
            domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
            firstPaint: timing.responseStart - timing.navigationStart,
            navigationType: navigation.type
        };
    }

    // Get connection info
    function getConnectionInfo() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!connection) return null;

        return {
            effectiveType: connection.effectiveType || null,
            downlink: connection.downlink || null,
            rtt: connection.rtt || null,
            saveData: connection.saveData || false
        };
    }

    // Collect visitor data
    function collectVisitorData(isPageExit) {
        const timeOnPage = Math.round((Date.now() - pageStartTime) / 1000);

        return {
            // Page info
            page: window.location.pathname,
            pageTitle: document.title,
            referrer: document.referrer || null,

            // Session info
            sessionId: sessionId,
            sessionPageCount: sessionPages.length + 1,

            // Device & Browser
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            languages: navigator.languages || [navigator.language],
            hardwareConcurrency: navigator.hardwareConcurrency || null,
            deviceMemory: navigator.deviceMemory || null,
            cookieEnabled: navigator.cookieEnabled,

            // Screen info
            screen: {
                width: window.screen.width,
                height: window.screen.height,
                availWidth: window.screen.availWidth,
                availHeight: window.screen.availHeight,
                colorDepth: window.screen.colorDepth,
                devicePixelRatio: window.devicePixelRatio || 1,
                orientation: window.screen.orientation ? window.screen.orientation.type : null
            },

            // Viewport
            viewport: {
                width: window.innerWidth || document.documentElement.clientWidth,
                height: window.innerHeight || document.documentElement.clientHeight
            },

            // Network info
            connection: getConnectionInfo(),

            // UTM parameters
            utm: getUTMParameters(),

            // Behavioral data
            behavior: {
                maxScrollDepth: maxScrollDepth,
                timeOnPage: timeOnPage,
                clicks: interactions.clicks,
                mouseMovements: interactions.mouseMovements,
                keyPresses: interactions.keyPresses,
                touches: interactions.touches
            },

            // Performance metrics
            performance: getPerformanceMetrics(),

            // Browser features
            features: {
                localStorage: typeof(Storage) !== "undefined",
                sessionStorage: typeof(Storage) !== "undefined",
                serviceWorker: 'serviceWorker' in navigator,
                geolocation: 'geolocation' in navigator,
                touchEvents: 'ontouchstart' in window
            },

            // Timestamp
            timestamp: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

            // Is this a page exit?
            isPageExit: isPageExit || false
        };
    }

    // Send data to backend
    async function sendVisitorData(data) {
        try {
            const response = await fetch('/api/track-visitor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                keepalive: true  // Ensures the request completes even if page is closing
            });

            if (!response.ok) {
                console.error('Failed to send visitor data:', response.statusText);
            }
        } catch (error) {
            console.error('Error sending visitor data:', error);
        }
    }

    // Track page view on load
    function trackPageView() {
        // Wait for page to be fully loaded
        if (document.readyState === 'complete') {
            setTimeout(function() {
                const visitorData = collectVisitorData(false);
                sendVisitorData(visitorData);

                // Add current page to session
                sessionPages.push(window.location.pathname);
                sessionStorage.setItem('townranker_session_pages', JSON.stringify(sessionPages));
            }, 1000); // Small delay to let performance metrics settle
        } else {
            window.addEventListener('load', trackPageView);
        }
    }

    // Start tracking - only initial page view
    // Exit and visibility tracking removed to reduce Slack notification noise
    // Now sends only 1 notification per visit
    trackPageView();

})();
