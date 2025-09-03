/**
 * Authentication Utilities
 * Common authentication functions used across the application
 */

class AuthUtil {
    static getAuthToken() {
        return localStorage.getItem('adminToken');
    }

    static isAuthenticated() {
        const token = this.getAuthToken();
        return token !== null && token !== undefined && token !== '';
    }

    static setAuthToken(token) {
        localStorage.setItem('adminToken', token);
    }

    static removeAuthToken() {
        localStorage.removeItem('adminToken');
    }

    static getAuthHeaders() {
        const token = this.getAuthToken();
        if (!token) {
            throw new Error('No authentication token found');
        }
        
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    static async makeAuthenticatedRequest(url, options = {}) {
        try {
            const headers = this.getAuthHeaders();
            
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...headers,
                    ...options.headers
                }
            });

            if (response.status === 401) {
                this.removeAuthToken();
                throw new Error('Authentication failed. Please login again.');
            }

            return response;
        } catch (error) {
            if (error.message.includes('No authentication token')) {
                console.error('❌ No auth token found');
                throw error;
            }
            throw error;
        }
    }

    static async apiGet(url) {
        const response = await this.makeAuthenticatedRequest(url);
        return response.json();
    }

    static async apiPost(url, data) {
        const response = await this.makeAuthenticatedRequest(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return response.json();
    }

    static async apiPut(url, data) {
        const response = await this.makeAuthenticatedRequest(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        return response.json();
    }

    static async apiDelete(url) {
        const response = await this.makeAuthenticatedRequest(url, {
            method: 'DELETE'
        });
        return response.json();
    }
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthUtil;
} else {
    window.AuthUtil = AuthUtil;
}