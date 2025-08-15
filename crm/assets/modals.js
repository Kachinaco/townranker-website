// Modal Functions for CRM

// Update showModal to open the correct modal
const showModal = (type) => {
    switch(type) {
        case 'newCustomer':
            loadCustomerModal();
            break;
        case 'newProject':
            loadProjectModal();
            break;
        case 'newInvoice':
            loadInvoiceModal();
            break;
        case 'newProposal':
            loadProposalModal();
            break;
        default:
            console.error('Unknown modal type:', type);
    }
};

// ============== CUSTOMER MODAL ==============

function loadCustomerModal() {
    // Clear form
    document.getElementById('newCustomerForm').reset();
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('newCustomerModal'));
    modal.show();
}

async function saveNewCustomer() {
    const customerData = {
        name: document.getElementById('customerName').value,
        email: document.getElementById('customerEmail').value,
        phone: document.getElementById('customerPhone').value,
        company: document.getElementById('customerCompany').value,
        projectType: document.getElementById('customerProjectType').value,
        budget: document.getElementById('customerBudget').value || 0,
        timeline: document.getElementById('customerTimeline').value,
        status: document.getElementById('customerStatus').value,
        notes: [{
            content: document.getElementById('customerNotes').value,
            createdBy: 'Admin'
        }]
    };
    
    // Validate required fields
    if (!customerData.name || !customerData.email || !customerData.phone) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        const response = await apiCall('/customers', 'POST', customerData);
        
        if (response.success) {
            alert('Customer created successfully!');
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('newCustomerModal')).hide();
            
            // Reload customers list if on customers page
            if (document.getElementById('customers-section').style.display !== 'none') {
                loadCustomers();
            }
            
            // Reload dashboard
            loadDashboard();
        } else {
            alert('Error creating customer: ' + response.message);
        }
    } catch (error) {
        console.error('Error creating customer:', error);
        alert('Failed to create customer');
    }
}

// ============== PROJECT MODAL ==============

async function loadProjectModal() {
    // Clear form
    document.getElementById('newProjectForm').reset();
    
    // Load customers for dropdown
    try {
        const response = await apiCall('/customers');
        const customerSelect = document.getElementById('projectCustomer');
        
        customerSelect.innerHTML = '<option value="">Select customer...</option>';
        response.data.forEach(customer => {
            customerSelect.innerHTML += `<option value="${customer._id}">${customer.name} - ${customer.company || 'No Company'}</option>`;
        });
    } catch (error) {
        console.error('Error loading customers:', error);
    }
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    
    document.getElementById('projectStartDate').value = today;
    document.getElementById('projectEndDate').value = endDate.toISOString().split('T')[0];
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('newProjectModal'));
    modal.show();
}

async function saveNewProject() {
    const projectData = {
        name: document.getElementById('projectName').value,
        customer: document.getElementById('projectCustomer').value,
        type: document.getElementById('projectType').value,
        budget: document.getElementById('projectBudget').value || 0,
        startDate: document.getElementById('projectStartDate').value,
        endDate: document.getElementById('projectEndDate').value,
        description: document.getElementById('projectDescription').value,
        status: 'planning'
    };
    
    // Validate required fields
    if (!projectData.name || !projectData.customer) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        const response = await apiCall('/projects', 'POST', projectData);
        
        if (response.success) {
            alert('Project created successfully!');
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('newProjectModal')).hide();
            
            // Reload projects list if on projects page
            if (document.getElementById('projects-section').style.display !== 'none') {
                loadProjects();
            }
            
            // Reload dashboard
            loadDashboard();
        } else {
            alert('Error creating project: ' + response.message);
        }
    } catch (error) {
        console.error('Error creating project:', error);
        alert('Failed to create project');
    }
}

// ============== INVOICE MODAL ==============

async function loadInvoiceModal() {
    // Clear form
    document.getElementById('newInvoiceForm').reset();
    
    // Reset items to one empty item
    document.getElementById('invoiceItems').innerHTML = `
        <div class="invoice-item mb-2">
            <div class="row">
                <div class="col-md-6">
                    <input type="text" class="form-control item-description" placeholder="Description">
                </div>
                <div class="col-md-2">
                    <input type="number" class="form-control item-qty" placeholder="Qty" value="1" onchange="calculateInvoiceTotal()">
                </div>
                <div class="col-md-3">
                    <input type="number" class="form-control item-rate" placeholder="Rate" step="0.01" onchange="calculateInvoiceTotal()">
                </div>
                <div class="col-md-1">
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeInvoiceItem(this)">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Load customers for dropdown
    try {
        const response = await apiCall('/customers');
        const customerSelect = document.getElementById('invoiceCustomer');
        
        customerSelect.innerHTML = '<option value="">Select customer...</option>';
        response.data.forEach(customer => {
            customerSelect.innerHTML += `<option value="${customer._id}">${customer.name} - ${customer.company || 'No Company'}</option>`;
        });
    } catch (error) {
        console.error('Error loading customers:', error);
    }
    
    // Set default due date (30 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    document.getElementById('invoiceDueDate').value = dueDate.toISOString().split('T')[0];
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('newInvoiceModal'));
    modal.show();
}

function addInvoiceItem() {
    const itemsContainer = document.getElementById('invoiceItems');
    const newItem = document.createElement('div');
    newItem.className = 'invoice-item mb-2';
    newItem.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <input type="text" class="form-control item-description" placeholder="Description">
            </div>
            <div class="col-md-2">
                <input type="number" class="form-control item-qty" placeholder="Qty" value="1" onchange="calculateInvoiceTotal()">
            </div>
            <div class="col-md-3">
                <input type="number" class="form-control item-rate" placeholder="Rate" step="0.01" onchange="calculateInvoiceTotal()">
            </div>
            <div class="col-md-1">
                <button type="button" class="btn btn-sm btn-danger" onclick="removeInvoiceItem(this)">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `;
    itemsContainer.appendChild(newItem);
}

function removeInvoiceItem(button) {
    const items = document.querySelectorAll('.invoice-item');
    if (items.length > 1) {
        button.closest('.invoice-item').remove();
        calculateInvoiceTotal();
    } else {
        alert('Invoice must have at least one item');
    }
}

function calculateInvoiceTotal() {
    let subtotal = 0;
    
    document.querySelectorAll('.invoice-item').forEach(item => {
        const qty = parseFloat(item.querySelector('.item-qty').value) || 0;
        const rate = parseFloat(item.querySelector('.item-rate').value) || 0;
        subtotal += qty * rate;
    });
    
    const taxRate = parseFloat(document.getElementById('invoiceTaxRate').value) || 0;
    const tax = (subtotal * taxRate) / 100;
    const total = subtotal + tax;
    
    document.getElementById('invoiceTotal').value = `$${total.toFixed(2)}`;
}

async function saveNewInvoice() {
    const items = [];
    document.querySelectorAll('.invoice-item').forEach(item => {
        const description = item.querySelector('.item-description').value;
        const qty = parseFloat(item.querySelector('.item-qty').value) || 0;
        const rate = parseFloat(item.querySelector('.item-rate').value) || 0;
        
        if (description && rate > 0) {
            items.push({
                description: description,
                quantity: qty,
                rate: rate,
                amount: qty * rate
            });
        }
    });
    
    if (items.length === 0) {
        alert('Please add at least one item to the invoice');
        return;
    }
    
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = parseFloat(document.getElementById('invoiceTaxRate').value) || 0;
    const taxAmount = (subtotal * taxRate) / 100;
    
    const invoiceData = {
        customer: document.getElementById('invoiceCustomer').value,
        dueDate: document.getElementById('invoiceDueDate').value,
        items: items,
        subtotal: subtotal,
        taxRate: taxRate,
        taxAmount: taxAmount,
        total: subtotal + taxAmount,
        amountDue: subtotal + taxAmount,
        status: 'sent'
    };
    
    // Validate required fields
    if (!invoiceData.customer || !invoiceData.dueDate) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        const response = await apiCall('/payments', 'POST', invoiceData);
        
        if (response.success) {
            alert('Invoice created successfully!');
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('newInvoiceModal')).hide();
            
            // Reload payments list if on payments page
            if (document.getElementById('payments-section').style.display !== 'none') {
                loadPayments();
            }
            
            // Reload dashboard
            loadDashboard();
        } else {
            alert('Error creating invoice: ' + response.message);
        }
    } catch (error) {
        console.error('Error creating invoice:', error);
        alert('Failed to create invoice');
    }
}

// ============== PROPOSAL MODAL ==============

async function loadProposalModal() {
    // Clear form
    document.getElementById('newProposalForm').reset();
    
    // Load customers for dropdown
    try {
        const response = await apiCall('/customers');
        const customerSelect = document.getElementById('proposalCustomer');
        
        customerSelect.innerHTML = '<option value="">Select customer...</option>';
        response.data.forEach(customer => {
            customerSelect.innerHTML += `<option value="${customer._id}">${customer.name} - ${customer.company || 'No Company'}</option>`;
        });
    } catch (error) {
        console.error('Error loading customers:', error);
    }
    
    // Set default valid until date (30 days from now)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);
    document.getElementById('proposalValidUntil').value = validUntil.toISOString().split('T')[0];
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('newProposalModal'));
    modal.show();
}

async function saveNewProposal() {
    const proposalData = {
        customer: document.getElementById('proposalCustomer').value,
        title: document.getElementById('proposalTitle').value,
        executiveSummary: document.getElementById('proposalSummary').value,
        total: parseFloat(document.getElementById('proposalAmount').value) || 0,
        subtotal: parseFloat(document.getElementById('proposalAmount').value) || 0,
        validUntil: document.getElementById('proposalValidUntil').value,
        template: document.getElementById('proposalTemplate').value,
        status: 'draft',
        pricing: [{
            item: 'Project Implementation',
            description: document.getElementById('proposalTitle').value,
            quantity: 1,
            rate: parseFloat(document.getElementById('proposalAmount').value) || 0,
            amount: parseFloat(document.getElementById('proposalAmount').value) || 0
        }]
    };
    
    // Validate required fields
    if (!proposalData.customer || !proposalData.title) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        const response = await apiCall('/proposals', 'POST', proposalData);
        
        if (response.success) {
            alert('Proposal created successfully!');
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('newProposalModal')).hide();
            
            // Reload proposals list if on proposals page
            if (document.getElementById('proposals-section').style.display !== 'none') {
                loadProposals();
            }
            
            // Reload dashboard
            loadDashboard();
        } else {
            alert('Error creating proposal: ' + response.message);
        }
    } catch (error) {
        console.error('Error creating proposal:', error);
        alert('Failed to create proposal');
    }
}

// Override the global showModal function
window.showModal = showModal;
window.saveNewCustomer = saveNewCustomer;
window.saveNewProject = saveNewProject;
window.saveNewInvoice = saveNewInvoice;
window.saveNewProposal = saveNewProposal;
window.addInvoiceItem = addInvoiceItem;
window.removeInvoiceItem = removeInvoiceItem;
window.calculateInvoiceTotal = calculateInvoiceTotal;