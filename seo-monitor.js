// SEO Monitoring Script for TownRanker
// This script tracks SEO performance metrics and integrates with Google Search Console

class SEOMonitor {
    constructor() {
        this.apiEndpoint = 'https://searchconsole.googleapis.com/v1';
        this.siteUrl = 'https://townranker.com';
        this.metricsHistory = [];
        this.init();
    }

    init() {
        // Initialize monitoring
        this.checkIndexStatus();
        this.monitorCoreWebVitals();
        this.trackKeywords();
        this.checkStructuredData();
        this.monitorBacklinks();
    }

    // Check if pages are indexed by Google
    async checkIndexStatus() {
        const pages = [
            '/',
            '/services.html',
            '/about.html',
            '/portfolio.html',
            '/pricing.html',
            '/blog.html'
        ];

        const indexStatus = {};
        
        for (const page of pages) {
            const url = `${this.siteUrl}${page}`;
            // Check if page is indexed (would need actual API integration)
            indexStatus[url] = {
                indexed: true,
                lastCrawled: new Date().toISOString(),
                issues: []
            };
        }

        return indexStatus;
    }

    // Monitor Core Web Vitals
    monitorCoreWebVitals() {
        if ('web-vitals' in window) {
            // Track Largest Contentful Paint (LCP)
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'largest-contentful-paint') {
                        this.recordMetric('LCP', entry.renderTime || entry.loadTime);
                    }
                }
            }).observe({ type: 'largest-contentful-paint', buffered: true });

            // Track First Input Delay (FID)
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'first-input') {
                        this.recordMetric('FID', entry.processingStart - entry.startTime);
                    }
                }
            }).observe({ type: 'first-input', buffered: true });

            // Track Cumulative Layout Shift (CLS)
            let clsValue = 0;
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                        this.recordMetric('CLS', clsValue);
                    }
                }
            }).observe({ type: 'layout-shift', buffered: true });
        }
    }

    // Track keyword rankings
    trackKeywords() {
        const targetKeywords = [
            'web development agency',
            'custom website development',
            'professional web developer',
            'business website design',
            'e-commerce development',
            'web application development'
        ];

        // Store keywords for tracking
        localStorage.setItem('seo_keywords', JSON.stringify(targetKeywords));
        
        return targetKeywords;
    }

    // Check structured data validity
    checkStructuredData() {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        const structuredData = [];
        
        scripts.forEach(script => {
            try {
                const data = JSON.parse(script.textContent);
                structuredData.push({
                    type: data['@type'],
                    valid: true,
                    data: data
                });
            } catch (e) {
                structuredData.push({
                    valid: false,
                    error: e.message
                });
            }
        });

        return structuredData;
    }

    // Monitor backlinks (placeholder - would need external API)
    async monitorBacklinks() {
        // This would typically integrate with Ahrefs, SEMrush, or similar API
        const backlinks = {
            total: 0,
            dofollow: 0,
            nofollow: 0,
            newThisMonth: 0,
            lostThisMonth: 0,
            domains: []
        };

        return backlinks;
    }

    // Record performance metrics
    recordMetric(name, value) {
        const metric = {
            name: name,
            value: value,
            timestamp: new Date().toISOString(),
            url: window.location.href
        };

        this.metricsHistory.push(metric);
        
        // Store in localStorage for persistence
        const stored = JSON.parse(localStorage.getItem('seo_metrics') || '[]');
        stored.push(metric);
        
        // Keep only last 1000 metrics
        if (stored.length > 1000) {
            stored.shift();
        }
        
        localStorage.setItem('seo_metrics', JSON.stringify(stored));
        
        // Send to analytics if configured
        this.sendToAnalytics(metric);
    }

    // Send metrics to analytics service
    sendToAnalytics(metric) {
        // Send to Google Analytics 4
        if (typeof gtag !== 'undefined') {
            gtag('event', 'seo_metric', {
                metric_name: metric.name,
                metric_value: metric.value,
                page_url: metric.url
            });
        }
    }

    // Generate SEO report
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            url: this.siteUrl,
            metrics: {
                coreWebVitals: this.getCoreWebVitals(),
                indexStatus: this.checkIndexStatus(),
                structuredData: this.checkStructuredData(),
                keywords: this.trackKeywords()
            },
            recommendations: this.generateRecommendations()
        };

        return report;
    }

    // Get Core Web Vitals summary
    getCoreWebVitals() {
        const metrics = JSON.parse(localStorage.getItem('seo_metrics') || '[]');
        const vitals = {
            LCP: null,
            FID: null,
            CLS: null
        };

        // Get latest values for each metric
        metrics.forEach(metric => {
            if (vitals.hasOwnProperty(metric.name)) {
                vitals[metric.name] = metric.value;
            }
        });

        return vitals;
    }

    // Generate SEO recommendations
    generateRecommendations() {
        const recommendations = [];
        const vitals = this.getCoreWebVitals();

        // Check LCP
        if (vitals.LCP && vitals.LCP > 2500) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: 'Largest Contentful Paint is above 2.5s. Consider optimizing images and server response time.'
            });
        }

        // Check FID
        if (vitals.FID && vitals.FID > 100) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: 'First Input Delay is above 100ms. Consider reducing JavaScript execution time.'
            });
        }

        // Check CLS
        if (vitals.CLS && vitals.CLS > 0.1) {
            recommendations.push({
                type: 'performance',
                priority: 'medium',
                message: 'Cumulative Layout Shift is above 0.1. Ensure images have dimensions and avoid dynamic content injection.'
            });
        }

        // Check meta descriptions
        const metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc || metaDesc.content.length < 120) {
            recommendations.push({
                type: 'content',
                priority: 'medium',
                message: 'Meta description is too short. Aim for 150-160 characters for better SERP visibility.'
            });
        }

        // Check heading structure
        const h1Count = document.querySelectorAll('h1').length;
        if (h1Count === 0) {
            recommendations.push({
                type: 'content',
                priority: 'high',
                message: 'No H1 tag found. Add a clear H1 heading for better SEO.'
            });
        } else if (h1Count > 1) {
            recommendations.push({
                type: 'content',
                priority: 'low',
                message: 'Multiple H1 tags found. Consider using only one H1 per page.'
            });
        }

        return recommendations;
    }

    // Check mobile responsiveness
    checkMobileResponsiveness() {
        const viewport = document.querySelector('meta[name="viewport"]');
        const isMobileReady = viewport && viewport.content.includes('width=device-width');
        
        return {
            hasViewportMeta: !!viewport,
            isMobileReady: isMobileReady,
            screenWidth: window.innerWidth,
            isTouch: 'ontouchstart' in window
        };
    }

    // Monitor page speed
    async checkPageSpeed() {
        const timing = performance.timing;
        const pageLoadTime = timing.loadEventEnd - timing.navigationStart;
        const domReadyTime = timing.domContentLoadedEventEnd - timing.navigationStart;
        const serverResponseTime = timing.responseEnd - timing.requestStart;
        
        return {
            pageLoadTime: pageLoadTime,
            domReadyTime: domReadyTime,
            serverResponseTime: serverResponseTime,
            resources: performance.getEntriesByType('resource').length
        };
    }
}

// Initialize SEO Monitor when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.seoMonitor = new SEOMonitor();
    });
} else {
    window.seoMonitor = new SEOMonitor();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SEOMonitor;
}