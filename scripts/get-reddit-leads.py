#!/usr/bin/env python3
"""
Extract Reddit leads from n8n execution history.
Queries the n8n SQLite database and extracts leads found by the Reddit Monitor workflow.
"""

import sqlite3
import json
import sys
import zlib
import re
from datetime import datetime

# Configuration
DB_PATH = '/var/lib/docker/volumes/n8n_data/_data/database.sqlite'
WORKFLOW_ID = '1tn68GcPGdOPOXJS'  # Reddit Monitor - East Mesa & Phoenix

def clean_html_content(content):
    """Clean HTML tags and artifacts from Reddit content."""
    if not content:
        return ''

    # Remove HTML comments
    content = re.sub(r'!--.*?--', '', content)

    # Remove HTML tags (including malformed ones without quotes)
    content = re.sub(r'<[^>]*>', '', content)
    content = re.sub(r'div class=\s*\w+', '', content)
    content = re.sub(r'span class=\s*\w+', '', content)
    content = re.sub(r'a href=\s*[^\s>]+', '', content)
    content = re.sub(r'/div', '', content)
    content = re.sub(r'/span', '', content)
    content = re.sub(r'/a', '', content)
    content = re.sub(r'/p', '', content)
    content = re.sub(r'\bp\b', '', content)
    content = re.sub(r'\bmd\b', '', content)
    content = re.sub(r'\bbr\b', '', content)

    # Remove HTML entities
    content = re.sub(r'&[a-zA-Z0-9#]+;', ' ', content)
    content = re.sub(r'#\d+;', '', content)

    # Remove Reddit-specific artifacts
    content = re.sub(r'submitted by', '', content)
    content = re.sub(r'\[link\]', '', content)
    content = re.sub(r'\[comments\]', '', content)

    # Clean up whitespace
    content = re.sub(r'\s+', ' ', content)
    content = content.strip()

    return content

def deref(val, data):
    """Recursively dereference string indices in n8n's indexed data format."""
    if isinstance(val, str) and val.isdigit():
        idx = int(val)
        if idx < len(data):
            return deref(data[idx], data)
    elif isinstance(val, dict):
        return {k: deref(v, data) for k, v in val.items()}
    elif isinstance(val, list):
        return [deref(v, data) for v in val]
    return val

def extract_leads_from_execution(data):
    """Extract lead objects from execution data array."""
    leads = []

    for i in range(len(data)):
        item = data[i]
        if isinstance(item, dict):
            # Check if this looks like a lead (has title, subreddit, and link)
            if 'title' in item and 'subreddit' in item and 'link' in item:
                lead = deref(item, data)
                leads.append(lead)

    return leads

def get_leads(limit=50, offset=0):
    """Query n8n database and extract leads from recent executions."""
    all_leads = []

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Get recent successful executions for our workflow
        cursor.execute('''
            SELECT e.id, e."startedAt", e."stoppedAt", e.status, d.data
            FROM execution_entity e
            JOIN execution_data d ON e.id = d."executionId"
            WHERE e."workflowId" = ?
            AND e.status = 'success'
            ORDER BY e."startedAt" DESC
            LIMIT 200
        ''', (WORKFLOW_ID,))

        rows = cursor.fetchall()

        for row in rows:
            exec_id, started_at, stopped_at, status, data_blob = row

            try:
                # Try to decompress if it's compressed
                if isinstance(data_blob, bytes):
                    try:
                        data_blob = zlib.decompress(data_blob).decode('utf-8')
                    except:
                        data_blob = data_blob.decode('utf-8')

                # Parse JSON
                exec_data = json.loads(data_blob)

                # Extract the data array (could be nested)
                data_array = None
                if isinstance(exec_data, list):
                    data_array = exec_data
                elif isinstance(exec_data, dict):
                    if 'data' in exec_data:
                        data_array = exec_data['data']
                    elif 'resultData' in exec_data:
                        result = exec_data['resultData']
                        if isinstance(result, dict) and 'runData' in result:
                            # Try to find data in runData
                            run_data = result['runData']
                            for node_name, node_data in run_data.items():
                                if isinstance(node_data, list):
                                    for run in node_data:
                                        if isinstance(run, dict) and 'data' in run:
                                            main_data = run['data'].get('main', [[]])
                                            if main_data and len(main_data) > 0:
                                                for item_list in main_data:
                                                    if isinstance(item_list, list):
                                                        for item in item_list:
                                                            if isinstance(item, dict) and 'json' in item:
                                                                lead_data = item['json']
                                                                if 'title' in lead_data and 'link' in lead_data:
                                                                    lead_data['foundAt'] = started_at
                                                                    lead_data['executionId'] = exec_id
                                                                    all_leads.append(lead_data)

                # Also try the indexed array format we discovered
                if data_array and isinstance(data_array, list):
                    leads = extract_leads_from_execution(data_array)
                    for lead in leads:
                        lead['foundAt'] = started_at
                        lead['executionId'] = exec_id
                        all_leads.append(lead)

            except Exception as e:
                # Skip executions we can't parse
                continue

        conn.close()

    except Exception as e:
        return {'error': str(e), 'leads': [], 'total': 0}

    # Deduplicate leads by link URL
    seen_links = set()
    unique_leads = []
    for lead in all_leads:
        link = lead.get('link', '')
        if link and link not in seen_links:
            seen_links.add(link)
            unique_leads.append(lead)

    # Sort by foundAt date (newest first)
    unique_leads.sort(key=lambda x: x.get('foundAt', ''), reverse=True)

    # Apply pagination
    total = len(unique_leads)
    paginated = unique_leads[offset:offset + limit]

    # Normalize lead format for frontend
    normalized_leads = []
    for lead in paginated:
        normalized = {
            'id': lead.get('executionId', ''),
            'title': lead.get('title', 'Untitled'),
            'subreddit': lead.get('subreddit', '').replace('r/', ''),
            'author': lead.get('author', '').replace('u/', ''),
            'link': lead.get('link', ''),
            'content': clean_html_content(lead.get('content', ''))[:300] if lead.get('content') else '',
            'priority': lead.get('priority', 'Medium'),
            'score': lead.get('score', 0),
            'keywords': lead.get('highKeywords', lead.get('keywords', '')),
            'location': lead.get('location', ''),
            'foundAt': lead.get('foundAt', ''),
            'pubDate': lead.get('pubDate', '')
        }
        normalized_leads.append(normalized)

    return {
        'leads': normalized_leads,
        'total': total,
        'limit': limit,
        'offset': offset
    }

if __name__ == '__main__':
    # Parse command line args
    limit = 50
    offset = 0

    for i, arg in enumerate(sys.argv[1:]):
        if arg == '--limit' and i + 2 < len(sys.argv):
            limit = int(sys.argv[i + 2])
        elif arg == '--offset' and i + 2 < len(sys.argv):
            offset = int(sys.argv[i + 2])

    result = get_leads(limit=limit, offset=offset)
    print(json.dumps(result, indent=2))
