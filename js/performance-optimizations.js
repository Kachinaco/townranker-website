/**
 * Performance Optimization Utilities for TownRanker Dashboard
 * Provides debouncing, throttling, and efficient DOM operations
 */

// Debounce utility function
function debounce(func, delay, immediate = false) {
    let timeoutId;
    return function executedFunction(...args) {
        const callNow = immediate && !timeoutId;
        
        clearTimeout(timeoutId);
        
        timeoutId = setTimeout(() => {
            timeoutId = null;
            if (!immediate) func.apply(this, args);
        }, delay);
        
        if (callNow) func.apply(this, args);
    };
}

// Throttle utility function
function throttle(func, delay) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, delay);
        }
    };
}

// Efficient DOM element cache
class DOMCache {
    constructor() {
        this.cache = new Map();
    }
    
    get(selector) {
        if (!this.cache.has(selector)) {
            const element = document.querySelector(selector);
            if (element) {
                this.cache.set(selector, element);
            }
        }
        return this.cache.get(selector);
    }
    
    getAll(selector) {
        const cacheKey = `all:${selector}`;
        if (!this.cache.has(cacheKey)) {
            const elements = document.querySelectorAll(selector);
            this.cache.set(cacheKey, elements);
        }
        return this.cache.get(cacheKey);
    }
    
    clear() {
        this.cache.clear();
    }
    
    invalidate(selector) {
        this.cache.delete(selector);
        this.cache.delete(`all:${selector}`);
    }
}

// Global DOM cache instance
const domCache = new DOMCache();

// Optimized scroll handler
const optimizedScrollHandler = throttle(function() {
    const currentScroll = window.pageYOffset;
    const navbar = domCache.get('.navbar');
    
    if (navbar) {
        requestAnimationFrame(() => {
            if (currentScroll > 100) {
                navbar.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                navbar.style.background = 'rgba(255, 255, 255, 0.98)';
            } else {
                navbar.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            }
        });
    }
}, 16); // ~60fps

// Optimized form submission with debouncing
const optimizedFormSubmission = debounce(async function(formData, submitBtn, originalText) {
    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            submitBtn.textContent = 'Success! We\'ll be in touch soon.';
            submitBtn.style.background = '#10b981';
            
            // Reset button after 3 seconds
            setTimeout(() => {
                submitBtn.textContent = originalText;
                submitBtn.style.background = '';
                submitBtn.disabled = false;
            }, 3000);
        } else {
            throw new Error('Failed to submit form');
        }
    } catch (error) {
        console.error('Form submission error:', error);
        submitBtn.textContent = 'Error! Please try again.';
        submitBtn.style.background = '#ef4444';
        
        setTimeout(() => {
            submitBtn.textContent = originalText;
            submitBtn.style.background = '';
            submitBtn.disabled = false;
        }, 3000);
    }
}, 300);

// Intersection Observer for lazy loading and animations
const intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const element = entry.target;
            
            // Handle lazy loading images
            if (element.tagName === 'IMG' && element.dataset.src) {
                element.src = element.dataset.src;
                element.classList.remove('lazy');
            }
            
            // Handle animations
            if (element.classList.contains('animate-on-scroll')) {
                requestAnimationFrame(() => {
                    element.style.opacity = '1';
                    element.style.transform = 'translateY(0)';
                });
            }
            
            intersectionObserver.unobserve(element);
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
});

// Efficient event delegation
function setupEventDelegation() {
    document.addEventListener('click', function(e) {
        const target = e.target;
        
        // Handle service card clicks
        if (target.closest('.service-card')) {
            const card = target.closest('.service-card');
            if (!card.classList.contains('processing')) {
                card.classList.add('processing');
                requestAnimationFrame(() => {
                    card.style.transform = 'translateY(-5px) scale(1.02)';
                    setTimeout(() => {
                        card.style.transform = '';
                        card.classList.remove('processing');
                    }, 200);
                });
            }
        }
        
        // Handle mobile menu toggle
        if (target.closest('.mobile-toggle')) {
            e.preventDefault();
            const toggle = target.closest('.mobile-toggle');
            const navMenu = domCache.get('.nav-menu');
            
            if (navMenu) {
                navMenu.classList.toggle('active');
                
                requestAnimationFrame(() => {
                    const spans = toggle.querySelectorAll('span');
                    const isActive = navMenu.classList.contains('active');
                    
                    spans[0].style.transform = isActive ? 'rotate(45deg) translateY(8px)' : '';
                    spans[1].style.opacity = isActive ? '0' : '1';
                    spans[2].style.transform = isActive ? 'rotate(-45deg) translateY(-8px)' : '';
                });
            }
        }
        
        // Handle anchor links with smooth scrolling
        if (target.matches('a[href^="#"]')) {
            e.preventDefault();
            const targetElement = domCache.get(target.getAttribute('href'));
            
            if (targetElement) {
                const offsetTop = targetElement.offsetTop - 80;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
                
                // Close mobile menu if open
                const navMenu = domCache.get('.nav-menu');
                if (navMenu && navMenu.classList.contains('active')) {
                    navMenu.classList.remove('active');
                }
            }
        }
    });
}

// Memory leak prevention utilities
class MemoryManager {
    constructor() {
        this.intervals = new Set();
        this.timeouts = new Set();
        this.eventListeners = new Set();
        this.observers = new Set();
    }
    
    addInterval(id) {
        this.intervals.add(id);
    }
    
    addTimeout(id) {
        this.timeouts.add(id);
    }
    
    addEventListener(element, event, handler, options) {
        element.addEventListener(event, handler, options);
        this.eventListeners.add({ element, event, handler, options });
    }
    
    addObserver(observer) {
        this.observers.add(observer);
    }
    
    cleanup() {
        // Clear intervals
        this.intervals.forEach(id => clearInterval(id));
        this.intervals.clear();
        
        // Clear timeouts
        this.timeouts.forEach(id => clearTimeout(id));
        this.timeouts.clear();
        
        // Remove event listeners
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            element.removeEventListener(event, handler, options);
        });
        this.eventListeners.clear();
        
        // Disconnect observers
        this.observers.forEach(observer => {
            if (typeof observer.disconnect === 'function') {
                observer.disconnect();
            }
        });
        this.observers.clear();
        
        // Clear DOM cache
        domCache.clear();
    }
}

// Global memory manager instance
const memoryManager = new MemoryManager();

// Initialize performance optimizations
function initializePerformanceOptimizations() {
    // Setup event delegation
    setupEventDelegation();
    
    // Setup optimized scroll handler
    memoryManager.addEventListener(window, 'scroll', optimizedScrollHandler);
    
    // Setup intersection observers for animations and lazy loading
    const animatedElements = domCache.getAll('.service-card, .result-card, .pricing-card, .about-features .feature');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s ease-out';
        el.classList.add('animate-on-scroll');
        intersectionObserver.observe(el);
    });
    
    // Setup lazy loading for images
    const lazyImages = domCache.getAll('img[data-src]');
    lazyImages.forEach(img => {
        img.classList.add('lazy');
        intersectionObserver.observe(img);
    });
    
    memoryManager.addObserver(intersectionObserver);
    
    // Setup form optimizations
    const contactForm = domCache.get('#contactForm');
    if (contactForm) {
        memoryManager.addEventListener(contactForm, 'submit', function(e) {
            e.preventDefault();
            
            const formData = {
                name: domCache.get('#name').value,
                email: domCache.get('#email').value,
                phone: domCache.get('#phone').value,
                service: domCache.get('#service').value,
                message: domCache.get('#message').value
            };
            
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;
            
            optimizedFormSubmission(formData, submitBtn, originalText);
        });
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    memoryManager.cleanup();
});

// Export utilities for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        debounce,
        throttle,
        DOMCache,
        domCache,
        MemoryManager,
        memoryManager,
        initializePerformanceOptimizations
    };
}

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePerformanceOptimizations);
} else {
    initializePerformanceOptimizations();
}