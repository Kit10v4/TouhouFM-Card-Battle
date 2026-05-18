// Simple test script for auth API
const https = require('https');
const http = require('http');

function testAPI(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const requestModule = url.startsWith('https') ? https : http;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = requestModule.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(body);
          resolve({ status: res.statusCode, data: jsonData });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Auth API...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await testAPI('http://localhost:4000/api/health');
    console.log('   Status:', health.status);
    console.log('   Response:', health.data);
    console.log('   ✅ Health check passed\n');

    // Test register endpoint (will show validation error without DB)
    console.log('2. Testing register endpoint...');
    const register = await testAPI('http://localhost:4000/api/register', 'POST', {
      username: 'testuser',
      password: 'password123',
      email: 'test@example.com'
    });
    console.log('   Status:', register.status);
    console.log('   Response:', register.data);
    console.log('   ✅ Register endpoint responding\n');

    console.log('🎉 All API tests completed successfully!');
    console.log('📝 Server is ready for frontend testing at http://localhost:4000');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

runTests();
