(function() {
    const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';
    
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
    
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID);
    
    const trackEvent = (action, category, label, value) => {
        if (typeof gtag !== 'undefined') {
            gtag('event', action, {
                'event_category': category,
                'event_label': label,
                'value': value
            });
        }
    };
    
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach(link => {
            link.addEventListener('click', function() {
                const type = this.href.startsWith('tel:') ? 'Phone' : 'Email';
                trackEvent('click', 'Contact', type);
            });
        });
        
        document.querySelectorAll('.btn-primary').forEach(button => {
            button.addEventListener('click', function() {
                trackEvent('click', 'CTA', this.textContent);
            });
        });
        
        const contactForm = document.getElementById('contactForm');
        if (contactForm) {
            contactForm.addEventListener('submit', function() {
                trackEvent('submit', 'Form', 'Contact Form');
            });
        }
        
        const newsletterForm = document.getElementById('newsletterForm');
        if (newsletterForm) {
            newsletterForm.addEventListener('submit', function() {
                trackEvent('submit', 'Form', 'Newsletter Signup');
            });
        }
        
        let scrollDepth = 0;
        window.addEventListener('scroll', function() {
            const currentScrollDepth = Math.round((window.scrollY + window.innerHeight) / document.body.scrollHeight * 100);
            
            if (currentScrollDepth >= 25 && scrollDepth < 25) {
                scrollDepth = 25;
                trackEvent('scroll', 'Engagement', '25%');
            } else if (currentScrollDepth >= 50 && scrollDepth < 50) {
                scrollDepth = 50;
                trackEvent('scroll', 'Engagement', '50%');
            } else if (currentScrollDepth >= 75 && scrollDepth < 75) {
                scrollDepth = 75;
                trackEvent('scroll', 'Engagement', '75%');
            } else if (currentScrollDepth >= 90 && scrollDepth < 90) {
                scrollDepth = 90;
                trackEvent('scroll', 'Engagement', '90%');
            }
        });
        
        let timeOnPage = 0;
        setInterval(() => {
            timeOnPage += 10;
            if (timeOnPage === 30) {
                trackEvent('time_on_page', 'Engagement', '30 seconds');
            } else if (timeOnPage === 60) {
                trackEvent('time_on_page', 'Engagement', '1 minute');
            } else if (timeOnPage === 180) {
                trackEvent('time_on_page', 'Engagement', '3 minutes');
            }
        }, 10000);
    });
    
    if ('fbq' in window) {
        fbq('init', 'YOUR_PIXEL_ID');
        fbq('track', 'PageView');
    }
    
    window.trackConversion = function(type, value) {
        trackEvent('conversion', 'Business', type, value);
        
        if ('fbq' in window) {
            fbq('track', 'Lead', {
                value: value,
                currency: 'USD'
            });
        }
    };
})();