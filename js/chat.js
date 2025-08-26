class ChatInterface {
    constructor(customerId, customerName, customerPhone) {
        this.customerId = customerId;
        this.customerName = customerName;
        this.customerPhone = customerPhone;
        this.socket = null;
        this.currentPage = 1;
        this.loading = false;
        this.hasMoreMessages = true;
        
        this.initializeChat();
        this.setupEventListeners();
        this.connectSocket();
    }

    initializeChat() {
        // Create chat container HTML
        const chatHTML = `
            <div class="chat-interface" id="chat-${this.customerId}">
                <div class="chat-header">
                    <div class="chat-header-info">
                        <h3>${this.customerName}</h3>
                        <span class="phone-number">${this.customerPhone}</span>
                        <span class="chat-status" id="chatStatus-${this.customerId}">
                            <span class="status-indicator"></span>
                            <span class="status-text">SMS Ready</span>
                        </span>
                    </div>
                    <div class="chat-actions">
                        <button class="btn-icon" onclick="chat_${this.customerId}.refreshChat()" title="Refresh">
                            <i class="material-icons">refresh</i>
                        </button>
                        <button class="btn-icon" onclick="chat_${this.customerId}.closeChat()" title="Close">
                            <i class="material-icons">close</i>
                        </button>
                    </div>
                </div>
                
                <div class="chat-messages" id="chatMessages-${this.customerId}">
                    <div class="loading-indicator" id="chatLoading-${this.customerId}">
                        <div class="spinner"></div>
                        <span>Loading conversation...</span>
                    </div>
                </div>
                
                <div class="chat-input-container">
                    <div class="chat-input-wrapper">
                        <textarea 
                            id="chatInput-${this.customerId}"
                            class="chat-input"
                            placeholder="Type your message..."
                            rows="1"
                            maxlength="1600"
                        ></textarea>
                        <button 
                            class="send-button"
                            id="sendButton-${this.customerId}"
                            onclick="chat_${this.customerId}.sendMessage()"
                            disabled
                        >
                            <i class="material-icons">send</i>
                        </button>
                    </div>
                    <div class="chat-info">
                        <span class="char-counter">0/1600</span>
                        <span class="delivery-info" id="deliveryInfo-${this.customerId}">
                            Messages sent via SMS
                        </span>
                    </div>
                </div>
            </div>
        `;

        // Add to communications container or create modal
        const container = document.querySelector('.communications-container') || 
                         this.createChatModal();
        container.innerHTML = chatHTML;

        // Load initial messages
        this.loadMessages();
    }

    createChatModal() {
        const modal = document.createElement('div');
        modal.className = 'chat-modal';
        modal.innerHTML = `
            <div class="chat-modal-content">
                <div class="chat-modal-backdrop" onclick="chat_${this.customerId}.closeChat()"></div>
                <div class="chat-container"></div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal.querySelector('.chat-container');
    }

    setupEventListeners() {
        // Auto-resize textarea
        const input = document.getElementById(`chatInput-${this.customerId}`);
        if (input) {
            input.addEventListener('input', () => {
                this.autoResizeTextarea(input);
                this.updateCharCounter();
                this.toggleSendButton();
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // Infinite scroll for loading more messages
        const messagesContainer = document.getElementById(`chatMessages-${this.customerId}`);
        if (messagesContainer) {
            messagesContainer.addEventListener('scroll', () => {
                if (messagesContainer.scrollTop === 0 && this.hasMoreMessages && !this.loading) {
                    this.loadMoreMessages();
                }
            });
        }
    }

    connectSocket() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Socket connected for chat');
                this.socket.emit('join_customer_room', this.customerId);
            });

            this.socket.on('new_message', (data) => {
                if (data.customerId === this.customerId) {
                    this.appendMessage(data.communication);
                }
            });

            this.socket.on('message_status_update', (data) => {
                if (data.customerId === this.customerId) {
                    this.updateMessageStatus(data.messageId, data.status);
                }
            });
        }
    }

    async loadMessages() {
        this.loading = true;
        this.showLoading(true);

        try {
            const response = await fetch(`/api/messages/conversation/${this.customerId}?page=1&limit=50`);
            const data = await response.json();

            if (data.success) {
                const messagesContainer = document.getElementById(`chatMessages-${this.customerId}`);
                messagesContainer.innerHTML = '';

                data.messages.forEach(message => {
                    this.appendMessage(message);
                });

                this.hasMoreMessages = data.messages.length === 50;
                this.scrollToBottom();
                this.updateChatStatus(data.messages);
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            this.showError('Failed to load conversation');
        } finally {
            this.loading = false;
            this.showLoading(false);
        }
    }

    async loadMoreMessages() {
        if (this.loading || !this.hasMoreMessages) return;

        this.loading = true;
        this.currentPage++;

        try {
            const response = await fetch(`/api/messages/conversation/${this.customerId}?page=${this.currentPage}&limit=50`);
            const data = await response.json();

            if (data.success && data.messages.length > 0) {
                const messagesContainer = document.getElementById(`chatMessages-${this.customerId}`);
                const oldScrollHeight = messagesContainer.scrollHeight;

                // Prepend messages to the top
                data.messages.reverse().forEach(message => {
                    this.prependMessage(message);
                });

                // Maintain scroll position
                messagesContainer.scrollTop = messagesContainer.scrollHeight - oldScrollHeight;

                this.hasMoreMessages = data.messages.length === 50;
            } else {
                this.hasMoreMessages = false;
            }
        } catch (error) {
            console.error('Error loading more messages:', error);
        } finally {
            this.loading = false;
        }
    }

    async sendMessage() {
        const input = document.getElementById(`chatInput-${this.customerId}`);
        const message = input.value.trim();

        if (!message) return;

        const sendButton = document.getElementById(`sendButton-${this.customerId}`);
        sendButton.disabled = true;
        sendButton.innerHTML = '<div class="spinner-small"></div>';

        try {
            const response = await fetch('/api/messages/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    customerId: this.customerId,
                    message: message
                })
            });

            const data = await response.json();

            if (data.success) {
                // Clear input
                input.value = '';
                this.updateCharCounter();
                this.autoResizeTextarea(input);

                // Add message to UI immediately
                this.appendMessage({
                    _id: data.communication._id,
                    direction: 'outbound',
                    body: message,
                    createdAt: new Date().toISOString(),
                    status: 'sending',
                    deliveryChannel: data.deliveryChannel,
                    platform: data.platform
                });

                this.updateDeliveryInfo(data.deliveryChannel);
            } else {
                throw new Error(data.error || 'Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.showError('Failed to send message');
        } finally {
            sendButton.disabled = false;
            sendButton.innerHTML = '<i class="material-icons">send</i>';
        }
    }

    appendMessage(message) {
        const messagesContainer = document.getElementById(`chatMessages-${this.customerId}`);
        const messageElement = this.createMessageElement(message);
        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    prependMessage(message) {
        const messagesContainer = document.getElementById(`chatMessages-${this.customerId}`);
        const messageElement = this.createMessageElement(message);
        messagesContainer.insertBefore(messageElement, messagesContainer.firstChild);
    }

    createMessageElement(message) {
        const isOutbound = message.direction === 'outbound';
        const isImessage = message.deliveryChannel === 'imessage';
        
        // Enhanced timestamp formatting
        const messageDate = new Date(message.createdAt || message.timestamp);
        const now = new Date();
        const isToday = messageDate.toDateString() === now.toDateString();
        const isYesterday = new Date(now.getTime() - 86400000).toDateString() === messageDate.toDateString();
        
        let timestamp;
        if (isToday) {
            timestamp = messageDate.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else if (isYesterday) {
            timestamp = 'Yesterday ' + messageDate.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            timestamp = messageDate.toLocaleDateString([], {
                month: 'short',
                day: 'numeric'
            }) + ' ' + messageDate.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOutbound ? 'outbound' : 'inbound'} ${isImessage ? 'imessage' : 'sms'}`;
        messageDiv.dataset.messageId = message._id;

        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(message.body)}</div>
                <div class="message-meta">
                    <span class="message-time">${timestamp}</span>
                    ${isOutbound ? `
                        <span class="message-status" data-status="${message.status}">
                            ${this.getStatusIcon(message.status)}
                        </span>
                    ` : ''}
                    ${isImessage ? '<span class="imessage-indicator">iMessage</span>' : ''}
                </div>
            </div>
        `;

        return messageDiv;
    }

    getStatusIcon(status) {
        const icons = {
            'sending': '<i class="material-icons status-sending">schedule</i>',
            'sent': '<i class="material-icons status-sent">check</i>',
            'delivered': '<i class="material-icons status-delivered">done_all</i>',
            'failed': '<i class="material-icons status-failed">error</i>'
        };
        return icons[status] || icons['sent'];
    }

    updateMessageStatus(messageId, status) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const statusElement = messageElement.querySelector('.message-status');
            if (statusElement) {
                statusElement.dataset.status = status;
                statusElement.innerHTML = this.getStatusIcon(status);
            }
        }
    }

    updateChatStatus(messages) {
        const statusElement = document.getElementById(`chatStatus-${this.customerId}`);
        if (!statusElement) return;

        const hasImessage = messages.some(m => m.deliveryChannel === 'imessage');
        const statusText = statusElement.querySelector('.status-text');
        const statusIndicator = statusElement.querySelector('.status-indicator');

        if (hasImessage) {
            statusText.textContent = 'iMessage Available';
            statusIndicator.className = 'status-indicator imessage';
        } else {
            statusText.textContent = 'SMS Ready';
            statusIndicator.className = 'status-indicator sms';
        }
    }

    updateDeliveryInfo(deliveryChannel) {
        const deliveryInfo = document.getElementById(`deliveryInfo-${this.customerId}`);
        if (deliveryInfo) {
            deliveryInfo.textContent = deliveryChannel === 'imessage' ? 
                'Messages sent via iMessage' : 
                'Messages sent via SMS';
        }
    }

    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    updateCharCounter() {
        const input = document.getElementById(`chatInput-${this.customerId}`);
        const counter = document.querySelector('.char-counter');
        if (input && counter) {
            counter.textContent = `${input.value.length}/1600`;
        }
    }

    toggleSendButton() {
        const input = document.getElementById(`chatInput-${this.customerId}`);
        const sendButton = document.getElementById(`sendButton-${this.customerId}`);
        if (input && sendButton) {
            sendButton.disabled = !input.value.trim();
        }
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById(`chatMessages-${this.customerId}`);
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    showLoading(show) {
        const loading = document.getElementById(`chatLoading-${this.customerId}`);
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }

    showError(message) {
        // Could implement toast notifications or inline error messages
        console.error('Chat error:', message);
        alert(message); // Simple fallback
    }

    refreshChat() {
        this.currentPage = 1;
        this.hasMoreMessages = true;
        this.loadMessages();
    }

    closeChat() {
        const modal = document.querySelector('.chat-modal');
        if (modal) {
            modal.remove();
        }
        
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\n/g, "<br>");
    }
}

// Global function to open chat for a customer
function openCustomerChat(customerId, customerName, customerPhone) {
    console.log('Opening chat for:', { customerId, customerName, customerPhone });
    
    if (!customerId) {
        alert('Customer ID is required to open chat');
        return;
    }
    
    if (!customerPhone) {
        alert('Customer phone number is required for chat');
        return;
    }

    try {
        // Close existing chat if any
        const existingModal = document.querySelector('.chat-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create new chat instance
        window[`chat_${customerId}`] = new ChatInterface(customerId, customerName, customerPhone);
        console.log('Chat interface created successfully');
    } catch (error) {
        console.error('Error opening chat:', error);
        alert('Failed to open chat: ' + error.message);
    }
}

// Make sure the function is available globally
window.openCustomerChat = openCustomerChat;

// Debug: Log when this script loads
console.log('Chat.js loaded successfully');