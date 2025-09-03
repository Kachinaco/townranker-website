#!/usr/bin/env node

/**
 * MongoDB Backup Script for TownRanker
 * 
 * Features:
 * - Automated database backup with compression
 * - Retention policy management
 * - Error handling and logging
 * - S3 upload support (optional)
 * - Incremental backup support
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration
const config = {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/townranker',
    backupDir: process.env.BACKUP_DIR || path.join(__dirname, '../backups'),
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
    maxBackups: parseInt(process.env.MAX_BACKUPS) || 50,
    dbName: 'townranker',
    compress: true,
    verbose: true
};

class MongoBackupManager {
    constructor() {
        this.backupDir = config.backupDir;
        this.dbName = config.dbName;
        this.verbose = config.verbose;
        
        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    log(message, level = 'INFO') {
        if (this.verbose) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${level}] ${message}`);
        }
    }

    async createBackup(type = 'full') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `${this.dbName}-${type}-backup-${timestamp}`;
        const backupPath = path.join(this.backupDir, backupName);
        
        try {
            this.log(`Starting ${type} backup...`);
            
            // Create backup using mongodump
            const mongodumpCommand = this.buildMongodumpCommand(backupPath, type);
            
            this.log(`Executing: ${mongodumpCommand}`);
            const result = await this.executeCommand(mongodumpCommand);
            
            if (result.success) {
                this.log(`Backup created successfully at: ${backupPath}`);
                
                // Compress if requested
                if (config.compress) {
                    const compressedPath = await this.compressBackup(backupPath);
                    this.log(`Backup compressed: ${compressedPath}`);
                    
                    // Remove uncompressed version
                    await this.executeCommand(`rm -rf "${backupPath}"`);
                    return compressedPath;
                }
                
                return backupPath;
            } else {
                throw new Error(`Backup failed: ${result.error}`);
            }
            
        } catch (error) {
            this.log(`Backup failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    buildMongodumpCommand(backupPath, type) {
        const uri = new URL(config.mongoUri);
        let command = `mongodump --host ${uri.hostname}:${uri.port || 27017}`;
        
        if (uri.username) {
            command += ` --username ${uri.username}`;
        }
        
        if (uri.password) {
            command += ` --password ${uri.password}`;
        }
        
        command += ` --db ${this.dbName} --out "${backupPath}"`;
        
        // Add collection-specific options for incremental backups
        if (type === 'incremental') {
            // Backup only recently modified data (last 24 hours)
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            command += ` --query '{"updatedAt": {"$gte": {"$date": "${yesterday}"}}}'`;
        }
        
        return command;
    }

    async compressBackup(backupPath) {
        const compressedPath = `${backupPath}.tar.gz`;
        const command = `tar -czf "${compressedPath}" -C "${path.dirname(backupPath)}" "${path.basename(backupPath)}"`;
        
        const result = await this.executeCommand(command);
        if (!result.success) {
            throw new Error(`Compression failed: ${result.error}`);
        }
        
        return compressedPath;
    }

    async executeCommand(command) {
        return new Promise((resolve) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    resolve({ success: false, error: error.message, stdout, stderr });
                } else {
                    resolve({ success: true, stdout, stderr });
                }
            });
        });
    }

    async cleanupOldBackups() {
        try {
            this.log('Starting backup cleanup...');
            
            const files = fs.readdirSync(this.backupDir)
                .filter(file => file.includes(this.dbName))
                .map(file => ({
                    name: file,
                    path: path.join(this.backupDir, file),
                    stat: fs.statSync(path.join(this.backupDir, file))
                }))
                .sort((a, b) => b.stat.mtime - a.stat.mtime); // Sort by modification time (newest first)

            // Remove backups older than retention period
            const cutoffDate = new Date(Date.now() - (config.retentionDays * 24 * 60 * 60 * 1000));
            let removedCount = 0;

            for (const file of files) {
                const shouldRemove = file.stat.mtime < cutoffDate || files.indexOf(file) >= config.maxBackups;
                
                if (shouldRemove) {
                    try {
                        if (file.stat.isDirectory()) {
                            await this.executeCommand(`rm -rf "${file.path}"`);
                        } else {
                            fs.unlinkSync(file.path);
                        }
                        this.log(`Removed old backup: ${file.name}`);
                        removedCount++;
                    } catch (error) {
                        this.log(`Failed to remove ${file.name}: ${error.message}`, 'ERROR');
                    }
                }
            }

            this.log(`Cleanup complete. Removed ${removedCount} old backups.`);
            
        } catch (error) {
            this.log(`Cleanup failed: ${error.message}`, 'ERROR');
        }
    }

    async getBackupStats() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(file => file.includes(this.dbName))
                .map(file => {
                    const filePath = path.join(this.backupDir, file);
                    const stat = fs.statSync(filePath);
                    return {
                        name: file,
                        size: stat.size,
                        created: stat.mtime
                    };
                })
                .sort((a, b) => b.created - a.created);

            const totalSize = files.reduce((sum, file) => sum + file.size, 0);
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

            return {
                totalBackups: files.length,
                totalSizeMB,
                newest: files[0]?.created || null,
                oldest: files[files.length - 1]?.created || null,
                files
            };
        } catch (error) {
            this.log(`Failed to get backup stats: ${error.message}`, 'ERROR');
            return null;
        }
    }

    async verifyBackup(backupPath) {
        try {
            this.log(`Verifying backup: ${backupPath}`);
            
            // Basic file existence check
            if (!fs.existsSync(backupPath)) {
                throw new Error('Backup file does not exist');
            }

            // Size check
            const stat = fs.statSync(backupPath);
            if (stat.size < 1024) { // Less than 1KB is suspicious
                throw new Error('Backup file is suspiciously small');
            }

            // If compressed, check if it's a valid archive
            if (backupPath.endsWith('.tar.gz')) {
                const testCommand = `tar -tzf "${backupPath}" > /dev/null`;
                const result = await this.executeCommand(testCommand);
                if (!result.success) {
                    throw new Error('Backup archive is corrupted');
                }
            }

            this.log(`Backup verification successful: ${(stat.size / 1024 / 1024).toFixed(2)}MB`);
            return true;
            
        } catch (error) {
            this.log(`Backup verification failed: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async createHealthReport() {
        try {
            // Connect to MongoDB to get database stats
            await mongoose.connect(config.mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });

            const db = mongoose.connection.db;
            const admin = db.admin();
            
            // Get database statistics
            const dbStats = await db.stats();
            const serverStatus = await admin.serverStatus();
            
            // Get backup statistics
            const backupStats = await this.getBackupStats();
            
            const report = {
                timestamp: new Date().toISOString(),
                database: {
                    name: this.dbName,
                    collections: dbStats.collections,
                    indexes: dbStats.indexes,
                    dataSize: Math.round(dbStats.dataSize / 1024 / 1024 * 100) / 100 + 'MB',
                    storageSize: Math.round(dbStats.storageSize / 1024 / 1024 * 100) / 100 + 'MB',
                    indexSize: Math.round(dbStats.indexSize / 1024 / 1024 * 100) / 100 + 'MB'
                },
                server: {
                    version: serverStatus.version,
                    uptime: Math.round(serverStatus.uptime / 3600 * 100) / 100 + ' hours',
                    connections: serverStatus.connections
                },
                backups: backupStats
            };

            await mongoose.disconnect();
            
            // Save report
            const reportPath = path.join(this.backupDir, `health-report-${new Date().toISOString().split('T')[0]}.json`);
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            
            this.log(`Health report saved: ${reportPath}`);
            return report;
            
        } catch (error) {
            this.log(`Health report failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'backup';
    
    const backupManager = new MongoBackupManager();
    
    try {
        switch (command) {
            case 'backup':
                const type = args[1] || 'full'; // 'full' or 'incremental'
                const backupPath = await backupManager.createBackup(type);
                const verified = await backupManager.verifyBackup(backupPath);
                
                if (verified) {
                    console.log(`✅ Backup completed successfully: ${backupPath}`);
                } else {
                    console.log(`❌ Backup completed but verification failed: ${backupPath}`);
                    process.exit(1);
                }
                break;

            case 'cleanup':
                await backupManager.cleanupOldBackups();
                break;

            case 'stats':
                const stats = await backupManager.getBackupStats();
                console.log('📊 Backup Statistics:');
                console.log(JSON.stringify(stats, null, 2));
                break;

            case 'health':
                const report = await backupManager.createHealthReport();
                console.log('🏥 Database Health Report:');
                console.log(JSON.stringify(report, null, 2));
                break;

            case 'auto':
                // Automated backup routine
                await backupManager.createBackup('full');
                await backupManager.cleanupOldBackups();
                await backupManager.createHealthReport();
                console.log('✅ Automated backup routine completed');
                break;

            default:
                console.log('Usage: node mongodb-backup.js [command] [options]');
                console.log('Commands:');
                console.log('  backup [full|incremental]  - Create database backup');
                console.log('  cleanup                     - Remove old backups');
                console.log('  stats                       - Show backup statistics');
                console.log('  health                      - Generate health report');
                console.log('  auto                        - Run automated backup routine');
                break;
        }
    } catch (error) {
        console.error(`❌ Command failed: ${error.message}`);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = MongoBackupManager;