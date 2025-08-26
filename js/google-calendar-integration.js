/**
 * Enhanced Google Calendar Integration for TownRanker Admin Dashboard
 * Features: Event creation, listing, updating, and client appointment scheduling
 */

class GoogleCalendarManager {
    constructor() {
        this.API_KEY = '';
        this.CLIENT_ID = '';
        this.DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
        this.SCOPES = 'https://www.googleapis.com/auth/calendar';
        this.isAuthenticated = false;
        this.gapiInitialized = false;
        this.events = [];
        this.currentCalendarId = 'primary';
    }

    // Initialize the Google Calendar API
    async init() {
        try {
            console.log('🗓️ Initializing Google Calendar Manager...');
            
            // Load API credentials from server
            await this.loadCredentials();
            
            if (!this.API_KEY || !this.CLIENT_ID) {
                console.log('⚠️ Google Calendar API credentials not configured');
                return false;
            }

            // Initialize GAPI
            await this.initGapi();
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Google Calendar:', error);
            return false;
        }
    }

    // Load credentials from server
    async loadCredentials() {
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch('/api/google-calendar-config', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const config = await response.json();
                this.API_KEY = config.apiKey;
                this.CLIENT_ID = config.clientId;
                console.log('✅ Google Calendar API credentials loaded');
                return true;
            }
        } catch (error) {
            console.error('❌ Failed to load credentials:', error);
        }
        return false;
    }

    // Initialize Google API
    async initGapi() {
        return new Promise((resolve, reject) => {
            if (typeof gapi === 'undefined') {
                reject(new Error('Google API not loaded'));
                return;
            }

            gapi.load('client:auth2', async () => {
                try {
                    await gapi.client.init({
                        apiKey: this.API_KEY,
                        clientId: this.CLIENT_ID,
                        discoveryDocs: [this.DISCOVERY_DOC],
                        scope: this.SCOPES
                    });

                    this.gapiInitialized = true;
                    this.isAuthenticated = gapi.auth2.getAuthInstance().isSignedIn.get();
                    
                    console.log('✅ Google API initialized');
                    resolve();
                } catch (error) {
                    console.error('❌ GAPI initialization failed:', error);
                    reject(error);
                }
            });
        });
    }

    // Authenticate with Google
    async authenticate() {
        if (!this.gapiInitialized) {
            throw new Error('Google API not initialized');
        }

        try {
            const authInstance = gapi.auth2.getAuthInstance();
            
            if (!this.isAuthenticated) {
                await authInstance.signIn();
                this.isAuthenticated = true;
                console.log('✅ Google Calendar authenticated');
            }
            
            return this.isAuthenticated;
        } catch (error) {
            console.error('❌ Authentication failed:', error);
            throw error;
        }
    }

    // Sign out
    async signOut() {
        if (this.gapiInitialized && this.isAuthenticated) {
            const authInstance = gapi.auth2.getAuthInstance();
            await authInstance.signOut();
            this.isAuthenticated = false;
            console.log('✅ Google Calendar signed out');
        }
    }

    // Create a new calendar event
    async createEvent(eventData) {
        if (!this.isAuthenticated) {
            await this.authenticate();
        }

        try {
            const event = {
                summary: eventData.title,
                description: eventData.description || '',
                location: eventData.location || '',
                start: {
                    dateTime: new Date(eventData.start).toISOString(),
                    timeZone: 'America/New_York'
                },
                end: {
                    dateTime: new Date(eventData.end).toISOString(),
                    timeZone: 'America/New_York'
                },
                attendees: eventData.attendees || [],
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: eventData.emailReminder || 60 },
                        { method: 'popup', minutes: eventData.popupReminder || 15 }
                    ]
                }
            };

            // Add client email as attendee if provided
            if (eventData.clientEmail) {
                event.attendees.push({ email: eventData.clientEmail });
            }

            const response = await gapi.client.calendar.events.insert({
                calendarId: this.currentCalendarId,
                resource: event
            });

            console.log('✅ Event created:', response.result);
            return response.result;
        } catch (error) {
            console.error('❌ Failed to create event:', error);
            throw error;
        }
    }

    // List events for a date range
    async listEvents(startDate, endDate) {
        if (!this.isAuthenticated) {
            await this.authenticate();
        }

        try {
            const response = await gapi.client.calendar.events.list({
                calendarId: this.currentCalendarId,
                timeMin: startDate.toISOString(),
                timeMax: endDate.toISOString(),
                orderBy: 'startTime',
                singleEvents: true
            });

            this.events = response.result.items || [];
            console.log(`✅ Loaded ${this.events.length} events`);
            return this.events;
        } catch (error) {
            console.error('❌ Failed to list events:', error);
            throw error;
        }
    }

    // Update an existing event
    async updateEvent(eventId, eventData) {
        if (!this.isAuthenticated) {
            await this.authenticate();
        }

        try {
            const event = {
                summary: eventData.title,
                description: eventData.description || '',
                location: eventData.location || '',
                start: {
                    dateTime: new Date(eventData.start).toISOString(),
                    timeZone: 'America/New_York'
                },
                end: {
                    dateTime: new Date(eventData.end).toISOString(),
                    timeZone: 'America/New_York'
                }
            };

            const response = await gapi.client.calendar.events.update({
                calendarId: this.currentCalendarId,
                eventId: eventId,
                resource: event
            });

            console.log('✅ Event updated:', response.result);
            return response.result;
        } catch (error) {
            console.error('❌ Failed to update event:', error);
            throw error;
        }
    }

    // Delete an event
    async deleteEvent(eventId) {
        if (!this.isAuthenticated) {
            await this.authenticate();
        }

        try {
            await gapi.client.calendar.events.delete({
                calendarId: this.currentCalendarId,
                eventId: eventId
            });

            console.log('✅ Event deleted');
            return true;
        } catch (error) {
            console.error('❌ Failed to delete event:', error);
            throw error;
        }
    }

    // Create client appointment with pre-filled details
    async createClientAppointment(clientData) {
        const now = new Date();
        const appointmentStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
        appointmentStart.setHours(10, 0, 0, 0); // 10 AM
        
        const appointmentEnd = new Date(appointmentStart.getTime() + 60 * 60 * 1000); // 1 hour duration

        const eventData = {
            title: `Strategy Session - ${clientData.name || 'Client'}`,
            description: this.generateAppointmentDescription(clientData),
            location: 'Video Call (Link will be sent)',
            start: appointmentStart,
            end: appointmentEnd,
            clientEmail: clientData.email,
            emailReminder: 60, // 1 hour before
            popupReminder: 15   // 15 minutes before
        };

        return await this.createEvent(eventData);
    }

    // Generate appointment description with client details
    generateAppointmentDescription(clientData) {
        let description = `Strategy Session with ${clientData.name}\n\n`;
        description += `Project Details:\n`;
        description += `• Type: ${this.formatProjectType(clientData.projectType)}\n`;
        description += `• Budget: $${(clientData.budget || 0).toLocaleString()}\n`;
        description += `• Timeline: ${this.formatTimeline(clientData.timeline)}\n\n`;
        description += `Contact Information:\n`;
        description += `• Email: ${clientData.email}\n`;
        description += `• Phone: ${clientData.phone || 'Not provided'}\n`;
        
        if (clientData.company) {
            description += `• Company: ${clientData.company}\n`;
        }
        
        if (clientData.message) {
            description += `\nClient Message:\n${clientData.message}\n`;
        }
        
        description += `\n---\nCreated via TownRanker Admin Dashboard`;
        
        return description;
    }

    // Helper: Format project type
    formatProjectType(type) {
        const types = {
            'business': 'Business Website',
            'ecommerce': 'E-Commerce Store',
            'webapp': 'Web Application',
            'landing': 'Landing Page'
        };
        return types[type] || type || 'General Project';
    }

    // Helper: Format timeline
    formatTimeline(timeline) {
        const timelines = {
            'asap': 'ASAP',
            '1-2months': '1-2 Months',
            '3-4months': '3-4 Months'
        };
        return timelines[timeline] || timeline || 'Not specified';
    }

    // Get events for a specific date
    getEventsForDate(date) {
        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);
        
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        return this.events.filter(event => {
            const eventDate = new Date(event.start.dateTime || event.start.date);
            return eventDate >= targetDate && eventDate < nextDay;
        });
    }

    // Quick schedule - open Google Calendar with pre-filled event
    quickScheduleWithClient(clientData) {
        const title = `Strategy Session - ${clientData.name || 'Client'}`;
        const details = this.generateAppointmentDescription(clientData);
        
        // Create Google Calendar URL
        let calendarUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
        calendarUrl += `&text=${encodeURIComponent(title)}`;
        calendarUrl += `&details=${encodeURIComponent(details)}`;
        
        if (clientData.email) {
            calendarUrl += `&add=${encodeURIComponent(clientData.email)}`;
        }
        
        // Set default time (tomorrow at 10 AM for 1 hour)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        
        const endTime = new Date(tomorrow);
        endTime.setHours(11, 0, 0, 0);
        
        const formatDateForGoogle = (date) => {
            return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };
        
        calendarUrl += `&dates=${formatDateForGoogle(tomorrow)}/${formatDateForGoogle(endTime)}`;
        
        window.open(calendarUrl, '_blank');
    }

    // Get authentication status
    getAuthStatus() {
        return {
            initialized: this.gapiInitialized,
            authenticated: this.isAuthenticated,
            hasCredentials: !!(this.API_KEY && this.CLIENT_ID)
        };
    }
}

// Global instance
window.googleCalendarManager = new GoogleCalendarManager();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Wait a bit for other scripts to load
    setTimeout(async () => {
        try {
            await window.googleCalendarManager.init();
            console.log('🗓️ Google Calendar Manager ready');
        } catch (error) {
            console.log('⚠️ Google Calendar Manager initialization failed:', error);
        }
    }, 2000);
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoogleCalendarManager;
}