/**
 * DOM Utilities
 * Common DOM manipulation functions used across the application
 */

class DOMUtil {
    static getElementById(id) {
        return document.getElementById(id);
    }

    static querySelector(selector) {
        return document.querySelector(selector);
    }

    static querySelectorAll(selector) {
        return document.querySelectorAll(selector);
    }

    static createElement(tag, options = {}) {
        const element = document.createElement(tag);
        
        if (options.className) {
            element.className = options.className;
        }
        
        if (options.id) {
            element.id = options.id;
        }
        
        if (options.innerHTML) {
            element.innerHTML = options.innerHTML;
        }
        
        if (options.textContent) {
            element.textContent = options.textContent;
        }
        
        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        
        if (options.styles) {
            Object.entries(options.styles).forEach(([key, value]) => {
                element.style[key] = value;
            });
        }
        
        return element;
    }

    static show(element) {
        if (typeof element === 'string') {
            element = this.getElementById(element);
        }
        
        if (element) {
            element.style.display = 'block';
            element.style.visibility = 'visible';
            element.style.opacity = '1';
        }
    }

    static hide(element) {
        if (typeof element === 'string') {
            element = this.getElementById(element);
        }
        
        if (element) {
            element.style.display = 'none';
            element.style.visibility = 'hidden';
            element.style.opacity = '0';
        }
    }

    static toggle(element) {
        if (typeof element === 'string') {
            element = this.getElementById(element);
        }
        
        if (element) {
            if (element.style.display === 'none' || !element.style.display) {
                this.show(element);
            } else {
                this.hide(element);
            }
        }
    }

    static addClass(element, className) {
        if (typeof element === 'string') {
            element = this.getElementById(element);
        }
        
        if (element) {
            element.classList.add(className);
        }
    }

    static removeClass(element, className) {
        if (typeof element === 'string') {
            element = this.getElementById(element);
        }
        
        if (element) {
            element.classList.remove(className);
        }
    }

    static hasClass(element, className) {
        if (typeof element === 'string') {
            element = this.getElementById(element);
        }
        
        return element ? element.classList.contains(className) : false;
    }

    static setContent(element, content) {
        if (typeof element === 'string') {
            element = this.getElementById(element);
        }
        
        if (element) {
            element.innerHTML = content;
        }
    }

    static setTextContent(element, content) {
        if (typeof element === 'string') {
            element = this.getElementById(element);
        }
        
        if (element) {
            element.textContent = content;
        }
    }

    static addEventListener(element, event, handler) {
        if (typeof element === 'string') {
            element = this.getElementById(element);
        }
        
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    static formatCurrency(amount) {
        return `$${(amount || 0).toLocaleString()}`;
    }

    static formatDate(date) {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString();
    }

    static createStatusBadge(status) {
        const statusColors = {
            'new': '#fbbf24',
            'lead': '#fbbf24',
            'qualified': '#10b981',
            'proposal': '#3b82f6',
            'closed': '#6b7280',
            'won': '#059669',
            'lost': '#dc2626'
        };
        
        const color = statusColors[status] || '#fbbf24';
        
        return this.createElement('span', {
            textContent: status.replace('-', ' '),
            styles: {
                background: color,
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                textTransform: 'capitalize'
            }
        });
    }

    static createProjectTypeBadge(projectType) {
        return this.createElement('span', {
            textContent: projectType || 'N/A',
            styles: {
                background: '#e0e7ff',
                color: '#3730a3',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px'
            }
        });
    }
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOMUtil;
} else {
    window.DOMUtil = DOMUtil;
}