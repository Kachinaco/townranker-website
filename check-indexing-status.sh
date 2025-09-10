#!/bin/bash

# Check indexing status for TownRanker on various search engines

DOMAIN="townranker.com"
echo "🔍 Checking indexing status for ${DOMAIN}"
echo "================================================"
echo ""

# Google
echo "📊 Google Index Status:"
echo "------------------------"
GOOGLE_COUNT=$(curl -s "https://www.google.com/search?q=site:${DOMAIN}" | grep -o "About [0-9,]* results" | head -1 || echo "Unable to fetch")
echo "Indexed pages: ${GOOGLE_COUNT}"
echo ""

# Bing
echo "📊 Bing Index Status:"
echo "------------------------"
BING_COUNT=$(curl -s "https://www.bing.com/search?q=site:${DOMAIN}" | grep -o "[0-9,]* results" | head -1 || echo "Unable to fetch")
echo "Indexed pages: ${BING_COUNT}"
echo ""

# Check robots.txt accessibility
echo "🤖 Robots.txt Status:"
echo "------------------------"
ROBOTS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/robots.txt")
if [ "$ROBOTS_STATUS" = "200" ]; then
    echo "✅ Robots.txt is accessible (HTTP ${ROBOTS_STATUS})"
else
    echo "❌ Robots.txt issue (HTTP ${ROBOTS_STATUS})"
fi
echo ""

# Check sitemap accessibility
echo "🗺️ Sitemap Status:"
echo "------------------------"
SITEMAP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/sitemap.xml")
if [ "$SITEMAP_STATUS" = "200" ]; then
    echo "✅ Sitemap.xml is accessible (HTTP ${SITEMAP_STATUS})"
else
    echo "❌ Sitemap.xml issue (HTTP ${SITEMAP_STATUS})"
fi
echo ""

# Check main pages
echo "📄 Main Pages Status:"
echo "------------------------"
PAGES=("/" "/index.html" "/login.html" "/services.html" "/about.html" "/portfolio.html" "/pricing.html" "/blog.html")
for page in "${PAGES[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}${page}")
    if [ "$STATUS" = "200" ]; then
        echo "✅ ${page} - HTTP ${STATUS}"
    else
        echo "❌ ${page} - HTTP ${STATUS}"
    fi
done
echo ""

# Check SSL certificate
echo "🔒 SSL Certificate Status:"
echo "------------------------"
SSL_EXPIRY=$(echo | openssl s_client -servername ${DOMAIN} -connect ${DOMAIN}:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null | grep notAfter | cut -d= -f2)
if [ ! -z "$SSL_EXPIRY" ]; then
    echo "✅ SSL certificate valid until: ${SSL_EXPIRY}"
else
    echo "❌ Unable to check SSL certificate"
fi
echo ""

# Performance check
echo "⚡ Performance Check:"
echo "------------------------"
LOAD_TIME=$(curl -s -o /dev/null -w "%{time_total}" "https://${DOMAIN}")
echo "Homepage load time: ${LOAD_TIME}s"
echo ""

# Check verification files
echo "✔️ Verification Files Status:"
echo "------------------------"
VERIFY_FILES=("/google8a1f2b3c4d5e6f7g.html" "/BingSiteAuth.xml" "/yandex_9a8b7c6d5e4f3g2h.html" "/q9r8s7t6u5v4w3x2y1z0a9b8c7d6e5f4.txt")
for file in "${VERIFY_FILES[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}${file}")
    if [ "$STATUS" = "200" ]; then
        echo "✅ ${file} - HTTP ${STATUS}"
    else
        echo "❌ ${file} - HTTP ${STATUS}"
    fi
done
echo ""

echo "================================================"
echo "✨ Indexing status check complete for TownRanker!"
echo ""
echo "📋 Recommendations:"
echo "1. Submit sitemap via search console if not already done"
echo "2. Check for crawl errors in webmaster tools"
echo "3. Monitor indexing progress over next 24-48 hours"
echo "4. Ensure all important pages return HTTP 200"