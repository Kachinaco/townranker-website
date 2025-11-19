const { google } = require('googleapis');
const axios = require('axios');
const moment = require('moment-timezone');

class WorkflowCalendarSync {
    constructor(oAuth2Client) {
        this.oAuth2Client = oAuth2Client;
        this.calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
        this.likemondayAPI = process.env.LIKEMONDAY_API_URL || 'http://localhost:8088/api';
        this.timezone = 'America/Phoenix';
    }

    /**
     * Map workflow task to Google Calendar event
     */
    mapTaskToEvent(task, board) {
        const event = {
            summary: `${board.title}: ${task.title}`,
            description: this.buildEventDescription(task, board),
            colorId: this.getColorByStatus(task.status),
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 60 },
                    { method: 'email', minutes: 1440 } // 24 hours
                ]
            }
        };

        // Handle date/time
        if (task.dueDate) {
            const dueDate = moment(task.dueDate).tz(this.timezone);
            if (task.dueTime) {
                // Specific time
                event.start = {
                    dateTime: dueDate.format(),
                    timeZone: this.timezone
                };
                event.end = {
                    dateTime: dueDate.add(1, 'hour').format(),
                    timeZone: this.timezone
                };
            } else {
                // All-day event
                event.start = {
                    date: dueDate.format('YYYY-MM-DD')
                };
                event.end = {
                    date: dueDate.add(1, 'day').format('YYYY-MM-DD')
                };
            }
        }

        // Add attendees if assigned
        if (task.assignee && task.assignee.email) {
            event.attendees = [{ email: task.assignee.email }];
        }

        // Add location if available
        if (task.location) {
            event.location = task.location;
        }

        return event;
    }

    /**
     * Map Google Calendar event to workflow task updates
     */
    mapEventToTask(event) {
        const taskUpdate = {
            title: this.extractTaskTitle(event.summary),
            calendarEventId: event.id,
            lastSyncedAt: new Date().toISOString()
        };

        // Extract dates
        if (event.start) {
            if (event.start.dateTime) {
                taskUpdate.dueDate = moment(event.start.dateTime).toISOString();
                taskUpdate.dueTime = moment(event.start.dateTime).format('HH:mm');
            } else if (event.start.date) {
                taskUpdate.dueDate = moment(event.start.date).toISOString();
                taskUpdate.dueTime = null;
            }
        }

        // Parse description for additional metadata
        if (event.description) {
            const metadata = this.parseEventDescription(event.description);
            if (metadata.priority) taskUpdate.priority = metadata.priority;
            if (metadata.tags) taskUpdate.tags = metadata.tags;
        }

        // Map color to status
        if (event.colorId) {
            taskUpdate.status = this.getStatusByColor(event.colorId);
        }

        return taskUpdate;
    }

    /**
     * Sync all tasks from a board to Google Calendar
     */
    async syncBoardToCalendar(boardId) {
        try {
            // Fetch board from LikeMonday
            const boardResponse = await axios.get(`${this.likemondayAPI}/board/${boardId}`);
            const board = boardResponse.data;

            const syncResults = {
                created: 0,
                updated: 0,
                failed: 0,
                errors: []
            };

            // Process each group and task
            for (const group of board.groups || []) {
                for (const task of group.tasks || []) {
                    try {
                        if (task.calendarEventId) {
                            // Update existing event
                            await this.updateCalendarEvent(task, board);
                            syncResults.updated++;
                        } else if (task.dueDate) {
                            // Create new event only if task has due date
                            const eventId = await this.createCalendarEvent(task, board);
                            
                            // Update task with calendar event ID
                            await this.updateTaskWithEventId(boardId, group.id, task.id, eventId);
                            syncResults.created++;
                        }
                    } catch (error) {
                        console.error(`Failed to sync task ${task.id}:`, error.message);
                        syncResults.failed++;
                        syncResults.errors.push({
                            taskId: task.id,
                            error: error.message
                        });
                    }
                }
            }

            return syncResults;
        } catch (error) {
            console.error('Board sync failed:', error);
            throw error;
        }
    }

    /**
     * Sync calendar events back to workflow
     */
    async syncCalendarToWorkflow(boardId, timeMin = null, timeMax = null) {
        try {
            // Set default time range (next 30 days)
            if (!timeMin) {
                timeMin = moment().toISOString();
            }
            if (!timeMax) {
                timeMax = moment().add(30, 'days').toISOString();
            }

            // Fetch calendar events
            const response = await this.calendar.events.list({
                calendarId: 'primary',
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
                q: `board:${boardId}` // Search for board-related events
            });

            const events = response.data.items || [];
            const syncResults = {
                updated: 0,
                created: 0,
                errors: []
            };

            for (const event of events) {
                try {
                    // Extract task ID from event extended properties
                    const taskId = event.extendedProperties?.private?.taskId;
                    
                    if (taskId) {
                        // Update existing task
                        const taskUpdate = this.mapEventToTask(event);
                        await this.updateWorkflowTask(boardId, taskId, taskUpdate);
                        syncResults.updated++;
                    } else {
                        // Optionally create new task from calendar event
                        // This depends on your workflow requirements
                    }
                } catch (error) {
                    console.error(`Failed to sync event ${event.id}:`, error.message);
                    syncResults.errors.push({
                        eventId: event.id,
                        error: error.message
                    });
                }
            }

            return syncResults;
        } catch (error) {
            console.error('Calendar sync failed:', error);
            throw error;
        }
    }

    /**
     * Create calendar event from task
     */
    async createCalendarEvent(task, board) {
        const event = this.mapTaskToEvent(task, board);
        
        // Add extended properties to link back to task
        event.extendedProperties = {
            private: {
                taskId: task.id,
                boardId: board._id,
                groupId: task.groupId
            }
        };

        const response = await this.calendar.events.insert({
            calendarId: 'primary',
            resource: event
        });

        return response.data.id;
    }

    /**
     * Update existing calendar event
     */
    async updateCalendarEvent(task, board) {
        const event = this.mapTaskToEvent(task, board);
        
        await this.calendar.events.update({
            calendarId: 'primary',
            eventId: task.calendarEventId,
            resource: event
        });
    }

    /**
     * Update task with calendar event ID
     */
    async updateTaskWithEventId(boardId, groupId, taskId, eventId) {
        const updateData = {
            calendarEventId: eventId,
            lastSyncedAt: new Date().toISOString()
        };

        await axios.put(
            `${this.likemondayAPI}/board/${boardId}/group/${groupId}/task/${taskId}`,
            updateData
        );
    }

    /**
     * Update workflow task from calendar changes
     */
    async updateWorkflowTask(boardId, taskId, updates) {
        await axios.put(
            `${this.likemondayAPI}/board/${boardId}/task/${taskId}`,
            updates
        );
    }

    /**
     * Delete calendar event when task is deleted
     */
    async deleteCalendarEvent(eventId) {
        try {
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId: eventId
            });
            return true;
        } catch (error) {
            console.error('Failed to delete calendar event:', error);
            return false;
        }
    }

    /**
     * Set up webhook for real-time calendar updates
     */
    async setupCalendarWebhook(webhookUrl) {
        try {
            const channel = {
                id: `workflow-sync-${Date.now()}`,
                type: 'web_hook',
                address: webhookUrl,
                expiration: Date.now() + 604800000 // 7 days
            };

            const response = await this.calendar.events.watch({
                calendarId: 'primary',
                requestBody: channel
            });

            return response.data;
        } catch (error) {
            console.error('Failed to setup webhook:', error);
            throw error;
        }
    }

    /**
     * Helper: Build event description from task
     */
    buildEventDescription(task, board) {
        let description = `Board: ${board.title}\n`;
        
        if (task.description) {
            description += `\nDescription:\n${task.description}\n`;
        }
        
        if (task.priority) {
            description += `\nPriority: ${task.priority}`;
        }
        
        if (task.tags && task.tags.length > 0) {
            description += `\nTags: ${task.tags.join(', ')}`;
        }
        
        if (task.checklist && task.checklist.length > 0) {
            description += `\n\nChecklist:\n`;
            task.checklist.forEach(item => {
                description += `${item.done ? '✓' : '☐'} ${item.text}\n`;
            });
        }

        description += `\n\n---\nTask ID: ${task.id}\nLast synced: ${new Date().toISOString()}`;
        
        return description;
    }

    /**
     * Helper: Parse event description for metadata
     */
    parseEventDescription(description) {
        const metadata = {};
        
        // Extract priority
        const priorityMatch = description.match(/Priority:\s*(\w+)/i);
        if (priorityMatch) {
            metadata.priority = priorityMatch[1];
        }
        
        // Extract tags
        const tagsMatch = description.match(/Tags:\s*([^\n]+)/i);
        if (tagsMatch) {
            metadata.tags = tagsMatch[1].split(',').map(tag => tag.trim());
        }
        
        // Extract task ID
        const taskIdMatch = description.match(/Task ID:\s*([^\n]+)/i);
        if (taskIdMatch) {
            metadata.taskId = taskIdMatch[1];
        }
        
        return metadata;
    }

    /**
     * Helper: Extract task title from event summary
     */
    extractTaskTitle(summary) {
        // Remove board prefix if present
        const match = summary.match(/^[^:]+:\s*(.+)$/);
        return match ? match[1] : summary;
    }

    /**
     * Helper: Map task status to Google Calendar color
     */
    getColorByStatus(status) {
        const colorMap = {
            'todo': '8',        // Graphite
            'in-progress': '5', // Yellow
            'review': '7',      // Turquoise
            'done': '10',       // Green
            'blocked': '11',    // Red
            'cancelled': '8'    // Graphite
        };
        return colorMap[status?.toLowerCase()] || '9'; // Blue (default)
    }

    /**
     * Helper: Map Google Calendar color to task status
     */
    getStatusByColor(colorId) {
        const statusMap = {
            '8': 'todo',
            '5': 'in-progress',
            '7': 'review',
            '10': 'done',
            '11': 'blocked'
        };
        return statusMap[colorId] || 'todo';
    }

    /**
     * Detect and resolve sync conflicts
     */
    async resolveConflict(task, event, strategy = 'recent') {
        const taskUpdated = moment(task.updatedAt || task.lastSyncedAt);
        const eventUpdated = moment(event.updated);
        
        if (strategy === 'recent') {
            // Use most recently updated version
            return taskUpdated.isAfter(eventUpdated) ? 'task' : 'event';
        } else if (strategy === 'calendar') {
            // Always prefer calendar
            return 'event';
        } else if (strategy === 'workflow') {
            // Always prefer workflow
            return 'task';
        }
        
        return 'task'; // Default
    }
}

module.exports = WorkflowCalendarSync;