// Interactive Google Calendar Integration for TownRanker
// This uses Google Calendar API v3 with existing credentials

// Configuration
const CALENDAR_CONFIG = {
    CLIENT_ID: '410008002816-pja5c9estqiloavso5dinnc7ij2squ45.apps.googleusercontent.com',
    API_KEY: 'AIzaSyAN8TZL-pbR-VRbgvjwVnjLJf9-SOGJABo',
    DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
    SCOPES: 'https://www.googleapis.com/auth/calendar',
    CALENDAR_ID: 'rank@townranker.com'
};

// Global variables
let gapiInited = false;
let gisInited = false;
let tokenClient;
let currentUserEmail = null;

/**
 * Initialize the Google API client
 */
function initializeGoogleCalendar() {
    // Load the Google API
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
        gapi.load('client', initializeGapiClient);
    };
    document.head.appendChild(script);

    // Load Google Identity Services
    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.onload = () => {
        initializeGisClient();
    };
    document.head.appendChild(gisScript);
}

/**
 * Initialize GAPI client
 */
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: CALENDAR_CONFIG.API_KEY,
        discoveryDocs: CALENDAR_CONFIG.DISCOVERY_DOCS,
    });
    gapiInited = true;
    maybeEnableButtons();
}

/**
 * Initialize Google Identity Services client
 */
function initializeGisClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CALENDAR_CONFIG.CLIENT_ID,
        scope: CALENDAR_CONFIG.SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableButtons();
}

/**
 * Enable buttons when both clients are loaded
 */
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button')?.removeAttribute('disabled');
        // Check if already authorized
        if (gapi.client.getToken() !== null) {
            showCalendarInterface();
        }
    }
}

/**
 * Sign in the user
 */
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        document.getElementById('authorize_button')?.style.display = 'none';
        document.getElementById('signout_button')?.style.display = 'block';
        await loadCalendarEvents();
        showCalendarInterface();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

/**
 * Sign out the user
 */
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('authorize_button')?.style.display = 'block';
        document.getElementById('signout_button')?.style.display = 'none';
        hideCalendarInterface();
    }
}

/**
 * Show the interactive calendar interface
 */
function showCalendarInterface() {
    const container = document.getElementById('interactiveCalendar');
    if (!container) return;
    
    container.style.display = 'block';
    loadCalendarEvents();
}

/**
 * Hide the calendar interface
 */
function hideCalendarInterface() {
    const container = document.getElementById('interactiveCalendar');
    if (container) {
        container.style.display = 'none';
    }
}

/**
 * Load calendar events
 */
async function loadCalendarEvents() {
    try {
        const request = await gapi.client.calendar.events.list({
            'calendarId': CALENDAR_CONFIG.CALENDAR_ID,
            'timeMin': (new Date()).toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'maxResults': 20,
            'orderBy': 'startTime'
        });

        const events = request.result.items;
        displayEvents(events);
    } catch (err) {
        console.error('Error loading events:', err);
        showNotification('Error loading calendar events', 'error');
    }
}

/**
 * Display events in the calendar
 */
function displayEvents(events) {
    const container = document.getElementById('calendarEventsList');
    if (!container) return;

    if (!events || events.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No upcoming events</p>';
        return;
    }

    let html = '<div class="events-list">';
    events.forEach(event => {
        const start = event.start.dateTime || event.start.date;
        const startDate = new Date(start);
        const formattedDate = startDate.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
        });
        const formattedTime = event.start.dateTime ? 
            startDate.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit' 
            }) : 'All day';

        html += `
            <div class="event-item" data-event-id="${event.id}">
                <div class="event-time">
                    <div class="event-date">${formattedDate}</div>
                    <div class="event-hour">${formattedTime}</div>
                </div>
                <div class="event-details">
                    <div class="event-title">${event.summary || 'Untitled Event'}</div>
                    ${event.location ? `<div class="event-location">📍 ${event.location}</div>` : ''}
                    ${event.description ? `<div class="event-description">${event.description.substring(0, 100)}...</div>` : ''}
                </div>
                <div class="event-actions">
                    <button onclick="editEvent('${event.id}')" class="btn-small btn-edit" title="Edit">
                        <span class="material-icons">edit</span>
                    </button>
                    <button onclick="deleteEvent('${event.id}')" class="btn-small btn-delete" title="Delete">
                        <span class="material-icons">delete</span>
                    </button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

/**
 * Create a new calendar event
 */
async function createEvent() {
    const form = document.getElementById('eventForm');
    if (!form) return;

    const formData = new FormData(form);
    const summary = formData.get('summary');
    const location = formData.get('location');
    const description = formData.get('description');
    const startDateTime = formData.get('startDateTime');
    const endDateTime = formData.get('endDateTime');

    if (!summary || !startDateTime || !endDateTime) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    const event = {
        'summary': summary,
        'location': location,
        'description': description,
        'start': {
            'dateTime': new Date(startDateTime).toISOString(),
            'timeZone': 'America/Phoenix'
        },
        'end': {
            'dateTime': new Date(endDateTime).toISOString(),
            'timeZone': 'America/Phoenix'
        },
        'reminders': {
            'useDefault': false,
            'overrides': [
                {'method': 'email', 'minutes': 24 * 60},
                {'method': 'popup', 'minutes': 10}
            ]
        }
    };

    try {
        const request = await gapi.client.calendar.events.insert({
            'calendarId': CALENDAR_CONFIG.CALENDAR_ID,
            'resource': event
        });

        showNotification('Event created successfully!', 'success');
        form.reset();
        closeEventModal();
        loadCalendarEvents();
    } catch (err) {
        console.error('Error creating event:', err);
        showNotification('Error creating event', 'error');
    }
}

/**
 * Edit an existing event
 */
async function editEvent(eventId) {
    try {
        const request = await gapi.client.calendar.events.get({
            'calendarId': CALENDAR_CONFIG.CALENDAR_ID,
            'eventId': eventId
        });

        const event = request.result;
        openEventModal(event);
    } catch (err) {
        console.error('Error fetching event:', err);
        showNotification('Error loading event details', 'error');
    }
}

/**
 * Delete an event
 */
async function deleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event?')) {
        return;
    }

    try {
        await gapi.client.calendar.events.delete({
            'calendarId': CALENDAR_CONFIG.CALENDAR_ID,
            'eventId': eventId
        });

        showNotification('Event deleted successfully!', 'success');
        loadCalendarEvents();
    } catch (err) {
        console.error('Error deleting event:', err);
        showNotification('Error deleting event', 'error');
    }
}

/**
 * Open event modal for creating/editing
 */
function openEventModal(event = null) {
    const modal = document.getElementById('eventModal');
    if (!modal) return;

    const form = document.getElementById('eventForm');
    const modalTitle = document.getElementById('modalTitle');
    const submitButton = document.getElementById('submitEventBtn');

    if (event) {
        // Edit mode
        modalTitle.textContent = 'Edit Event';
        submitButton.textContent = 'Update Event';
        submitButton.onclick = () => updateEvent(event.id);
        
        // Fill form with event data
        form.elements['summary'].value = event.summary || '';
        form.elements['location'].value = event.location || '';
        form.elements['description'].value = event.description || '';
        
        if (event.start.dateTime) {
            const startDate = new Date(event.start.dateTime);
            form.elements['startDateTime'].value = startDate.toISOString().slice(0, 16);
        }
        if (event.end.dateTime) {
            const endDate = new Date(event.end.dateTime);
            form.elements['endDateTime'].value = endDate.toISOString().slice(0, 16);
        }
    } else {
        // Create mode
        modalTitle.textContent = 'Create New Event';
        submitButton.textContent = 'Create Event';
        submitButton.onclick = createEvent;
        form.reset();
    }

    modal.style.display = 'block';
}

/**
 * Close event modal
 */
function closeEventModal() {
    const modal = document.getElementById('eventModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Update an existing event
 */
async function updateEvent(eventId) {
    const form = document.getElementById('eventForm');
    if (!form) return;

    const formData = new FormData(form);
    const summary = formData.get('summary');
    const location = formData.get('location');
    const description = formData.get('description');
    const startDateTime = formData.get('startDateTime');
    const endDateTime = formData.get('endDateTime');

    const event = {
        'summary': summary,
        'location': location,
        'description': description,
        'start': {
            'dateTime': new Date(startDateTime).toISOString(),
            'timeZone': 'America/Phoenix'
        },
        'end': {
            'dateTime': new Date(endDateTime).toISOString(),
            'timeZone': 'America/Phoenix'
        }
    };

    try {
        await gapi.client.calendar.events.update({
            'calendarId': CALENDAR_CONFIG.CALENDAR_ID,
            'eventId': eventId,
            'resource': event
        });

        showNotification('Event updated successfully!', 'success');
        closeEventModal();
        loadCalendarEvents();
    } catch (err) {
        console.error('Error updating event:', err);
        showNotification('Error updating event', 'error');
    }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span class="material-icons">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 10px;
        transform: translateX(400px);
        transition: transform 0.3s ease;
        z-index: 10000;
    }
    .notification.show {
        transform: translateX(0);
    }
    .notification-success {
        border-left: 4px solid #10b981;
    }
    .notification-error {
        border-left: 4px solid #ef4444;
    }
    .notification-info {
        border-left: 4px solid #6366f1;
    }
    .events-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .event-item {
        display: flex;
        align-items: center;
        padding: 15px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        gap: 15px;
        transition: all 0.2s ease;
    }
    .event-item:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        transform: translateY(-1px);
    }
    .event-time {
        min-width: 80px;
        text-align: center;
        padding-right: 15px;
        border-right: 2px solid #e5e7eb;
    }
    .event-date {
        font-size: 12px;
        color: #6b7280;
        font-weight: 600;
    }
    .event-hour {
        font-size: 14px;
        color: #1f2937;
        font-weight: 500;
    }
    .event-details {
        flex: 1;
    }
    .event-title {
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 4px;
    }
    .event-location, .event-description {
        font-size: 13px;
        color: #6b7280;
        margin-top: 2px;
    }
    .event-actions {
        display: flex;
        gap: 8px;
    }
    .btn-small {
        background: transparent;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    }
    .btn-small:hover {
        background: #f3f4f6;
    }
    .btn-edit {
        color: #6366f1;
    }
    .btn-delete {
        color: #ef4444;
    }
    .btn-small .material-icons {
        font-size: 18px;
    }
`;
document.head.appendChild(style);

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGoogleCalendar);
} else {
    initializeGoogleCalendar();
}