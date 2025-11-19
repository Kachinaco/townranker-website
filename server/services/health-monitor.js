/**
 * TownRanker Health Monitoring System
 * Monitors critical infrastructure and sends alerts to Slack
 */

const mongoose = require('mongoose');

let lastHealthStatus = {
  server: true,
  database: true,
  memory: true
};

/**
 * Send health alert to Slack
 */
async function sendHealthAlert(alert) {
  const webhookUrl = process.env.SLACK_WEBHOOK_HEALTH;

  if (!webhookUrl) {
    console.log('⚠️  Slack health webhook not configured - skipping health alert');
    return false;
  }

  try {
    // Determine emoji and color based on severity
    const emoji = alert.severity === 'critical' ? '🔴' :
                  alert.severity === 'warning' ? '⚠️' : 'ℹ️';

    // Create Slack message
    const slackMessage = {
      text: `${emoji} ${alert.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} ${alert.title}`,
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: alert.message
          }
        }
      ]
    };

    // Add details if available
    if (alert.details && Object.keys(alert.details).length > 0) {
      const fields = Object.entries(alert.details).map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:*\n${value}`
      }));

      slackMessage.blocks.push({
        type: 'section',
        fields: fields.slice(0, 10) // Max 10 fields
      });
    }

    // Add timestamp
    slackMessage.blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🕒 ${new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' })} MST | 🖥️ townranker.com`
          }
        ]
      }
    );

    // Send to Slack
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      console.error('Failed to send health alert to Slack:', response.statusText);
      return false;
    }

    console.log(`✅ Health alert sent to Slack: ${alert.title}`);
    return true;

  } catch (error) {
    console.error('Error sending health alert to Slack:', error);
    return false;
  }
}

/**
 * Check server health
 */
async function checkServerHealth() {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const memPercent = Math.round((memUsedMB / memTotalMB) * 100);

    // Alert if memory usage is high (>80%)
    if (memPercent > 80 && lastHealthStatus.memory) {
      await sendHealthAlert({
        severity: 'warning',
        title: 'High Memory Usage Detected',
        message: `Server memory usage is at ${memPercent}% (${memUsedMB}MB / ${memTotalMB}MB)`,
        details: {
          'Memory Used': `${memUsedMB} MB`,
          'Memory Total': `${memTotalMB} MB`,
          'Usage Percent': `${memPercent}%`,
          'Uptime': formatUptime(uptime)
        }
      });
      lastHealthStatus.memory = false;
    } else if (memPercent <= 70 && !lastHealthStatus.memory) {
      // Memory back to normal
      await sendHealthAlert({
        severity: 'info',
        title: 'Memory Usage Normalized',
        message: `Server memory usage is back to normal at ${memPercent}%`,
        details: {
          'Memory Used': `${memUsedMB} MB`,
          'Usage Percent': `${memPercent}%`
        }
      });
      lastHealthStatus.memory = true;
    }

  } catch (error) {
    console.error('Error checking server health:', error);
  }
}

/**
 * Check database connectivity
 */
async function checkDatabaseHealth() {
  try {
    const dbState = mongoose.connection.readyState;
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting

    if (dbState === 1) {
      // Database is connected - send recovery alert if it was down
      if (!lastHealthStatus.database) {
        await sendHealthAlert({
          severity: 'info',
          title: 'Database Connection Restored',
          message: 'MongoDB database connection has been re-established',
          details: {
            'Database': 'MongoDB',
            'Status': 'Connected',
            'URI': process.env.MONGODB_URI?.replace(/\/\/.*@/, '//***@') || 'Not configured'
          }
        });
        lastHealthStatus.database = true;
      }
    } else {
      // Database is down
      if (lastHealthStatus.database) {
        await sendHealthAlert({
          severity: 'critical',
          title: 'Database Connection Failed',
          message: 'Unable to connect to MongoDB database. Website functionality may be impaired.',
          details: {
            'Database': 'MongoDB',
            'Status': 'Disconnected',
            'State Code': dbState.toString(),
            'Impact': 'CRM functionality may be affected'
          }
        });
        lastHealthStatus.database = false;
      }
    }

  } catch (error) {
    console.error('Error checking database health:', error);
  }
}

/**
 * Send comprehensive status report to Slack
 */
async function sendStatusReport() {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const memPercent = Math.round((memUsedMB / memTotalMB) * 100);

    // Determine overall health status
    const isHealthy = memPercent < 80;
    const statusEmoji = isHealthy ? '🟢' : '🟡';
    const statusText = isHealthy ? 'Healthy' : 'Warning';

    // Check database status
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? '🟢 Connected' : '🔴 Disconnected';

    await sendHealthAlert({
      severity: 'info',
      title: `${statusEmoji} System Status Report`,
      message: `Automated health check - Server is ${statusText.toLowerCase()}`,
      details: {
        'Status': `${statusEmoji} ${statusText}`,
        'Uptime': formatUptime(uptime),
        'Memory Usage': `${memUsedMB} MB / ${memTotalMB} MB (${memPercent}%)`,
        'Database': dbStatus,
        'Node Version': process.version,
        'Environment': process.env.NODE_ENV || 'development'
      }
    });

    console.log(`📊 Status report sent - Uptime: ${formatUptime(uptime)}, Memory: ${memPercent}%`);

  } catch (error) {
    console.error('Error sending status report:', error);
  }
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ') || '< 1m';
}

/**
 * Run all health checks
 */
async function runHealthChecks() {
  await checkServerHealth();
  await checkDatabaseHealth();

  // Send status report after checks
  await sendStatusReport();
}

/**
 * Send startup notification
 */
async function sendStartupNotification() {
  const memUsage = process.memoryUsage();
  const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);

  await sendHealthAlert({
    severity: 'info',
    title: '✅ Server Started Successfully',
    message: 'TownRanker backend server has started and is ready to accept requests',
    details: {
      'Server': 'townranker.com',
      'Port': process.env.PORT || '3001',
      'Environment': process.env.NODE_ENV || 'development',
      'Memory': `${memUsedMB} MB`,
      'Node Version': process.version
    }
  });
}

/**
 * Send error notification
 */
async function sendErrorNotification(error, context) {
  await sendHealthAlert({
    severity: 'critical',
    title: `Server Error${context ? `: ${context}` : ''}`,
    message: `An unhandled error occurred: ${error.message}`,
    details: {
      'Error': error.message,
      'Stack': error.stack?.split('\n').slice(0, 5).join('\n') || 'No stack trace',
      'Context': context || 'Unknown',
      'Time': new Date().toISOString()
    }
  });
}

/**
 * Start health monitoring
 * Runs checks every 5 minutes and sends status reports
 */
function startHealthMonitoring() {
  console.log('🏥 Starting health monitoring system...');

  // Run initial check after 30 seconds
  setTimeout(async () => {
    console.log('Running initial health check...');
    await runHealthChecks();
  }, 30000);

  // Run checks and send status report every 24 hours
  setInterval(async () => {
    console.log('Running scheduled health check...');
    await runHealthChecks();
  }, 24 * 60 * 60 * 1000); // 24 hours

  console.log('✅ Health monitoring system started - status reports every 24 hours');
}

module.exports = {
  startHealthMonitoring,
  sendStartupNotification,
  sendErrorNotification,
  sendHealthAlert
};
