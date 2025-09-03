/**
 * API Caching and Request Optimization for TownRanker
 * Implements caching, request deduplication, and efficient API calls
 */

// Utility function for debouncing
function debounce(func, delay, immediate = false) {
    let timeoutId;
    return function executedFunction(...args) {
        const later = () => {
            timeoutId = null;
            if (!immediate) func(...args);
        };
        const callNow = immediate && !timeoutId;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(later, delay);
        if (callNow) func(...args);
    };
}

class APICache {
    constructor() {
        this.cache = new Map();
        this.pendingRequests = new Map();
        this.defaultTTL = 5 * 60 * 1000; // 5 minutes
        this.maxCacheSize = 50;
    }
    
    // Generate cache key from URL and options
    generateKey(url, options = {}) {
        const method = options.method || 'GET';
        const body = options.body || '';
        return `${method}:${url}:${body}`;
    }
    
    // Check if cache entry is valid
    isValid(entry) {
        return Date.now() - entry.timestamp < entry.ttl;
    }
    
    // Clean expired entries
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp >= entry.ttl) {
                this.cache.delete(key);
            }
        }
        
        // Ensure cache doesn't exceed max size
        if (this.cache.size > this.maxCacheSize) {
            const entries = Array.from(this.cache.entries());
            // Remove oldest entries
            const toRemove = entries
                .sort((a, b) => a[1].timestamp - b[1].timestamp)
                .slice(0, this.cache.size - this.maxCacheSize);
            
            toRemove.forEach(([key]) => this.cache.delete(key));
        }
    }
    
    // Get cached response
    get(url, options = {}) {
        const key = this.generateKey(url, options);
        const entry = this.cache.get(key);
        
        if (entry && this.isValid(entry)) {
            return Promise.resolve(entry.data.clone());
        }
        
        return null;
    }
    
    // Set cached response
    set(url, options = {}, response, ttl = this.defaultTTL) {
        const key = this.generateKey(url, options);
        
        // Clone response for caching
        const clonedResponse = response.clone();
        
        this.cache.set(key, {
            data: clonedResponse,
            timestamp: Date.now(),
            ttl: ttl
        });
        
        this.cleanup();
    }
    
    // Clear specific cache entry
    invalidate(url, options = {}) {
        const key = this.generateKey(url, options);
        this.cache.delete(key);
    }
    
    // Clear all cache
    clear() {
        this.cache.clear();
        this.pendingRequests.clear();
    }
    
    // Cached fetch with request deduplication
    async fetch(url, options = {}) {
        const key = this.generateKey(url, options);
        
        // Check cache first
        const cached = this.get(url, options);
        if (cached) {
            console.log(`Cache hit for: ${url}`);
            return cached;
        }
        
        // Check if request is already pending
        if (this.pendingRequests.has(key)) {
            console.log(`Request deduplication for: ${url}`);
            return this.pendingRequests.get(key);
        }
        
        // Make new request
        console.log(`Making new request for: ${url}`);
        const requestPromise = fetch(url, options)
            .then(response => {
                // Only cache successful responses
                if (response.ok) {
                    // Determine TTL based on endpoint
                    let ttl = this.defaultTTL;
                    if (url.includes('/leads')) {
                        ttl = 2 * 60 * 1000; // 2 minutes for leads
                    } else if (url.includes('/customers')) {
                        ttl = 10 * 60 * 1000; // 10 minutes for customers
                    } else if (url.includes('/projects')) {
                        ttl = 5 * 60 * 1000; // 5 minutes for projects
                    }
                    
                    this.set(url, options, response, ttl);
                }
                
                this.pendingRequests.delete(key);
                return response;
            })
            .catch(error => {
                this.pendingRequests.delete(key);
                throw error;
            });
        
        this.pendingRequests.set(key, requestPromise);
        return requestPromise;
    }
}

// Global API cache instance
const apiCache = new APICache();

// Debounced search function
const debouncedSearch = debounce(async (query, callback) => {
    try {
        const response = await apiCache.fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        callback(data);
    } catch (error) {
        console.error('Search error:', error);
        callback({ error: 'Search failed' });
    }
}, 300);

// Optimized data fetching functions
const optimizedAPI = {
    // Fetch leads with caching
    async getLeads(filters = {}) {
        const queryString = new URLSearchParams(filters).toString();
        const url = `/api/leads${queryString ? '?' + queryString : ''}`;
        
        try {
            const response = await apiCache.fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Error fetching leads:', error);
            throw error;
        }
    },
    
    // Fetch customers with caching
    async getCustomers(page = 1, limit = 20) {
        const url = `/api/customers?page=${page}&limit=${limit}`;
        
        try {
            const response = await apiCache.fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Error fetching customers:', error);
            throw error;
        }
    },
    
    // Fetch customer details with caching
    async getCustomer(id) {
        const url = `/api/customers/${id}`;
        
        try {
            const response = await apiCache.fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Error fetching customer:', error);
            throw error;
        }
    },
    
    // Update customer (invalidates cache)
    async updateCustomer(id, data) {
        try {
            const response = await fetch(`/api/customers/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                // Invalidate related cache entries
                apiCache.invalidate(`/api/customers/${id}`);
                apiCache.invalidate('/api/customers');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error updating customer:', error);
            throw error;
        }
    },
    
    // Create lead (invalidates cache)
    async createLead(data) {
        try {
            const response = await fetch('/api/leads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                // Invalidate leads cache
                apiCache.invalidate('/api/leads');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error creating lead:', error);
            throw error;
        }
    },
    
    // Batch operations with caching
    async batchOperation(operations) {
        try {
            const response = await fetch('/api/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ operations })
            });
            
            if (response.ok) {
                // Clear entire cache after batch operations
                apiCache.clear();
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error with batch operation:', error);
            throw error;
        }
    }
};

// Request retry mechanism with exponential backoff
class RetryMechanism {
    constructor(maxRetries = 3, baseDelay = 1000) {
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay;
    }
    
    async execute(fn, retries = 0) {
        try {
            return await fn();
        } catch (error) {
            if (retries < this.maxRetries) {
                const delay = this.baseDelay * Math.pow(2, retries);
                console.log(`Retrying request in ${delay}ms (attempt ${retries + 1}/${this.maxRetries})`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.execute(fn, retries + 1);
            }
            
            throw error;
        }
    }
}

const retryMechanism = new RetryMechanism();

// Optimized fetch with retry
async function fetchWithRetry(url, options = {}) {
    return retryMechanism.execute(() => apiCache.fetch(url, options));
}

// Periodic cache cleanup
setInterval(() => {
    apiCache.cleanup();
}, 60000); // Cleanup every minute

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        APICache,
        apiCache,
        optimizedAPI,
        debouncedSearch,
        fetchWithRetry,
        RetryMechanism
    };
}

// Make available globally
if (typeof window !== 'undefined') {
    window.apiCache = apiCache;
    window.optimizedAPI = optimizedAPI;
    window.debouncedSearch = debouncedSearch;
    window.fetchWithRetry = fetchWithRetry;
}