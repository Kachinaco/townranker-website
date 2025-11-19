/**
 * Workflow-Calendar Sync Manager
 * Handles synchronization between workflow tasks and Google Calendar
 */

class WorkflowSyncManager {
    constructor() {
        this.apiBase = '/api';
        this.syncStatus = {};
        this.autoSyncInterval = null;
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.setupUI();
        this.loadSyncSettings();
    }

    /**
     * Check calendar authentication status
     */
    async checkAuthStatus() {
        try {
            const response = await fetch(`${this.apiBase}/calendar/auth/status`);
            const data = await response.json();
            
            if (!data.authenticated) {
                this.showAuthPrompt(data.authUrl);
                return false;
            }
            
            this.showSyncStatus('authenticated');
            return true;
        } catch (error) {
            console.error('Failed to check auth status:', error);
            return false;
        }
    }

    /**
     * Setup UI elements for sync control
     */
    setupUI() {
        // Add sync controls to workflow interface
        const syncContainer = document.createElement('div');
        syncContainer.id = 'workflow-sync-controls';
        syncContainer.className = 'sync-controls';
        syncContainer.innerHTML = `
            <div class="sync-header">
                <h3>📅 Calendar Sync</h3>
                <div class="sync-status" id="sync-status">
                    <span class="status-indicator"></span>
                    <span class="status-text">Checking...</span>
                </div>
            </div>
            
            <div class="sync-actions">
                <button id="sync-now-btn" class="btn btn-primary">
                    <i class="fas fa-sync"></i> Sync Now
                </button>
                
                <button id="sync-settings-btn" class="btn btn-secondary">
                    <i class="fas fa-cog"></i> Settings
                </button>
            </div>
            
            <div class="sync-info" id="sync-info">
                <div class="last-sync">
                    Last sync: <span id="last-sync-time">Never</span>
                </div>
                <div class="sync-stats" id="sync-stats"></div>
            </div>
            
            <!-- Settings Modal -->
            <div id="sync-settings-modal" class="modal" style="display: none;">
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h2>Sync Settings</h2>
                    
                    <form id="sync-settings-form">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="auto-sync" name="autoSync">
                                Enable Auto-Sync
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label for="sync-interval">Sync Interval (minutes)</label>
                            <input type="number" id="sync-interval" name="syncInterval" 
                                   min="5" max="60" value="15">
                        </div>
                        
                        <div class="form-group">
                            <label for="conflict-resolution">Conflict Resolution</label>
                            <select id="conflict-resolution" name="conflictResolution">
                                <option value="recent">Most Recent Wins</option>
                                <option value="calendar">Calendar Priority</option>
                                <option value="workflow">Workflow Priority</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="include-completed" name="includeCompleted">
                                Include Completed Tasks
                            </label>
                        </div>
                        
                        <button type="submit" class="btn btn-primary">Save Settings</button>
                    </form>
                </div>
            </div>
        `;

        // Insert into page (adjust selector based on your layout)
        const targetContainer = document.querySelector('.workflow-container, .board-container, main');
        if (targetContainer) {
            targetContainer.insertBefore(syncContainer, targetContainer.firstChild);
        }

        // Attach event listeners
        this.attachEventListeners();
    }

    /**
     * Attach event listeners to UI elements
     */
    attachEventListeners() {
        // Sync now button
        const syncNowBtn = document.getElementById('sync-now-btn');
        if (syncNowBtn) {
            syncNowBtn.addEventListener('click', () => this.syncNow());
        }

        // Settings button
        const settingsBtn = document.getElementById('sync-settings-btn');
        const settingsModal = document.getElementById('sync-settings-modal');
        const closeBtn = settingsModal?.querySelector('.close');

        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                settingsModal.style.display = 'block';
            });

            closeBtn?.addEventListener('click', () => {
                settingsModal.style.display = 'none';
            });

            window.addEventListener('click', (event) => {
                if (event.target === settingsModal) {
                    settingsModal.style.display = 'none';
                }
            });
        }

        // Settings form
        const settingsForm = document.getElementById('sync-settings-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings();
            });
        }

        // Auto-sync checkbox
        const autoSyncCheckbox = document.getElementById('auto-sync');
        if (autoSyncCheckbox) {
            autoSyncCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startAutoSync();
                } else {
                    this.stopAutoSync();
                }
            });
        }
    }

    /**
     * Perform manual sync
     */
    async syncNow() {
        const syncBtn = document.getElementById('sync-now-btn');
        const boardId = this.getCurrentBoardId();
        
        if (!boardId) {
            alert('Please select a board to sync');
            return;
        }

        try {
            // Disable button and show loading
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
            
            // Perform bi-directional sync
            const response = await fetch(`${this.apiBase}/sync/board/${boardId}/bidirectional`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    strategy: this.syncStatus.conflictResolution || 'recent'
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showSyncSuccess(result.results);
                this.updateLastSyncTime();
            } else {
                throw new Error(result.error || 'Sync failed');
            }
        } catch (error) {
            console.error('Sync error:', error);
            this.showSyncError(error.message);
        } finally {
            // Re-enable button
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fas fa-sync"></i> Sync Now';
        }
    }

    /**
     * Start automatic sync
     */
    startAutoSync() {
        const interval = (this.syncStatus.syncInterval || 15) * 60 * 1000; // Convert to milliseconds
        
        // Clear existing interval
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }

        // Set new interval
        this.autoSyncInterval = setInterval(() => {
            this.syncNow();
        }, interval);

        console.log(`Auto-sync started (every ${this.syncStatus.syncInterval} minutes)`);
    }

    /**
     * Stop automatic sync
     */
    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
        console.log('Auto-sync stopped');
    }

    /**
     * Load sync settings
     */
    async loadSyncSettings() {
        const boardId = this.getCurrentBoardId();
        if (!boardId) return;

        try {
            const response = await fetch(`${this.apiBase}/sync/board/${boardId}/status`);
            const data = await response.json();
            
            if (data.success) {
                this.syncStatus = data.status;
                this.updateSettingsUI();
                
                // Start auto-sync if enabled
                if (this.syncStatus.autoSync) {
                    this.startAutoSync();
                }
            }
        } catch (error) {
            console.error('Failed to load sync settings:', error);
        }
    }

    /**
     * Save sync settings
     */
    async saveSettings() {
        const boardId = this.getCurrentBoardId();
        if (!boardId) return;

        const formData = new FormData(document.getElementById('sync-settings-form'));
        const settings = {
            autoSync: formData.get('autoSync') === 'on',
            syncInterval: parseInt(formData.get('syncInterval')),
            conflictResolution: formData.get('conflictResolution'),
            includeCompleted: formData.get('includeCompleted') === 'on'
        };

        try {
            const response = await fetch(`${this.apiBase}/sync/board/${boardId}/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });

            const result = await response.json();
            
            if (result.success) {
                this.syncStatus = { ...this.syncStatus, ...settings };
                alert('Settings saved successfully');
                document.getElementById('sync-settings-modal').style.display = 'none';
                
                // Restart auto-sync if settings changed
                if (settings.autoSync) {
                    this.startAutoSync();
                } else {
                    this.stopAutoSync();
                }
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('Failed to save settings');
        }
    }

    /**
     * Update settings UI with current values
     */
    updateSettingsUI() {
        const autoSync = document.getElementById('auto-sync');
        const syncInterval = document.getElementById('sync-interval');
        const conflictResolution = document.getElementById('conflict-resolution');
        const includeCompleted = document.getElementById('include-completed');

        if (autoSync) autoSync.checked = this.syncStatus.autoSync || false;
        if (syncInterval) syncInterval.value = this.syncStatus.syncInterval || 15;
        if (conflictResolution) conflictResolution.value = this.syncStatus.conflictResolution || 'recent';
        if (includeCompleted) includeCompleted.checked = this.syncStatus.includeCompleted || false;

        // Update last sync time
        if (this.syncStatus.lastSyncedAt) {
            this.updateLastSyncTime(this.syncStatus.lastSyncedAt);
        }
    }

    /**
     * Show authentication prompt
     */
    showAuthPrompt(authUrl) {
        const statusEl = document.getElementById('sync-status');
        if (statusEl) {
            statusEl.innerHTML = `
                <span class="status-indicator status-warning"></span>
                <span class="status-text">Not authenticated</span>
                <a href="${authUrl}" class="btn btn-sm btn-primary">Connect Calendar</a>
            `;
        }
    }

    /**
     * Show sync status
     */
    showSyncStatus(status) {
        const statusEl = document.getElementById('sync-status');
        if (!statusEl) return;

        const statusMap = {
            'authenticated': {
                class: 'status-success',
                text: 'Connected'
            },
            'syncing': {
                class: 'status-info',
                text: 'Syncing...'
            },
            'error': {
                class: 'status-error',
                text: 'Error'
            }
        };

        const statusInfo = statusMap[status] || statusMap['authenticated'];
        statusEl.innerHTML = `
            <span class="status-indicator ${statusInfo.class}"></span>
            <span class="status-text">${statusInfo.text}</span>
        `;
    }

    /**
     * Show sync success message
     */
    showSyncSuccess(results) {
        const statsEl = document.getElementById('sync-stats');
        if (statsEl) {
            const total = (results.fromCalendar?.updated || 0) + 
                         (results.toCalendar?.created || 0) + 
                         (results.toCalendar?.updated || 0);
            
            statsEl.innerHTML = `
                <div class="sync-success">
                    ✅ Sync completed: ${total} items synced
                    <ul>
                        <li>Created in calendar: ${results.toCalendar?.created || 0}</li>
                        <li>Updated in calendar: ${results.toCalendar?.updated || 0}</li>
                        <li>Updated from calendar: ${results.fromCalendar?.updated || 0}</li>
                    </ul>
                </div>
            `;
            
            // Clear message after 5 seconds
            setTimeout(() => {
                statsEl.innerHTML = '';
            }, 5000);
        }
    }

    /**
     * Show sync error message
     */
    showSyncError(error) {
        const statsEl = document.getElementById('sync-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="sync-error">
                    ❌ Sync failed: ${error}
                </div>
            `;
            
            // Clear message after 5 seconds
            setTimeout(() => {
                statsEl.innerHTML = '';
            }, 5000);
        }
    }

    /**
     * Update last sync time display
     */
    updateLastSyncTime(time = new Date()) {
        const lastSyncEl = document.getElementById('last-sync-time');
        if (lastSyncEl) {
            const timeStr = new Date(time).toLocaleString();
            lastSyncEl.textContent = timeStr;
        }
    }

    /**
     * Get current board ID (implement based on your app structure)
     */
    getCurrentBoardId() {
        // Try different methods to get board ID
        // 1. From URL
        const urlParams = new URLSearchParams(window.location.search);
        const boardId = urlParams.get('board') || urlParams.get('boardId');
        
        // 2. From data attribute
        if (!boardId) {
            const boardEl = document.querySelector('[data-board-id]');
            return boardEl?.dataset.boardId;
        }
        
        // 3. From global variable (if your app uses one)
        if (!boardId && window.currentBoardId) {
            return window.currentBoardId;
        }
        
        // 4. Default test board
        return boardId || 'test-board-1';
    }

    /**
     * Sync individual task
     */
    async syncTask(taskId, taskData) {
        try {
            const response = await fetch(`${this.apiBase}/sync/task/${taskId}/to-calendar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            });

            const result = await response.json();
            return result.success;
        } catch (error) {
            console.error('Failed to sync task:', error);
            return false;
        }
    }
}

// Initialize sync manager when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.workflowSync = new WorkflowSyncManager();
});

// Add CSS styles
const style = document.createElement('style');
style.textContent = `
    .sync-controls {
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .sync-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }
    
    .sync-header h3 {
        margin: 0;
        font-size: 18px;
    }
    
    .sync-status {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .status-indicator {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #ccc;
    }
    
    .status-indicator.status-success {
        background: #4caf50;
    }
    
    .status-indicator.status-warning {
        background: #ff9800;
    }
    
    .status-indicator.status-error {
        background: #f44336;
    }
    
    .status-indicator.status-info {
        background: #2196f3;
        animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
    
    .sync-actions {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
    }
    
    .sync-info {
        font-size: 14px;
        color: #666;
    }
    
    .last-sync {
        margin-bottom: 5px;
    }
    
    .sync-success {
        color: #4caf50;
        padding: 10px;
        background: #e8f5e9;
        border-radius: 4px;
        margin-top: 10px;
    }
    
    .sync-error {
        color: #f44336;
        padding: 10px;
        background: #ffebee;
        border-radius: 4px;
        margin-top: 10px;
    }
    
    .modal {
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.4);
    }
    
    .modal-content {
        background-color: #fefefe;
        margin: 10% auto;
        padding: 20px;
        border: 1px solid #888;
        width: 80%;
        max-width: 500px;
        border-radius: 8px;
    }
    
    .close {
        color: #aaa;
        float: right;
        font-size: 28px;
        font-weight: bold;
        cursor: pointer;
    }
    
    .close:hover {
        color: #000;
    }
    
    .form-group {
        margin-bottom: 15px;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
    }
    
    .form-group input[type="number"],
    .form-group select {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
    }
    
    .form-group input[type="checkbox"] {
        margin-right: 8px;
    }
`;
document.head.appendChild(style);