/**
 * Visitor Tracking Service for TownRanker
 * Sends ultra-detailed visitor data to Slack
 */

// Store visitor data for daily summaries
let dailyVisitors = [];

/**
 * Calculate engagement score from visitor behavior
 */
function calculateEngagementScore(behavior) {
  if (!behavior) return 0;

  let score = 0;

  // Time on page (up to 40 points)
  const timeScore = Math.min((behavior.timeOnPage / 300) * 40, 40); // Max at 5 minutes
  score += timeScore;

  // Scroll depth (up to 30 points)
  score += (behavior.maxScrollDepth / 100) * 30;

  // Interactions (up to 30 points)
  const interactionScore = Math.min(
    (behavior.clicks || 0) * 5 +
    ((behavior.keyPresses || 0) / 10) * 2 +
    ((behavior.touches || 0) / 5) * 3,
    30
  );
  score += interactionScore;

  return Math.min(Math.round(score), 100);
}

/**
 * Get engagement label
 */
function getEngagementLabel(score) {
  if (score >= 75) return '🔥 Very High';
  if (score >= 50) return '⚡ High';
  if (score >= 25) return '👀 Medium';
  return '📊 Low';
}

/**
 * Get OS info from user agent
 */
function getOSInfo(userAgent) {
  if (!userAgent) return 'Unknown';

  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';

  return 'Unknown';
}

/**
 * Format milliseconds
 */
function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Send visitor notification to Slack
 */
async function sendSlackVisitorNotification(visitor) {
  const webhookUrl = process.env.SLACK_WEBHOOK_VISITORS || process.env.SLACK_WEBHOOK_HEALTH;

  if (!webhookUrl) {
    console.log('⚠️  Slack visitor webhook not configured - skipping visitor notification');
    return false;
  }

  try {
    // Store for daily summary
    dailyVisitors.push({
      ...visitor,
      timestamp: new Date()
    });

    const engagementScore = calculateEngagementScore(visitor.behavior);
    const engagementLabel = getEngagementLabel(engagementScore);
    const os = getOSInfo(visitor.userAgent);

    // Build Slack message blocks
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `👤 New Site Visitor | ${engagementLabel}`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Page:*\n${visitor.page || 'Unknown'}`
          },
          {
            type: 'mrkdwn',
            text: `*Engagement:*\n${engagementScore}% ${engagementLabel}`
          }
        ]
      }
    ];

    // Add navigation info
    if (visitor.referrer || visitor.pageTitle) {
      const navFields = [];
      if (visitor.pageTitle) {
        navFields.push({
          type: 'mrkdwn',
          text: `*Page Title:*\n${visitor.pageTitle}`
        });
      }
      if (visitor.referrer) {
        navFields.push({
          type: 'mrkdwn',
          text: `*Referrer:*\n${visitor.referrer || 'Direct'}`
        });
      }
      blocks.push({
        type: 'section',
        fields: navFields
      });
    }

    // Add UTM campaign data if available
    if (visitor.utm && (visitor.utm.source || visitor.utm.campaign)) {
      blocks.push({
        type: 'divider'
      });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📊 UTM Campaign Data:*'
        }
      });

      const utmFields = [];
      if (visitor.utm.source) utmFields.push({ type: 'mrkdwn', text: `*Source:*\n${visitor.utm.source}` });
      if (visitor.utm.medium) utmFields.push({ type: 'mrkdwn', text: `*Medium:*\n${visitor.utm.medium}` });
      if (visitor.utm.campaign) utmFields.push({ type: 'mrkdwn', text: `*Campaign:*\n${visitor.utm.campaign}` });
      if (visitor.utm.term) utmFields.push({ type: 'mrkdwn', text: `*Term:*\n${visitor.utm.term}` });

      if (utmFields.length > 0) {
        blocks.push({
          type: 'section',
          fields: utmFields
        });
      }
    }

    // Add session journey
    if (visitor.sessionPageCount > 0) {
      blocks.push({
        type: 'divider'
      });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🗺️ Session Journey:*\nPage ${visitor.sessionPageCount} in session`
        }
      });
    }

    // Add device info
    blocks.push({
      type: 'divider'
    });
    const deviceFields = [
      {
        type: 'mrkdwn',
        text: `*OS:*\n${os}`
      },
      {
        type: 'mrkdwn',
        text: `*Browser:*\n${visitor.userAgent ? visitor.userAgent.split(' ')[0] : 'Unknown'}`
      }
    ];
    if (visitor.screen) {
      deviceFields.push({
        type: 'mrkdwn',
        text: `*Screen:*\n${visitor.screen.width}x${visitor.screen.height}`
      });
    }
    if (visitor.language) {
      deviceFields.push({
        type: 'mrkdwn',
        text: `*Language:*\n${visitor.language}`
      });
    }
    blocks.push({
      type: 'section',
      fields: deviceFields
    });

    // Add location if available
    if (visitor.location) {
      blocks.push({
        type: 'divider'
      });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📍 Location & Network:*`
        }
      });

      const locationFields = [];
      if (visitor.location.city) {
        locationFields.push({
          type: 'mrkdwn',
          text: `*Location:*\n${visitor.location.city}, ${visitor.location.region || ''}`
        });
      }
      if (visitor.location.isp) {
        locationFields.push({
          type: 'mrkdwn',
          text: `*ISP:*\n${visitor.location.isp}`
        });
      }
      if (visitor.ip) {
        locationFields.push({
          type: 'mrkdwn',
          text: `*IP:*\n${visitor.ip}`
        });
      }
      if (visitor.location.timezone) {
        locationFields.push({
          type: 'mrkdwn',
          text: `*Timezone:*\n${visitor.location.timezone}`
        });
      }

      blocks.push({
        type: 'section',
        fields: locationFields
      });
    }

    // Add behavioral metrics
    if (visitor.behavior) {
      blocks.push({
        type: 'divider'
      });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🎯 Behavioral Metrics (Score: ${engagementScore}%):*`
        }
      });

      const behaviorFields = [];
      if (visitor.behavior.timeOnPage) {
        behaviorFields.push({
          type: 'mrkdwn',
          text: `*Time on Page:*\n${visitor.behavior.timeOnPage}s`
        });
      }
      if (visitor.behavior.maxScrollDepth !== undefined) {
        behaviorFields.push({
          type: 'mrkdwn',
          text: `*Scroll Depth:*\n${visitor.behavior.maxScrollDepth}%`
        });
      }
      if (visitor.behavior.clicks !== undefined) {
        behaviorFields.push({
          type: 'mrkdwn',
          text: `*Clicks:*\n${visitor.behavior.clicks}`
        });
      }
      if (visitor.behavior.mouseMovements !== undefined) {
        behaviorFields.push({
          type: 'mrkdwn',
          text: `*Mouse Movements:*\n${visitor.behavior.mouseMovements}`
        });
      }

      blocks.push({
        type: 'section',
        fields: behaviorFields
      });
    }

    // Add performance metrics
    if (visitor.performance) {
      blocks.push({
        type: 'divider'
      });
      const perfFields = [];
      if (visitor.performance.pageLoad) {
        perfFields.push({
          type: 'mrkdwn',
          text: `*Page Load:*\n${formatMs(visitor.performance.pageLoad)}`
        });
      }
      if (visitor.performance.domReady) {
        perfFields.push({
          type: 'mrkdwn',
          text: `*DOM Ready:*\n${formatMs(visitor.performance.domReady)}`
        });
      }

      if (perfFields.length > 0) {
        blocks.push({
          type: 'section',
          fields: perfFields
        });
      }
    }

    // Add timestamp
    blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🕒 ${new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' })} MST | 🖥️ townranker.com | 🆔 ${visitor.sessionId || 'N/A'}`
          }
        ]
      }
    );

    const slackMessage = {
      text: `👤 New Visitor: ${visitor.page || 'Unknown Page'}`,
      blocks: blocks
    };

    // Send to Slack
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      console.error('Failed to send visitor notification to Slack:', response.statusText);
      return false;
    }

    console.log(`✅ Visitor notification sent to Slack: ${visitor.page}`);
    return true;

  } catch (error) {
    console.error('Error sending visitor notification to Slack:', error);
    return false;
  }
}

/**
 * Send daily visitor summary to Slack
 */
async function sendDailySummary() {
  const webhookUrl = process.env.SLACK_WEBHOOK_VISITORS || process.env.SLACK_WEBHOOK_HEALTH;

  if (!webhookUrl) {
    console.log('⚠️  Slack visitor webhook not configured - skipping daily summary');
    return false;
  }

  if (dailyVisitors.length === 0) {
    console.log('📊 No visitors today - skipping daily summary');
    return false;
  }

  try {
    // Calculate statistics
    const totalVisitors = dailyVisitors.length;
    const uniqueSessions = new Set(dailyVisitors.map(v => v.sessionId)).size;
    const avgEngagement = Math.round(
      dailyVisitors.reduce((sum, v) => sum + calculateEngagementScore(v.behavior), 0) / totalVisitors
    );

    // Calculate popular pages
    const pageViews = {};
    dailyVisitors.forEach(v => {
      const page = v.page || 'Unknown';
      pageViews[page] = (pageViews[page] || 0) + 1;
    });
    const topPages = Object.entries(pageViews)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Calculate top locations
    const locations = {};
    dailyVisitors.forEach(v => {
      if (v.location && v.location.city) {
        const loc = `${v.location.city}, ${v.location.region || v.location.country || ''}`;
        locations[loc] = (locations[loc] || 0) + 1;
      }
    });
    const topLocations = Object.entries(locations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Calculate high engagement visitors
    const highEngagement = dailyVisitors.filter(v =>
      calculateEngagementScore(v.behavior) >= 75
    ).length;

    // Build summary message
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Daily Visitor Summary - TownRanker',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Summary for ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}*`
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Total Page Views:*\n${totalVisitors}`
          },
          {
            type: 'mrkdwn',
            text: `*Unique Sessions:*\n${uniqueSessions}`
          },
          {
            type: 'mrkdwn',
            text: `*Avg Engagement:*\n${avgEngagement}%`
          },
          {
            type: 'mrkdwn',
            text: `*High Engagement:*\n${highEngagement} visitors (${Math.round((highEngagement/totalVisitors)*100)}%)`
          }
        ]
      }
    ];

    // Add top pages
    if (topPages.length > 0) {
      blocks.push({
        type: 'divider'
      });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📄 Top Pages:*\n' + topPages.map((([page, count]) =>
            `• ${page} - ${count} views`
          )).join('\n')
        }
      });
    }

    // Add top locations
    if (topLocations.length > 0) {
      blocks.push({
        type: 'divider'
      });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📍 Top Locations:*\n' + topLocations.map(([loc, count]) =>
            `• ${loc} - ${count} visitors`
          ).join('\n')
        }
      });
    }

    // Add timestamp
    blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🕒 Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' })} MST`
          }
        ]
      }
    );

    const slackMessage = {
      text: `📊 Daily Visitor Summary: ${totalVisitors} visitors, ${uniqueSessions} sessions`,
      blocks: blocks
    };

    // Send to Slack
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      console.error('Failed to send daily summary to Slack:', response.statusText);
      return false;
    }

    console.log(`✅ Daily visitor summary sent to Slack: ${totalVisitors} visitors`);

    // Reset daily visitors
    dailyVisitors = [];

    return true;

  } catch (error) {
    console.error('Error sending daily summary to Slack:', error);
    return false;
  }
}

/**
 * Get daily visitor count
 */
function getDailyVisitorCount() {
  return dailyVisitors.length;
}

module.exports = {
  sendSlackVisitorNotification,
  sendDailySummary,
  getDailyVisitorCount
};
