#!/bin/bash

# Submit TownRanker sitemap to search engines
# Run this script to notify search engines about the sitemap

SITEMAP_URL="https://townranker.com/sitemap.xml"
WWW_SITEMAP_URL="https://www.townranker.com/sitemap.xml"

echo "🔍 Submitting TownRanker sitemap to search engines..."
echo "================================================"

# Google
echo "📍 Submitting to Google..."
curl -s "https://www.google.com/ping?sitemap=${SITEMAP_URL}" > /dev/null
curl -s "https://www.google.com/ping?sitemap=${WWW_SITEMAP_URL}" > /dev/null
echo "✅ Google submission complete"

# Bing
echo "📍 Submitting to Bing..."
curl -s "https://www.bing.com/ping?sitemap=${SITEMAP_URL}" > /dev/null
curl -s "https://www.bing.com/ping?sitemap=${WWW_SITEMAP_URL}" > /dev/null
echo "✅ Bing submission complete"

# Yandex
echo "📍 Submitting to Yandex..."
curl -s "https://webmaster.yandex.com/ping?sitemap=${SITEMAP_URL}" > /dev/null
curl -s "https://webmaster.yandex.com/ping?sitemap=${WWW_SITEMAP_URL}" > /dev/null
echo "✅ Yandex submission complete"

# IndexNow (Bing, Yandex, Seznam.cz)
echo "📍 Submitting via IndexNow protocol..."
INDEXNOW_KEY="q9r8s7t6u5v4w3x2y1z0a9b8c7d6e5f4"
cat > /tmp/indexnow-townranker.json <<EOF
{
  "host": "townranker.com",
  "key": "${INDEXNOW_KEY}",
  "urlList": [
    "https://townranker.com/",
    "https://www.townranker.com/",
    "https://townranker.com/services.html",
    "https://townranker.com/about.html",
    "https://townranker.com/portfolio.html",
    "https://townranker.com/pricing.html",
    "https://townranker.com/blog.html",
    "https://townranker.com/login.html"
  ]
}
EOF

curl -s -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json" \
  -d @/tmp/indexnow-townranker.json > /dev/null
echo "✅ IndexNow submission complete"

# Clean up
rm -f /tmp/indexnow-townranker.json

echo ""
echo "================================================"
echo "✨ All search engine submissions complete for TownRanker!"
echo ""
echo "📋 Next steps:"
echo "1. Verify ownership in Google Search Console: https://search.google.com/search-console"
echo "2. Verify ownership in Bing Webmaster Tools: https://www.bing.com/webmasters"
echo "3. Verify ownership in Yandex Webmaster: https://webmaster.yandex.com"
echo "4. Monitor indexing status in each platform"
echo ""
echo "🔗 Verification files created:"
echo "   - /google8a1f2b3c4d5e6f7g.html"
echo "   - /BingSiteAuth.xml"
echo "   - /yandex_9a8b7c6d5e4f3g2h.html"