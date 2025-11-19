// SEO Monitoring Script for TownRanker
// This script tracks SEO performance and user engagement

(function() {
    'use strict';

    // Initialize SEO monitoring
    console.log('TownRanker SEO Monitor initialized');

    // Track page views
    const trackPageView = () => {
        const pageData = {
            url: window.location.href,
            title: document.title,
            referrer: document.referrer,
            timestamp: new Date().toISOString()
        };

        // Log page view (can be extended to send to analytics)
        console.log('Page view tracked:', pageData);
    };

    // Track link clicks
    const trackLinkClicks = () => {
        document.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function() {
                console.log('Link clicked:', this.href);
            });
        });
    };

    // Monitor page performance
    const trackPerformance = () => {
        if ('performance' in window) {
            window.addEventListener('load', () => {
                setTimeout(() => {
                    const perfData = performance.getEntriesByType('navigation')[0];
                    if (perfData) {
                        console.log('Page load time:', perfData.loadEventEnd - perfData.fetchStart, 'ms');
                    }
                }, 0);
            });
        }
    };

    // Initialize all tracking
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            trackPageView();
            trackLinkClicks();
            trackPerformance();
        });
    } else {
        trackPageView();
        trackLinkClicks();
        trackPerformance();
    }

})();
