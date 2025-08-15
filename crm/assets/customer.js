// Customer Profile JavaScript
const API_BASE = '/api/crm';
let currentCustomer = null;
let customerId = null;

// Get auth token
const getAuthToken = () => {
    return localStorage.getItem('crm_token') || sessionStorage.getItem('crm_token');
};

// Check authentication
const checkAuth = () => {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/crm/login.html';
        return false;
    }
    return true;
};

// Initialize
if (!checkAuth()) {
    throw new Error('Not authenticated');
}

const AUTH_TOKEN = getAuthToken();

// Helper functions
const apiCall = async (endpoint, method = 'GET', data = null) => {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'API call failed');
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
};

const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

const formatDateTime = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Load customer data
const loadCustomer = async () => {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        customerId = urlParams.get('id');
        
        if (!customerId) {
            throw new Error('No customer ID provided');
        }
        
        const response = await apiCall(`/customers/${customerId}`);
        currentCustomer = response.data;
        
        // Update header information
        document.getElementById('customer-name').textContent = currentCustomer.name;
        document.getElementById('customer-company').textContent = currentCustomer.company || '';
        document.getElementById('customer-email').textContent = currentCustomer.email;
        document.getElementById('customer-phone').textContent = currentCustomer.phone;
        document.getElementById('customer-since').textContent = formatDate(currentCustomer.createdAt);
        
        // Update status badges
        const statusBadge = document.getElementById('customer-status-badge');
        statusBadge.textContent = currentCustomer.status;
        statusBadge.className = `badge-status badge-${currentCustomer.status}`;
        
        const priorityBadge = document.getElementById('customer-priority-badge');
        priorityBadge.textContent = currentCustomer.priority + ' priority';
        priorityBadge.className = `badge-status badge-${currentCustomer.priority}`;
        
        document.getElementById('customer-lead-score').textContent = currentCustomer.leadScore || 0;
        
        // Update financial summary
        document.getElementById('total-revenue').textContent = formatCurrency(currentCustomer.totalRevenue);
        document.getElementById('total-paid').textContent = formatCurrency(currentCustomer.totalPaid);
        document.getElementById('outstanding-balance').textContent = formatCurrency(currentCustomer.outstandingBalance);
        
        // Calculate overdue amount from payments
        let overdueAmount = 0;
        if (currentCustomer.payments && currentCustomer.payments.length > 0) {
            const now = new Date();
            currentCustomer.payments.forEach(payment => {
                if (payment.status !== 'paid' && new Date(payment.dueDate) < now) {
                    overdueAmount += payment.amountDue || 0;
                }
            });
        }
        document.getElementById('overdue-amount').textContent = formatCurrency(overdueAmount);
        
        // Update overview tab
        updateOverviewTab();
        
        // Load related data
        loadProjects();
        loadInvoices();
        loadProposals();
        loadCommunications();
        loadNotes();
        
    } catch (error) {
        console.error('Error loading customer:', error);
        alert('Failed to load customer data');
    }
};

// Update overview tab
const updateOverviewTab = () => {
    // Project requirements
    document.getElementById('project-type').textContent = currentCustomer.projectType ? 
        currentCustomer.projectType.charAt(0).toUpperCase() + currentCustomer.projectType.slice(1) : '-';
    document.getElementById('budget-range').textContent = currentCustomer.budget ? 
        formatCurrency(currentCustomer.budget) : '-';
    document.getElementById('timeline').textContent = currentCustomer.timeline || '-';
    document.getElementById('features').textContent = currentCustomer.features && currentCustomer.features.length > 0 ? 
        currentCustomer.features.join(', ') : '-';
    
    // Lead information
    document.getElementById('lead-source').textContent = currentCustomer.source || '-';
    document.getElementById('lead-campaign').textContent = currentCustomer.campaign || '-';
    document.getElementById('first-contact').textContent = formatDate(currentCustomer.firstContactDate);
    document.getElementById('last-contact').textContent = formatDate(currentCustomer.lastContactDate);
    document.getElementById('next-followup').textContent = formatDate(currentCustomer.nextFollowUp);
};

// Load projects
const loadProjects = async () => {
    try {
        const projectsList = document.getElementById('projects-list');
        
        if (!currentCustomer.projects || currentCustomer.projects.length === 0) {
            projectsList.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No projects yet</td></tr>';
            return;
        }
        
        // If projects are just IDs, fetch full data
        const projects = [];
        for (const project of currentCustomer.projects) {
            if (typeof project === 'string') {
                // It's just an ID, fetch the full project
                try {
                    const response = await apiCall(`/projects/${project}`);
                    projects.push(response.data);
                } catch (error) {
                    console.error('Error loading project:', error);
                }
            } else {
                projects.push(project);
            }
        }
        
        const projectsHtml = projects.map(project => `
            <tr>
                <td>${project.name}</td>
                <td><span class="badge bg-${getStatusColor(project.status)}">${project.status}</span></td>
                <td>
                    <div class="progress" style="height: 20px;">
                        <div class="progress-bar" style="width: ${project.progress || 0}%">${project.progress || 0}%</div>
                    </div>
                </td>
                <td>${formatDate(project.startDate)}</td>
                <td>${formatDate(project.endDate)}</td>
                <td>${formatCurrency(project.budget)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewProject('${project._id}')">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        projectsList.innerHTML = projectsHtml || '<tr><td colspan="7" class="text-center text-muted">No projects yet</td></tr>';
        
    } catch (error) {
        console.error('Error loading projects:', error);
    }
};

// Load invoices
const loadInvoices = async () => {
    try {
        const invoicesList = document.getElementById('invoices-list');
        
        if (!currentCustomer.payments || currentCustomer.payments.length === 0) {
            invoicesList.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No invoices yet</td></tr>';
            return;
        }
        
        // If payments are just IDs, fetch full data
        const invoices = [];
        for (const payment of currentCustomer.payments) {
            if (typeof payment === 'string') {
                // It's just an ID, fetch the full payment/invoice
                try {
                    const response = await apiCall(`/payments/${payment}`);
                    invoices.push(response.data);
                } catch (error) {
                    console.error('Error loading invoice:', error);
                }
            } else {
                invoices.push(payment);
            }
        }
        
        const invoicesHtml = invoices.map(invoice => {
            const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.status !== 'paid';
            const statusColor = invoice.status === 'paid' ? 'success' : isOverdue ? 'danger' : 'warning';
            
            return `
                <tr>
                    <td>${invoice.invoiceNumber}</td>
                    <td>${formatDate(invoice.invoiceDate)}</td>
                    <td>${formatDate(invoice.dueDate)}</td>
                    <td>${formatCurrency(invoice.total)}</td>
                    <td>${formatCurrency(invoice.amountPaid || 0)}</td>
                    <td><span class="badge bg-${statusColor}">${invoice.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewInvoice('${invoice._id}')" title="View">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${invoice.status !== 'paid' ? `
                            <button class="btn btn-sm btn-outline-success" onclick="recordPayment('${invoice._id}')" title="Record Payment">
                                <i class="bi bi-cash"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-warning" onclick="sendReminder('${invoice._id}')" title="Send Reminder">
                                <i class="bi bi-bell"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
        
        invoicesList.innerHTML = invoicesHtml || '<tr><td colspan="7" class="text-center text-muted">No invoices yet</td></tr>';
        
    } catch (error) {
        console.error('Error loading invoices:', error);
    }
};

// Load proposals
const loadProposals = async () => {
    try {
        const proposalsList = document.getElementById('proposals-list');
        
        if (!currentCustomer.proposals || currentCustomer.proposals.length === 0) {
            proposalsList.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No proposals yet</td></tr>';
            return;
        }
        
        // If proposals are just IDs, fetch full data
        const proposals = [];
        for (const proposal of currentCustomer.proposals) {
            if (typeof proposal === 'string') {
                try {
                    const response = await apiCall(`/proposals/${proposal}`);
                    proposals.push(response.data);
                } catch (error) {
                    console.error('Error loading proposal:', error);
                }
            } else {
                proposals.push(proposal);
            }
        }
        
        const proposalsHtml = proposals.map(proposal => {
            const isExpired = new Date(proposal.validUntil) < new Date() && proposal.status !== 'accepted';
            const statusColor = proposal.status === 'accepted' ? 'success' : 
                               proposal.status === 'rejected' ? 'danger' : 
                               isExpired ? 'secondary' : 'warning';
            
            return `
                <tr>
                    <td>${proposal.proposalNumber}</td>
                    <td>${proposal.title}</td>
                    <td>${formatCurrency(proposal.total)}</td>
                    <td><span class="badge bg-${statusColor}">${proposal.status}</span></td>
                    <td>${formatDate(proposal.validUntil)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewProposal('${proposal._id}')">
                            <i class="bi bi-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        proposalsList.innerHTML = proposalsHtml || '<tr><td colspan="6" class="text-center text-muted">No proposals yet</td></tr>';
        
    } catch (error) {
        console.error('Error loading proposals:', error);
    }
};

// Load communications
const loadCommunications = () => {
    // This would load email communications
    // For now, show empty state
    const communicationsList = document.getElementById('communications-list');
    
    if (!currentCustomer.communications || currentCustomer.communications.length === 0) {
        communicationsList.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-envelope"></i>
                <p>No communications yet</p>
            </div>
        `;
        return;
    }
    
    // TODO: Implement communications display
};

// Load notes
const loadNotes = () => {
    const notesList = document.getElementById('notes-list');
    
    if (!currentCustomer.notes || currentCustomer.notes.length === 0) {
        notesList.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-journal-text"></i>
                <p>No notes yet</p>
            </div>
        `;
        return;
    }
    
    const notesHtml = currentCustomer.notes.map(note => `
        <div class="note-card">
            <div class="note-header">
                <span class="note-author">${note.createdBy || 'Admin'}</span>
                <span class="note-date">${formatDateTime(note.createdAt)}</span>
            </div>
            <div class="note-content">${note.content}</div>
        </div>
    `).join('');
    
    notesList.innerHTML = notesHtml;
};

// Helper function to get status color
const getStatusColor = (status) => {
    const colors = {
        'planning': 'info',
        'in-progress': 'primary',
        'on-hold': 'warning',
        'completed': 'success',
        'cancelled': 'danger',
        'paid': 'success',
        'sent': 'warning',
        'overdue': 'danger',
        'draft': 'secondary',
        'accepted': 'success',
        'rejected': 'danger'
    };
    return colors[status] || 'secondary';
};

// Action functions
const editCustomer = () => {
    window.location.href = `/crm/customer.html?id=${customerId}&edit=true`;
};

const sendEmail = () => {
    window.location.href = `/crm/email-composer.html?customerId=${customerId}`;
};

const createInvoice = () => {
    // Open invoice modal with customer pre-selected
    window.location.href = `/crm/#payments`;
    // TODO: Pre-select customer in modal
};

const createProposal = () => {
    // Open proposal modal with customer pre-selected
    window.location.href = `/crm/#proposals`;
    // TODO: Pre-select customer in modal
};

const createProject = () => {
    // Open project modal with customer pre-selected
    window.location.href = `/crm/#projects`;
    // TODO: Pre-select customer in modal
};

const viewProject = (id) => {
    window.location.href = `/crm/project.html?id=${id}`;
};

const viewInvoice = (id) => {
    window.location.href = `/crm/invoice.html?id=${id}`;
};

const viewProposal = (id) => {
    window.location.href = `/crm/proposal.html?id=${id}`;
};

const recordPayment = async (invoiceId) => {
    const amount = prompt('Enter payment amount:');
    if (amount) {
        try {
            await apiCall(`/payments/${invoiceId}/pay`, 'POST', {
                amount: parseFloat(amount),
                method: 'manual',
                notes: 'Payment recorded via customer profile'
            });
            alert('Payment recorded successfully!');
            loadCustomer(); // Reload to update financial summary
        } catch (error) {
            alert('Failed to record payment');
        }
    }
};

const sendReminder = async (invoiceId) => {
    if (confirm('Send payment reminder to customer?')) {
        // TODO: Implement reminder sending
        alert('Reminder functionality coming soon');
    }
};

// Note functions
const addNote = () => {
    document.getElementById('add-note-form').style.display = 'block';
    document.getElementById('new-note-content').focus();
};

const cancelNote = () => {
    document.getElementById('add-note-form').style.display = 'none';
    document.getElementById('new-note-content').value = '';
};

const saveNote = async () => {
    const content = document.getElementById('new-note-content').value.trim();
    
    if (!content) {
        alert('Please enter a note');
        return;
    }
    
    try {
        await apiCall(`/customers/${customerId}/notes`, 'POST', {
            content: content,
            createdBy: 'Admin' // TODO: Get actual user name
        });
        
        cancelNote();
        await loadCustomer(); // Reload to show new note
        
    } catch (error) {
        alert('Failed to save note');
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadCustomer();
});

// Export functions for global use
window.editCustomer = editCustomer;
window.sendEmail = sendEmail;
window.createInvoice = createInvoice;
window.createProposal = createProposal;
window.createProject = createProject;
window.viewProject = viewProject;
window.viewInvoice = viewInvoice;
window.viewProposal = viewProposal;
window.recordPayment = recordPayment;
window.sendReminder = sendReminder;
window.addNote = addNote;
window.cancelNote = cancelNote;
window.saveNote = saveNote;