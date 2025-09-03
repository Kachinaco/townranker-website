#!/bin/bash

# MongoDB Backup Cron Setup Script for TownRanker
# This script sets up automated database backups

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_SCRIPT="$SCRIPT_DIR/mongodb-backup.js"

echo "🔧 Setting up MongoDB backup automation for TownRanker..."

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"

# Create backup directory
BACKUP_DIR="$PROJECT_DIR/backups"
mkdir -p "$BACKUP_DIR"
echo "📁 Created backup directory: $BACKUP_DIR"

# Check if mongodump is installed
if ! command -v mongodump &> /dev/null; then
    echo "⚠️  mongodump is not installed. Installing mongodb-tools..."
    
    # Install mongodb-tools based on the system
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y mongodb-tools
    elif command -v yum &> /dev/null; then
        sudo yum install -y mongodb-tools
    elif command -v brew &> /dev/null; then
        brew install mongodb/brew/mongodb-database-tools
    else
        echo "❌ Could not install mongodb-tools automatically. Please install manually."
        exit 1
    fi
fi

# Test backup script
echo "🧪 Testing backup script..."
cd "$PROJECT_DIR"
node "$BACKUP_SCRIPT" stats || echo "First run - no backups exist yet"

# Setup cron jobs
echo "⏰ Setting up cron jobs..."

# Create temporary cron file
TEMP_CRON=$(mktemp)

# Preserve existing cron jobs (excluding our backup jobs)
crontab -l 2>/dev/null | grep -v "townranker-backup" > "$TEMP_CRON" || true

# Add backup cron jobs with labels
cat >> "$TEMP_CRON" << EOF

# TownRanker MongoDB Backup Jobs
# Daily full backup at 2 AM
0 2 * * * cd $PROJECT_DIR && /usr/bin/node $BACKUP_SCRIPT auto >> $BACKUP_DIR/backup.log 2>&1 # townranker-backup-daily

# Weekly cleanup at 3 AM on Sundays  
0 3 * * 0 cd $PROJECT_DIR && /usr/bin/node $BACKUP_SCRIPT cleanup >> $BACKUP_DIR/backup.log 2>&1 # townranker-backup-cleanup

# Incremental backup every 6 hours (skip 2 AM when full backup runs)
0 8,14,20 * * * cd $PROJECT_DIR && /usr/bin/node $BACKUP_SCRIPT backup incremental >> $BACKUP_DIR/backup.log 2>&1 # townranker-backup-incremental

EOF

# Install new cron jobs
crontab "$TEMP_CRON"
rm "$TEMP_CRON"

echo "✅ Cron jobs installed successfully!"
echo ""
echo "📋 Backup Schedule:"
echo "  • Full backup: Daily at 2:00 AM"
echo "  • Incremental backups: Every 6 hours (8 AM, 2 PM, 8 PM)"
echo "  • Cleanup old backups: Weekly on Sunday at 3:00 AM"
echo ""
echo "📁 Backup location: $BACKUP_DIR"
echo "📝 Backup log: $BACKUP_DIR/backup.log"
echo ""

# Create initial backup
echo "🚀 Creating initial backup..."
cd "$PROJECT_DIR"
node "$BACKUP_SCRIPT" backup full

echo ""
echo "✅ MongoDB backup automation setup complete!"
echo ""
echo "🔍 To check backup status:"
echo "  node $BACKUP_SCRIPT stats"
echo ""
echo "🏥 To generate health report:"
echo "  node $BACKUP_SCRIPT health"
echo ""
echo "📜 To view cron jobs:"
echo "  crontab -l | grep townranker-backup"
echo ""
echo "🗂️  To manually create a backup:"
echo "  node $BACKUP_SCRIPT backup [full|incremental]"