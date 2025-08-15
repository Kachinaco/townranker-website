const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    // Basic Information
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    
    // Project Details
    type: {
        type: String,
        enum: ['business', 'ecommerce', 'webapp', 'landing', 'custom'],
        required: true
    },
    status: {
        type: String,
        enum: ['planning', 'in-progress', 'review', 'completed', 'on-hold', 'cancelled'],
        default: 'planning'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    
    // Timeline
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    actualStartDate: Date,
    actualEndDate: Date,
    
    // Financial
    budget: {
        type: Number,
        required: true
    },
    actualCost: {
        type: Number,
        default: 0
    },
    profitMargin: {
        type: Number,
        default: 0
    },
    
    // Phases and Milestones
    phases: [{
        name: String,
        description: String,
        startDate: Date,
        endDate: Date,
        status: {
            type: String,
            enum: ['pending', 'in-progress', 'completed'],
            default: 'pending'
        },
        progress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        deliverables: [{
            name: String,
            completed: {
                type: Boolean,
                default: false
            },
            completedDate: Date
        }]
    }],
    
    // Tasks and Deliverables
    tasks: [{
        title: String,
        description: String,
        assignedTo: String,
        dueDate: Date,
        completed: {
            type: Boolean,
            default: false
        },
        completedDate: Date,
        priority: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'medium'
        }
    }],
    
    // Features and Requirements
    features: [{
        name: String,
        description: String,
        status: {
            type: String,
            enum: ['pending', 'in-progress', 'completed', 'cancelled'],
            default: 'pending'
        },
        completedDate: Date
    }],
    
    // Time Tracking
    timeEntries: [{
        description: String,
        hours: Number,
        date: Date,
        billable: {
            type: Boolean,
            default: true
        },
        user: String
    }],
    totalHours: {
        type: Number,
        default: 0
    },
    billableHours: {
        type: Number,
        default: 0
    },
    
    // Files and Documents
    files: [{
        name: String,
        url: String,
        type: String,
        size: Number,
        uploadedBy: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Communication
    meetings: [{
        title: String,
        date: Date,
        duration: Number,
        attendees: [String],
        notes: String
    }],
    
    // Access and Credentials
    credentials: [{
        service: String,
        username: String,
        password: String, // Should be encrypted
        url: String,
        notes: String
    }],
    
    // Technology Stack
    technologies: [String],
    repository: String,
    liveUrl: String,
    stagingUrl: String,
    
    // Team
    team: [{
        user: String,
        role: String,
        responsibilities: String,
        joinedDate: Date
    }],
    
    // Metadata
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

// Calculate project progress based on completed tasks and phases
projectSchema.methods.calculateProgress = function() {
    if (this.phases && this.phases.length > 0) {
        const totalPhases = this.phases.length;
        const completedPhases = this.phases.filter(p => p.status === 'completed').length;
        const phaseProgress = this.phases.reduce((acc, phase) => acc + (phase.progress || 0), 0);
        this.progress = Math.round(phaseProgress / totalPhases);
    } else if (this.tasks && this.tasks.length > 0) {
        const totalTasks = this.tasks.length;
        const completedTasks = this.tasks.filter(t => t.completed).length;
        this.progress = Math.round((completedTasks / totalTasks) * 100);
    }
    return this.progress;
};

// Calculate total hours
projectSchema.methods.calculateTotalHours = function() {
    if (this.timeEntries && this.timeEntries.length > 0) {
        this.totalHours = this.timeEntries.reduce((acc, entry) => acc + entry.hours, 0);
        this.billableHours = this.timeEntries
            .filter(entry => entry.billable)
            .reduce((acc, entry) => acc + entry.hours, 0);
    }
    return {
        total: this.totalHours,
        billable: this.billableHours
    };
};

// Check if project is overdue
projectSchema.virtual('isOverdue').get(function() {
    return this.status !== 'completed' && this.endDate < new Date();
});

// Calculate days remaining
projectSchema.virtual('daysRemaining').get(function() {
    if (this.status === 'completed') return 0;
    const days = Math.ceil((this.endDate - new Date()) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
});

// Auto-update progress before saving
projectSchema.pre('save', function(next) {
    this.calculateProgress();
    this.calculateTotalHours();
    
    // Calculate profit margin
    if (this.budget && this.actualCost) {
        this.profitMargin = ((this.budget - this.actualCost) / this.budget) * 100;
    }
    
    next();
});

// Index for search and performance
projectSchema.index({ customer: 1, status: 1 });
projectSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Project', projectSchema);