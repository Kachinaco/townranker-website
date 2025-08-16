// CRM JavaScript
const API_BASE = '/api/crm';

// Mobile Menu Functions - Define globally before auth check
window.toggleMobileMenu = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

window.closeMobileMenu = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    // Only close if on mobile
    if (window.innerWidth <= 768) {
        if (sidebar && overlay) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        }
    }
}

// Close mobile menu on window resize
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        window.closeMobileMenu();
    }
});

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

// Initialize auth check - but don't throw error, just redirect
if (!checkAuth()) {
    // Stop execution without throwing error that would prevent mobile menu functions
    // The redirect will happen from checkAuth()
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
    }).format(amount);
};

const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

// Section Management - Make globally accessible
window.showSection = (section) => {
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => {
        s.style.display = 'none';
    });
    
    // Show selected section
    const sectionElement = document.getElementById(`${section}-section`);
    if (sectionElement) {
        sectionElement.style.display = 'block';
    }
    
    // Update sidebar active state
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`.sidebar-nav a[href="#${section}"]`).classList.add('active');
    
    // Load section data
    switch(section) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'customers':
            loadCustomers();
            break;
        case 'projects':
            loadProjects();
            break;
        case 'payments':
            loadPayments();
            break;
        case 'proposals':
            loadProposals();
            break;
    }
};

// Dashboard Functions
const loadDashboard = async () => {
    try {
        const data = await apiCall('/analytics/dashboard');
        
        // Update stats
        document.getElementById('stat-customers').textContent = data.data.customers.total;
        document.getElementById('stat-projects').textContent = data.data.projects.active;
        document.getElementById('stat-revenue').textContent = formatCurrency(data.data.financial.totalRevenue);
        document.getElementById('stat-overdue').textContent = data.data.financial.overdueAmount ? 
            formatCurrency(data.data.financial.overdueAmount) : '0';
        
        // Update recent customers
        const customersHtml = data.data.recent.customers.map(customer => `
            <tr>
                <td><a href="/crm/customer.html?id=${customer._id}" style="text-decoration: none; color: #4338ca; font-weight: 500;">${customer.name}</a></td>
                <td><span class="badge-status badge-${customer.status}">${customer.status}</span></td>
                <td>${formatDate(customer.createdAt)}</td>
            </tr>
        `).join('');
        document.getElementById('recent-customers').innerHTML = customersHtml || '<tr><td colspan="3" class="text-center text-muted">No customers yet</td></tr>';
        
        // Update recent projects
        const projectsHtml = data.data.recent.projects.map(project => `
            <tr>
                <td>${project.name}</td>
                <td>
                    <div class="progress" style="height: 20px;">
                        <div class="progress-bar" style="width: ${project.progress}%">${project.progress}%</div>
                    </div>
                </td>
                <td><span class="badge-status badge-${project.status.replace('-', '')}">${project.status}</span></td>
            </tr>
        `).join('');
        document.getElementById('recent-projects').innerHTML = projectsHtml || '<tr><td colspan="3" class="text-center text-muted">No projects yet</td></tr>';
        
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
};

// Customer Functions
const loadCustomers = async () => {
    try {
        const data = await apiCall('/customers');
        
        const customersHtml = data.data.map(customer => `
            <tr>
                <td><a href="/crm/customer.html?id=${customer._id}" style="text-decoration: none; color: #4338ca; font-weight: 500;">${customer.name}</a></td>
                <td>${customer.email}</td>
                <td>${customer.phone}</td>
                <td><span class="badge-status badge-${customer.status}">${customer.status}</span></td>
                <td><span class="badge-priority badge-${customer.priority}">${customer.priority}</span></td>
                <td>${customer.leadScore || 0}/100</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewCustomer('${customer._id}')" title="View">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="editCustomer('${customer._id}')" title="Edit">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success" onclick="emailCustomer('${customer._id}')" title="Send Email">
                        <i class="bi bi-envelope"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        document.getElementById('customers-list').innerHTML = customersHtml || '<tr><td colspan="7" class="text-center text-muted">No customers found</td></tr>';
        
    } catch (error) {
        console.error('Failed to load customers:', error);
        document.getElementById('customers-list').innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to load customers</td></tr>';
    }
};

// Project Functions
const loadProjects = async () => {
    try {
        const data = await apiCall('/projects');
        
        const projectsHtml = data.data.map(project => `
            <tr>
                <td>${project.name}</td>
                <td>${project.customer ? `<a href="/crm/customer.html?id=${project.customer._id}" style="text-decoration: none; color: #4338ca;">${project.customer.name}</a>` : 'N/A'}</td>
                <td><span class="badge-status badge-${project.status.replace('-', '')}">${project.status}</span></td>
                <td>
                    <div class="progress" style="height: 20px;">
                        <div class="progress-bar" style="width: ${project.progress}%">${project.progress}%</div>
                    </div>
                </td>
                <td>${formatDate(project.startDate)}</td>
                <td>${formatDate(project.endDate)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewProject('${project._id}')">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="editProject('${project._id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        document.getElementById('projects-list').innerHTML = projectsHtml || '<tr><td colspan="7" class="text-center text-muted">No projects found</td></tr>';
        
    } catch (error) {
        console.error('Failed to load projects:', error);
        document.getElementById('projects-list').innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to load projects</td></tr>';
    }
};

// Payment Functions
const loadPayments = async () => {
    try {
        const data = await apiCall('/payments');
        
        // Update payment stats
        if (data.stats) {
            document.getElementById('total-paid').textContent = formatCurrency(data.stats.totalPaid);
            document.getElementById('total-pending').textContent = formatCurrency(data.stats.totalDue);
            document.getElementById('total-overdue').textContent = formatCurrency(0); // Calculate from overdue payments
        }
        
        const paymentsHtml = data.data.map(payment => {
            const isOverdue = new Date(payment.dueDate) < new Date() && payment.status !== 'paid';
            const statusClass = isOverdue ? 'danger' : payment.status === 'paid' ? 'success' : 'warning';
            
            return `
                <tr>
                    <td>${payment.invoiceNumber}</td>
                    <td>${payment.customer ? `<a href="/crm/customer.html?id=${payment.customer._id}" style="text-decoration: none; color: #4338ca;">${payment.customer.name}</a>` : 'N/A'}</td>
                    <td>${formatCurrency(payment.total)}</td>
                    <td><span class="badge bg-${statusClass}">${payment.status}</span></td>
                    <td>${formatDate(payment.dueDate)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewInvoice('${payment._id}')">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-success" onclick="recordPayment('${payment._id}')">
                            <i class="bi bi-cash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('payments-list').innerHTML = paymentsHtml || '<tr><td colspan="6" class="text-center text-muted">No payments found</td></tr>';
        
    } catch (error) {
        console.error('Failed to load payments:', error);
        document.getElementById('payments-list').innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load payments</td></tr>';
    }
};

// Proposal Functions
const loadProposals = async () => {
    try {
        const data = await apiCall('/proposals');
        
        const proposalsHtml = data.data.map(proposal => {
            const isExpired = new Date(proposal.validUntil) < new Date() && proposal.status !== 'accepted';
            const statusClass = proposal.status === 'accepted' ? 'success' : 
                               proposal.status === 'rejected' ? 'danger' : 
                               isExpired ? 'secondary' : 'warning';
            
            return `
                <tr>
                    <td>${proposal.proposalNumber}</td>
                    <td>${proposal.customer ? `<a href="/crm/customer.html?id=${proposal.customer._id}" style="text-decoration: none; color: #4338ca;">${proposal.customer.name}</a>` : 'N/A'}</td>
                    <td>${proposal.title}</td>
                    <td>${formatCurrency(proposal.total)}</td>
                    <td><span class="badge bg-${statusClass}">${proposal.status}</span></td>
                    <td>${formatDate(proposal.validUntil)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewProposal('${proposal._id}')">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="editProposal('${proposal._id}')">
                            <i class="bi bi-pencil"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('proposals-list').innerHTML = proposalsHtml || '<tr><td colspan="7" class="text-center text-muted">No proposals found</td></tr>';
        
    } catch (error) {
        console.error('Failed to load proposals:', error);
        document.getElementById('proposals-list').innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to load proposals</td></tr>';
    }
};

// Modal Functions are now in modals.js

// View/Edit Functions
const viewCustomer = (id) => {
    window.location.href = `/crm/customer.html?id=${id}`;
};

const editCustomer = (id) => {
    window.location.href = `/crm/customer.html?id=${id}&edit=true`;
};

const emailCustomer = (id) => {
    window.location.href = `/crm/email-composer.html?customerId=${id}`;
};

const viewProject = (id) => {
    window.location.href = `/crm/project.html?id=${id}`;
};

const editProject = (id) => {
    window.location.href = `/crm/project.html?id=${id}&edit=true`;
};

const viewInvoice = (id) => {
    window.location.href = `/crm/invoice.html?id=${id}`;
};

const recordPayment = async (id) => {
    const amount = prompt('Enter payment amount:');
    if (amount) {
        try {
            await apiCall(`/payments/${id}/pay`, 'POST', {
                amount: parseFloat(amount),
                method: 'manual',
                notes: 'Payment recorded via CRM'
            });
            loadPayments();
            alert('Payment recorded successfully!');
        } catch (error) {
            alert('Failed to record payment');
        }
    }
};

const viewProposal = (id) => {
    window.location.href = `/crm/proposal.html?id=${id}`;
};

const editProposal = (id) => {
    window.location.href = `/crm/proposal.html?id=${id}&edit=true`;
};

// Search and Filter Functions
document.addEventListener('DOMContentLoaded', () => {
    // Customer search
    const customerSearch = document.getElementById('customer-search');
    if (customerSearch) {
        customerSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            // TODO: Implement search
        });
    }
    
    // Customer filter
    const customerFilter = document.getElementById('customer-filter');
    if (customerFilter) {
        customerFilter.addEventListener('change', (e) => {
            const filterValue = e.target.value;
            // TODO: Implement filter
        });
    }
    
    // Load initial dashboard
    loadDashboard();
    
    // Auto-refresh dashboard every 30 seconds
    setInterval(() => {
        if (document.getElementById('dashboard-section').style.display !== 'none') {
            loadDashboard();
        }
    }, 30000);
});

// Logout function
window.logout = () => {
    // Clear tokens
    localStorage.removeItem('crm_token');
    sessionStorage.removeItem('crm_token');
    
    // Redirect to login
    window.location.href = '/crm/login.html';
};

// Export functions for global use
window.showSection = showSection;
// showModal is exported from modals.js
window.viewCustomer = viewCustomer;
window.editCustomer = editCustomer;
window.emailCustomer = emailCustomer;
window.viewProject = viewProject;
window.editProject = editProject;
window.viewInvoice = viewInvoice;
window.recordPayment = recordPayment;
window.viewProposal = viewProposal;
window.editProposal = editProposal;
window.logout = logout;
window.loadDashboard = loadDashboard;
window.loadCustomers = loadCustomers;
window.loadProjects = loadProjects;
window.loadPayments = loadPayments;
window.loadProposals = loadProposals;
window.apiCall = apiCall;