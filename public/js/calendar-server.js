// Server-side Calendar Integration for TownRanker
// This version works with private/incognito browser by using server-side authentication

let isAuthenticated = false;

const CALENDAR_STATUS_LABELS = {
	loading: 'Checking...',
	disconnected: 'Not connected',
	connected: 'Connected',
	pending: 'Authorizing...',
	error: 'Needs attention'
};

function updateCalendarStatusUI(state = 'loading', message = '') {
    const badge = document.getElementById('calendarStatusBadge');
    const hint = document.getElementById('calendarStatusMessage');

    if (badge) {
        badge.dataset.status = state;
        badge.textContent = CALENDAR_STATUS_LABELS[state] || 'Status';
        if (state === 'loading') {
            badge.setAttribute('aria-busy', 'true');
        } else {
            badge.removeAttribute('aria-busy');
        }
    }

    if (hint) {
        hint.textContent = message || '';
    }
}

function setAuthorizeButtonState({ visible = true, disabled = false, tooltip = '' } = {}) {
    const authBtn = document.getElementById('authorize_button');
    if (!authBtn) {
        return;
    }
    authBtn.style.display = visible ? 'flex' : 'none';
    authBtn.disabled = disabled;
    authBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    if (tooltip) {
        authBtn.title = tooltip;
    } else {
        authBtn.removeAttribute('title');
    }
}

/**
 * Initialize calendar and check authentication status
 */
async function initializeServerCalendar() {
    try {
		updateCalendarStatusUI('loading', 'Checking calendar status...');
        setAuthorizeButtonState({ visible: true, disabled: true });
        const response = await fetch('/api/calendar/auth/status');
        const data = await response.json();
        
        if (data.configured === false) {
            updateCalendarStatusUI('error', 'Add Google OAuth credentials on the server to enable syncing.');
            setAuthorizeButtonState({
                visible: true,
                disabled: true,
                tooltip: 'Server is missing Google OAuth credentials.'
            });
            hideCalendarInterface();
            return;
        }

        isAuthenticated = data.authenticated;
        
        if (isAuthenticated) {
            updateCalendarStatusUI('connected', 'Google Calendar is connected.');
            setAuthorizeButtonState({ visible: false });
            showCalendarInterface();
            loadCalendarEvents();
        } else {
            updateCalendarStatusUI('disconnected', 'Connect to manage Google Calendar events.');
            setAuthorizeButtonState({ visible: true, disabled: false });
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        updateCalendarStatusUI('error', 'Unable to reach the calendar service. Try again in a moment.');
        setAuthorizeButtonState({ visible: true, disabled: false, tooltip: 'Retry connection' });
    }
}

/**
 * Handle authentication click - redirect to server OAuth
 */
function handleAuthClick() {
    const authBtn = document.getElementById('authorize_button');
    if (authBtn && authBtn.disabled) {
        return;
    }
		updateCalendarStatusUI('pending', 'Redirecting to Google for authorization...');
    setAuthorizeButtonState({ visible: true, disabled: true });
    // Redirect to server-side OAuth flow
    window.location.href = '/api/calendar/auth';
}

/**
 * Handle signout
 */
async function handleSignoutClick() {
    try {
        const response = await fetch('/api/calendar/signout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            isAuthenticated = false;
            hideCalendarInterface();
            setAuthorizeButtonState({ visible: true, disabled: false });
            const signOutBtn = document.getElementById('signout_button');
            if (signOutBtn) {
                signOutBtn.style.display = 'none';
            }
            updateCalendarStatusUI('disconnected', 'Disconnected from Google Calendar.');
            showNotification('Signed out successfully', 'success');
        }
    } catch (error) {
        console.error('Error signing out:', error);
        showNotification('Error signing out', 'error');
    }
}

/**
 * Load calendar events from server
 */
async function loadCalendarEvents() {
    try {
        const response = await fetch('/api/calendar/events');
        
        if (response.status === 401) {
            // Token expired or not authenticated
            isAuthenticated = false;
            hideCalendarInterface();
            updateCalendarStatusUI('disconnected', 'Session expired. Connect again to sync events.');
            setAuthorizeButtonState({ visible: true, disabled: false });
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            displayEvents(data.events);
        }
    } catch (error) {
        console.error('Error loading events:', error);
        showNotification('Error loading calendar events', 'error');
        updateCalendarStatusUI('error', 'Unable to load events. Refresh the page or reconnect.');
        setAuthorizeButtonState({ visible: true, disabled: false });
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
        const start = event.start?.dateTime || event.start?.date;
        if (!start) return;
        
        const startDate = new Date(start);
        const formattedDate = startDate.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
        });
        const formattedTime = event.start?.dateTime ? 
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
                    ${event.attendees && event.attendees.length ? `<div class="event-attendees">👥 ${event.attendees.length} attendee(s)</div>` : ''}
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

    const eventData = {
        summary,
        location,
        description,
        startDateTime: new Date(startDateTime).toISOString(),
        endDateTime: new Date(endDateTime).toISOString()
    };

    try {
        const response = await fetch('/api/calendar/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Event created successfully!', 'success');
            form.reset();
            closeEventModal();
            loadCalendarEvents();
        } else {
            showNotification('Error creating event', 'error');
        }
    } catch (error) {
        console.error('Error creating event:', error);
        showNotification('Error creating event', 'error');
    }
}

/**
 * Edit an existing event
 */
async function editEvent(eventId) {
    try {
        const response = await fetch(`/api/calendar/events/${eventId}`);
        const data = await response.json();
        
        if (data.success) {
            openEventModal(data.event);
        }
    } catch (error) {
        console.error('Error fetching event:', error);
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
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Event deleted successfully!', 'success');
            loadCalendarEvents();
        }
    } catch (error) {
        console.error('Error deleting event:', error);
        showNotification('Error deleting event', 'error');
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

    const eventData = {
        summary,
        location,
        description,
        startDateTime: new Date(startDateTime).toISOString(),
        endDateTime: new Date(endDateTime).toISOString()
    };

    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Event updated successfully!', 'success');
            closeEventModal();
            loadCalendarEvents();
        }
    } catch (error) {
        console.error('Error updating event:', error);
        showNotification('Error updating event', 'error');
    }
}

/**
 * Quick add event using natural language
 */
async function quickAddEvent(text) {
    try {
        const response = await fetch('/api/calendar/events/quickAdd', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Event added successfully!', 'success');
            loadCalendarEvents();
            return true;
        }
    } catch (error) {
        console.error('Error quick adding event:', error);
        showNotification('Error adding event', 'error');
    }
    return false;
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
        
        if (event.start?.dateTime) {
            const startDate = new Date(event.start.dateTime);
            form.elements['startDateTime'].value = startDate.toISOString().slice(0, 16);
        }
        if (event.end?.dateTime) {
            const endDate = new Date(event.end.dateTime);
            form.elements['endDateTime'].value = endDate.toISOString().slice(0, 16);
        }
    } else {
        // Create mode
        modalTitle.textContent = 'Create New Event';
        submitButton.textContent = 'Create Event';
        submitButton.onclick = createEvent;
        form.reset();
        
        // Set default times (next hour)
        const now = new Date();
        const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
        const nextHour2 = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        
        form.elements['startDateTime'].value = nextHour.toISOString().slice(0, 16);
        form.elements['endDateTime'].value = nextHour2.toISOString().slice(0, 16);
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
 * Show the interactive calendar interface
 */
function showCalendarInterface() {
    const container = document.getElementById('interactiveCalendar');
    const fallback = document.getElementById('calendarFallback');
    const createBtn = document.getElementById('create_event_btn');
    const signOutBtn = document.getElementById('signout_button');
    
    if (container && fallback) {
        container.style.display = 'block';
        fallback.style.display = 'none';
        if (createBtn) {
            createBtn.style.display = 'flex';
        }
    }
    
    setAuthorizeButtonState({ visible: false });
    if (signOutBtn) signOutBtn.style.display = 'block';
    updateCalendarStatusUI('connected', 'Google Calendar is connected.');
    
    loadCalendarEvents();
}

/**
 * Hide the calendar interface
 */
function hideCalendarInterface() {
    const container = document.getElementById('interactiveCalendar');
    const fallback = document.getElementById('calendarFallback');
    const createBtn = document.getElementById('create_event_btn');
    const signOutBtn = document.getElementById('signout_button');
    
    if (container && fallback) {
        container.style.display = 'none';
        fallback.style.display = 'block';
        if (createBtn) {
            createBtn.style.display = 'none';
        }
    }

    if (signOutBtn) {
        signOutBtn.style.display = 'none';
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

// Check if we're returning from OAuth flow
if (window.location.search.includes('calendar=connected')) {
    showNotification('Calendar connected successfully!', 'success');
    // Remove query parameter from URL
    window.history.replaceState({}, document.title, window.location.pathname);
    // Initialize calendar
    setTimeout(() => {
        initializeServerCalendar();
    }, 500);
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeServerCalendar);
} else {
    initializeServerCalendar();
}

// Export functions for global use
window.handleAuthClick = handleAuthClick;
window.handleSignoutClick = handleSignoutClick;
window.loadCalendarEvents = loadCalendarEvents;
window.createEvent = createEvent;
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.quickAddEvent = quickAddEvent;
