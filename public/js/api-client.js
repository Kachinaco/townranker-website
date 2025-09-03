/**
 * TownRanker API Client
 * Centralized API communication module
 */

class TownRankerAPI {
    constructor() {
        this.baseUrl = '';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    async request(url, options = {}) {
        const authToken = localStorage.getItem('adminToken');
        
        if (!authToken) {
            throw new Error('No authentication token found');
        }

        const config = {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, config);

        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            throw new Error('Authentication failed. Please login again.');
        }

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    // Cache management
    getCacheKey(url, params) {
        return `${url}_${JSON.stringify(params || {})}`;
    }

    getFromCache(cacheKey) {
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCache(cacheKey, data) {
        this.cache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }

    // Leads API
    async getLeads(params = {}) {
        const cacheKey = this.getCacheKey('/api/leads', params);
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            console.log('📦 Using cached leads data');
            return cached;
        }

        const queryParams = new URLSearchParams(params).toString();
        const url = `/api/leads${queryParams ? '?' + queryParams : ''}`;
        
        const data = await this.request(url);
        this.setCache(cacheKey, data);
        
        return data;
    }

    async getLead(leadId) {
        const cacheKey = this.getCacheKey(`/api/leads/${leadId}`);
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            console.log('📦 Using cached lead data');
            return cached;
        }

        const data = await this.request(`/api/leads/${leadId}`);
        this.setCache(cacheKey, data);
        
        return data;
    }

    async createLead(leadData) {
        const data = await this.request('/api/leads', {
            method: 'POST',
            body: leadData
        });
        
        // Clear cache after creating
        this.clearCache();
        
        return data;
    }

    async updateLead(leadId, leadData) {
        const data = await this.request(`/api/leads/${leadId}`, {
            method: 'PUT',
            body: leadData
        });
        
        // Clear cache after updating
        this.clearCache();
        
        return data;
    }

    async deleteLead(leadId) {
        const data = await this.request(`/api/leads/${leadId}`, {
            method: 'DELETE'
        });
        
        // Clear cache after deleting
        this.clearCache();
        
        return data;
    }

    // Communications API
    async getCommunications(customerId) {
        const cacheKey = this.getCacheKey(`/api/communications/${customerId}`);
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            return cached;
        }

        const data = await this.request(`/api/communications/${customerId}`);
        this.setCache(cacheKey, data);
        
        return data;
    }

    async sendMessage(customerId, messageData) {
        const data = await this.request('/api/send-message', {
            method: 'POST',
            body: {
                customerId,
                ...messageData
            }
        });
        
        // Clear communications cache
        this.cache.forEach((value, key) => {
            if (key.includes('/api/communications/')) {
                this.cache.delete(key);
            }
        });
        
        return data;
    }

    // Notifications API
    async getNotifications() {
        return this.request('/api/notifications');
    }

    async markNotificationAsRead(notificationId) {
        return this.request(`/api/notifications/${notificationId}/read`, {
            method: 'PUT'
        });
    }

    // Calendar API
    async getCalendarEvents() {
        return this.request('/api/calendar/events');
    }

    async createCalendarEvent(eventData) {
        return this.request('/api/calendar/events', {
            method: 'POST',
            body: eventData
        });
    }

    // Dashboard stats
    async getDashboardStats() {
        const cacheKey = this.getCacheKey('/api/dashboard/stats');
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            return cached;
        }

        const data = await this.request('/api/dashboard/stats');
        this.setCache(cacheKey, data);
        
        return data;
    }

    // Authentication
    async login(credentials) {
        const data = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(credentials)
        });

        return data.json();
    }

    async logout() {
        try {
            await this.request('/api/auth/logout', {
                method: 'POST'
            });
        } catch (error) {
            console.warn('Logout request failed:', error);
        }
        
        localStorage.removeItem('adminToken');
        this.clearCache();
    }

    async validateToken() {
        try {
            return await this.request('/api/auth/validate');
        } catch (error) {
            localStorage.removeItem('adminToken');
            throw error;
        }
    }
}

// Create and export singleton instance
const api = new TownRankerAPI();

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TownRankerAPI, api };
} else {
    window.TownRankerAPI = TownRankerAPI;
    window.api = api;
}