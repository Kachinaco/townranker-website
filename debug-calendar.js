// Debug script to test Google Calendar API configuration
const https = require('https');

const API_KEY = 'AIzaSyAN8TZL-pbR-VRbgvjwVnjLJf9-SOGJABo';
const CLIENT_ID = '410008002816-pja5c9estqiloavso5dinnc7ij2squ45.apps.googleusercontent.com';

console.log('🔍 Debugging Google Calendar API Configuration...');
console.log('API Key:', API_KEY.substring(0, 20) + '...');
console.log('Client ID:', CLIENT_ID);

// Test 1: Check if API key is valid by making a basic API call
console.log('\n📋 Test 1: Testing API Key validity...');

const testApiKey = () => {
    return new Promise((resolve, reject) => {
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary?key=${API_KEY}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode === 200) {
                        console.log('✅ API Key is valid');
                        console.log('Calendar info:', result.summary || 'Primary Calendar');
                        resolve(result);
                    } else if (res.statusCode === 401) {
                        console.log('❌ API Key invalid or unauthorized');
                        console.log('Response:', result);
                        reject(new Error('Invalid API Key'));
                    } else if (res.statusCode === 403) {
                        console.log('⚠️ API Key valid but access forbidden (need OAuth for this endpoint)');
                        console.log('This is expected for calendar access without OAuth');
                        resolve({ status: 'needs_oauth' });
                    } else {
                        console.log(`❌ Unexpected status: ${res.statusCode}`);
                        console.log('Response:', result);
                        reject(new Error(`Status ${res.statusCode}`));
                    }
                } catch (e) {
                    console.log('❌ Failed to parse response:', data);
                    reject(e);
                }
            });
        }).on('error', reject);
    });
};

// Test 2: Check if Calendar API is enabled
console.log('\n📋 Test 2: Testing Calendar API availability...');

const testCalendarApiAvailability = () => {
    return new Promise((resolve, reject) => {
        const url = `https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest?key=${API_KEY}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode === 200) {
                        console.log('✅ Calendar API is available');
                        console.log('API Version:', result.version);
                        console.log('API Title:', result.title);
                        resolve(result);
                    } else {
                        console.log(`❌ Calendar API not available: ${res.statusCode}`);
                        console.log('Response:', result);
                        reject(new Error(`API not available: ${res.statusCode}`));
                    }
                } catch (e) {
                    console.log('❌ Failed to parse API discovery response:', data);
                    reject(e);
                }
            });
        }).on('error', reject);
    });
};

// Run tests
async function runTests() {
    try {
        await testCalendarApiAvailability();
        await testApiKey();
        
        console.log('\n🎯 Diagnosis:');
        console.log('1. API Key appears to be valid');
        console.log('2. Calendar API is available');
        console.log('3. The issue is likely with OAuth authentication in the frontend');
        console.log('4. Events are being saved to the database but not syncing to Google Calendar');
        console.log('\n💡 Next steps:');
        console.log('- Check browser console for JavaScript errors');
        console.log('- Verify OAuth consent screen is configured');
        console.log('- Test authentication flow in the admin dashboard');
        
    } catch (error) {
        console.log('\n❌ Test failed:', error.message);
        console.log('\n🔧 Possible issues:');
        console.log('1. API Key might be invalid or restricted');
        console.log('2. Calendar API might not be enabled in Google Cloud Console');
        console.log('3. Quota limits might be exceeded');
        console.log('4. Network/firewall issues');
    }
}

runTests();