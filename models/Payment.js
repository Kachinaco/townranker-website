const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    // Relations
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    },
    proposal: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Proposal'
    },
    
    // Invoice Details
    invoiceNumber: {
        type: String,
        required: true,
        unique: true
    },
    invoiceDate: {
        type: Date,
        default: Date.now
    },
    dueDate: {
        type: Date,
        required: true
    },
    
    // Payment Information
    status: {
        type: String,
        enum: ['draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled', 'refunded'],
        default: 'draft'
    },
    paymentMethod: {
        type: String,
        enum: ['credit_card', 'debit_card', 'paypal', 'stripe', 'bank_transfer', 'check', 'cash', 'other']
    },
    
    // Line Items
    items: [{
        description: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            default: 1
        },
        rate: {
            type: Number,
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        tax: {
            type: Number,
            default: 0
        }
    }],
    
    // Financial Details
    subtotal: {
        type: Number,
        required: true
    },
    taxRate: {
        type: Number,
        default: 0
    },
    taxAmount: {
        type: Number,
        default: 0
    },
    discount: {
        type: Number,
        default: 0
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'fixed'
    },
    total: {
        type: Number,
        required: true
    },
    amountPaid: {
        type: Number,
        default: 0
    },
    amountDue: {
        type: Number,
        required: true
    },
    
    // Payment Records
    payments: [{
        amount: Number,
        date: {
            type: Date,
            default: Date.now
        },
        method: String,
        reference: String,
        notes: String
    }],
    
    // Recurring Payment
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurringInterval: {
        type: String,
        enum: ['weekly', 'monthly', 'quarterly', 'yearly']
    },
    recurringEndDate: Date,
    nextPaymentDate: Date,
    
    // Additional Information
    currency: {
        type: String,
        default: 'USD'
    },
    notes: String,
    termsAndConditions: String,
    
    // Reminders
    remindersSent: [{
        date: Date,
        type: String, // email, sms, etc.
        status: String // sent, failed
    }],
    lastReminderDate: Date,
    
    // Stripe/PayPal Integration
    stripeInvoiceId: String,
    stripePaymentIntentId: String,
    paypalInvoiceId: String,
    paymentLink: String,
    
    // Files
    attachments: [{
        name: String,
        url: String,
        type: String
    }],
    
    // Metadata
    sentDate: Date,
    viewedDate: Date,
    paidDate: Date,
    createdBy: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Generate invoice number
paymentSchema.statics.generateInvoiceNumber = async function() {
    const lastInvoice = await this.findOne({}, {}, { sort: { 'createdAt': -1 } });
    let nextNumber = 1001;
    
    if (lastInvoice && lastInvoice.invoiceNumber) {
        const lastNumber = parseInt(lastInvoice.invoiceNumber.replace(/\D/g, ''));
        nextNumber = lastNumber + 1;
    }
    
    const year = new Date().getFullYear();
    return `INV-${year}-${nextNumber.toString().padStart(4, '0')}`;
};

// Calculate totals
paymentSchema.methods.calculateTotals = function() {
    // Calculate subtotal
    this.subtotal = this.items.reduce((acc, item) => acc + item.amount, 0);
    
    // Calculate discount
    let discountAmount = 0;
    if (this.discount) {
        if (this.discountType === 'percentage') {
            discountAmount = (this.subtotal * this.discount) / 100;
        } else {
            discountAmount = this.discount;
        }
    }
    
    // Calculate tax
    const taxableAmount = this.subtotal - discountAmount;
    this.taxAmount = (taxableAmount * this.taxRate) / 100;
    
    // Calculate total
    this.total = taxableAmount + this.taxAmount;
    
    // Calculate amount due
    this.amountDue = this.total - this.amountPaid;
    
    return {
        subtotal: this.subtotal,
        discount: discountAmount,
        tax: this.taxAmount,
        total: this.total,
        due: this.amountDue
    };
};

// Check if overdue
paymentSchema.virtual('isOverdue').get(function() {
    return this.status !== 'paid' && 
           this.status !== 'cancelled' && 
           this.dueDate < new Date();
});

// Days until due
paymentSchema.virtual('daysUntilDue').get(function() {
    if (this.status === 'paid') return 0;
    const days = Math.ceil((this.dueDate - new Date()) / (1000 * 60 * 60 * 24));
    return days;
});

// Update status based on payments
paymentSchema.methods.updatePaymentStatus = function() {
    if (this.amountPaid >= this.total) {
        this.status = 'paid';
        this.paidDate = new Date();
    } else if (this.amountPaid > 0) {
        this.status = 'partial';
    } else if (this.isOverdue) {
        this.status = 'overdue';
    }
    return this.status;
};

// Pre-save middleware
paymentSchema.pre('save', async function(next) {
    // Generate invoice number if not exists
    if (!this.invoiceNumber) {
        this.invoiceNumber = await this.constructor.generateInvoiceNumber();
    }
    
    // Calculate totals
    this.calculateTotals();
    
    // Update payment status
    this.updatePaymentStatus();
    
    // Calculate amount paid from payments array
    if (this.payments && this.payments.length > 0) {
        this.amountPaid = this.payments.reduce((acc, payment) => acc + payment.amount, 0);
    }
    
    next();
});

// Indexes
paymentSchema.index({ customer: 1, status: 1 });
paymentSchema.index({ invoiceNumber: 1 }, { unique: true });
paymentSchema.index({ dueDate: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);