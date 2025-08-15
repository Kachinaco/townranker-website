#!/bin/bash

# Copy original to working file
cp /var/www/townranker.com/index.html /var/www/townranker.com/index-new.html

# Extract content before modal (lines 1-2011)
head -n 2011 /var/www/townranker.com/index.html > /tmp/part1.html

# Add new modal section
cat /var/www/townranker.com/new-modal-section.html >> /tmp/part1.html

# Extract content after modal (lines 2238 onwards)
tail -n +2238 /var/www/townranker.com/index.html >> /tmp/part1.html

# Move the new file
mv /tmp/part1.html /var/www/townranker.com/index-with-modern-modal.html

echo "New index with modern modal created at index-with-modern-modal.html"