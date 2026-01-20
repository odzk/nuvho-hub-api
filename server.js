// server.js - Nuvho HotelCRM Backend Server v2.1
// Complete server with AI integration, HTTPS support, and MySQL-First authentication

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const https = require('https');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Database configuration
const { testConnection, initializeDatabase, closePool } = require('./config/database');

// Conditionally initialize Firebase
let firebaseEnabled = false;
try {
  // Only try to load Firebase if the package exists
  require.resolve('firebase-admin');
  const { initializeFirebase } = require('./config/firebase');
  initializeFirebase();
  firebaseEnabled = true;
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log('ℹ️ Firebase Admin not installed - using MySQL-first authentication');
  } else {
    console.log('⚠️ Firebase not available:', error.message);
  }
  console.log('🔧 Using MySQL-first authentication for development');
}

// Initialize express app
const app = express();
const PORT = process.env.PORT || 4000;
const HTTPS_PORT = process.env.HTTPS_PORT || 4443;

// Enhanced CORS configuration with HTTPS support
const corsOptions = {
  origin: [
    'http://localhost:3000',  // React dev server
    'http://localhost:3001',  // Alternative React port
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'https://hub.thehotelcollective.com',  // Production frontend HTTPS
    'https://hub.thehotelcollective.com:4443',  // HTTPS API
    'https://hub.thehotelcollective.com:4000',  // HTTPS API on port 4000
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ]
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Enhanced auth routes with MySQL-first support
app.use('/api/auth', require('./routes/auth'));

// Onboarding routes
app.use('/api/onboarding', require('./routes/onboarding'));

// HubSpot integration routes (if available)
try {
  app.use('/api/hubspot', require('./routes/hubspot'));
  console.log('✅ HubSpot routes loaded');
} catch (error) {
  console.log('ℹ️ HubSpot routes not available - run setup to enable HubSpot integration');
}

// AI services routes
try {
  app.use('/api/ai', require('./routes/ai'));
  console.log('✅ AI services routes loaded');
} catch (error) {
  console.log('ℹ️ AI services routes not available - check OpenAI configuration');
  console.log('💡 Add OPENAI_API_KEY to your .env file to enable AI features');
}

// Property routes with Firebase/MySQL compatibility
if (firebaseEnabled) {
  console.log('🔥 Using Firebase + MySQL hybrid authentication');
  try {
    app.use('/api/properties', require('./routes/properties'));
  } catch (error) {
    console.log('⚠️ Properties routes not available:', error.message);
  }
} else {
  console.log('🔧 Using MySQL-first authentication (development)');
  try {
    app.use('/api/properties', require('./routes/properties-simple'));
  } catch (error) {
    console.log('⚠️ Simple properties routes not available:', error.message);
  }
}

// Enhanced health check route
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await testConnection();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      version: '2.1.0',
      database: 'Connected',
      firebase: firebaseEnabled ? 'Available' : 'Not Available',
      authSystem: firebaseEnabled ? 'MySQL-First + Firebase Backup' : 'MySQL-Only',
      aiServices: process.env.OPENAI_API_KEY ? 'Available' : 'Not Configured',
      httpsEnabled: process.env.SSL_CERT && process.env.SSL_KEY ? true : false,
      features: {
        mysqlFirst: true,
        firebaseBackup: firebaseEnabled,
        orphanedUserCleanup: true,
        hybridAuthentication: firebaseEnabled,
        aiChat: !!process.env.OPENAI_API_KEY,
        voiceTranscription: !!process.env.OPENAI_API_KEY,
        textToSpeech: !!process.env.OPENAI_API_KEY,
        nuvhoAnalyst: !!process.env.OPENAI_ASSISTANT_ID,
        nuvhoManager: !!process.env.OPENAI_MANAGER_ASSISTANT_ID
      }
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      version: '2.1.0',
      database: 'Connection Failed',
      firebase: firebaseEnabled ? 'Available' : 'Not Available',
      authSystem: 'Unavailable',
      error: error.message
    });
  }
});

// Enhanced test endpoint with comprehensive information
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Nuvho HotelCRM Backend Server is running!',
    timestamp: new Date().toISOString(),
    authSystem: firebaseEnabled ? 'MySQL-First + Firebase Backup' : 'MySQL-Only Authentication',
    version: '2.1.0',
    features: {
      mysqlFirstRegistration: true,
      firebaseBackup: firebaseEnabled,
      orphanedUserCleanup: true,
      dualDatabaseSupport: true,
      hybridAuthentication: firebaseEnabled,
      aiServices: !!process.env.OPENAI_API_KEY,
      voiceFeatures: !!process.env.OPENAI_API_KEY,
      httpsSupport: !!(process.env.SSL_CERT && process.env.SSL_KEY)
    },
    endpoints: [
      'GET /api/health - Server health check',
      'GET /api/test - Server information', 
      
      // Enhanced Auth Endpoints
      'POST /api/auth/register - MySQL-first registration',
      'POST /api/auth/register-firebase - Firebase-initiated users',
      'POST /api/auth/login - User authentication',
      'POST /api/auth/forgot-password - Password recovery',
      'GET /api/auth/me - Current user info',
      'DELETE /api/auth/cleanup-orphaned - Utility endpoint',
      
      // Property Endpoints
      'POST /api/properties - Create property (requires auth)',
      'GET /api/properties/my-properties - List user properties',
      'GET /api/properties/:id - Get property details',
      'PUT /api/properties/:id - Update property',
      'PATCH /api/properties/:id/status - Update property status',
      'DELETE /api/properties/:id - Delete property',
      
      // AI Services Endpoints
      'POST /api/ai/chat - Chat with AI assistants (Analyst/Manager)',
      'POST /api/ai/transcribe - Audio to text conversion',
      'POST /api/ai/speak - Text to speech generation',
      'GET /api/ai/health - AI services status',
      'GET /api/ai/test - AI services information',
      
      // HubSpot Integration (if available)
      'GET /api/hubspot/status - HubSpot connection status',
      'GET /api/hubspot/test-connection - Test HubSpot API',
      'POST /api/hubspot/test-hotel - Test hotel data sync'
    ],
    registrationFlow: firebaseEnabled ? [
      '1. Save user to MySQL database (primary)',
      '2. Create Firebase authentication account (backup)',
      '3. Update MySQL user with Firebase UID',
      '4. Return success with JWT token'
    ] : [
      '1. Save user to MySQL database',
      '2. Return success with JWT token',
      'Note: Firebase backup not available'
    ],
    aiAssistants: process.env.OPENAI_API_KEY ? {
      analyst: {
        id: process.env.OPENAI_ASSISTANT_ID || 'asst_3kf3WzUfV5KmJlqKe8lLySPu',
        purpose: 'Hotel analytics and business intelligence',
        voice: 'alloy'
      },
      manager: {
        id: process.env.OPENAI_MANAGER_ASSISTANT_ID || 'asst_NS8hqSyzPQ0Hv3F7uOOuKJVk',
        purpose: 'Task execution and management operations',
        voice: 'echo'
      }
    } : null
  });
});

// Utility endpoint to cleanup orphaned users
app.delete('/api/auth/cleanup-orphaned', async (req, res) => {
  try {
    const authController = require('./controllers/authController');
    await authController.cleanupOrphanedUsers(req, res);
  } catch (error) {
    console.error('Cleanup endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Cleanup endpoint not available',
      error: error.message
    });
  }
});

// Debug endpoint for registration flow testing (development only)
if (process.env.NODE_ENV === 'development') {
  app.post('/api/debug/test-registration', async (req, res) => {
    try {
      const { email = 'test@nuvho.com', skipFirebase = false } = req.body;
      
      const testData = {
        email,
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'User',
        displayName: 'Test User',
        hotelName: 'Test Hotel',
        role: 'hoteluser',
        skipFirebase
      };
      
      // Test the registration flow
      const authController = require('./controllers/authController');
      const mockReq = { body: testData };
      const mockRes = {
        status: (code) => mockRes,
        json: (data) => {
          res.json({
            message: 'Registration flow test completed',
            testData,
            result: data,
            flow: firebaseEnabled && !skipFirebase ? 'mysql-firebase-test' : 'mysql-only-test'
          });
          return mockRes;
        }
      };
      
      await authController.register(mockReq, mockRes);
    } catch (error) {
      res.status(500).json({
        message: 'Registration test failed',
        error: error.message
      });
    }
  });
}

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  
  // Database connection errors
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({ 
      message: 'Database connection failed',
      error: 'Service temporarily unavailable'
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ 
      message: 'Invalid token',
      error: 'Authentication failed'
    });
  }
  
  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation error',
      error: err.message
    });
  }
  
  // Firebase errors
  if (err.code && err.code.startsWith('auth/')) {
    return res.status(400).json({
      message: 'Firebase authentication error',
      error: err.message
    });
  }
  
  // MySQL errors
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      message: 'Duplicate entry',
      error: 'Resource already exists'
    });
  }
  
  // OpenAI API errors
  if (err.message && err.message.includes('OpenAI API Error')) {
    return res.status(502).json({
      message: 'AI service error',
      error: 'Unable to process AI request'
    });
  }
  
  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      message: 'File too large',
      error: 'File size exceeds 25MB limit'
    });
  }
  
  // Default error response
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    message: 'Endpoint not found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Server startup with HTTPS support
const startServer = async () => {
  try {
    console.log('🚀 Starting Nuvho HotelCRM Server v2.1...');
    console.log('💾 Authentication Flow: MySQL-First + Firebase Backup');
    
    // Test database connection
    await testConnection();
    
    // Initialize database schema
    await initializeDatabase();
    
    // Check for HTTPS configuration
    const useHTTPS = process.env.NODE_ENV === 'production' && 
                     process.env.SSL_CERT && 
                     process.env.SSL_KEY;
    
    if (useHTTPS) {
      // HTTPS Server setup
      try {
        if (!fs.existsSync(process.env.SSL_CERT) || !fs.existsSync(process.env.SSL_KEY)) {
          throw new Error('SSL certificate files not found');
        }
        
        const options = {
          key: fs.readFileSync(process.env.SSL_KEY),
          cert: fs.readFileSync(process.env.SSL_CERT)
        };
        
        const httpsServer = https.createServer(options, app);
        httpsServer.listen(HTTPS_PORT, () => {
          logServerInfo('https', HTTPS_PORT);
        });
        
        // Also start HTTP server for redirects
        const httpServer = app.listen(PORT, () => {
          console.log(`🔄 HTTP Server running on port ${PORT} (redirects to HTTPS)`);
        });
        
        setupGracefulShutdown([httpsServer, httpServer]);
        
      } catch (sslError) {
        console.error('❌ SSL Certificate error:', sslError.message);
        console.log('⚠️  Falling back to HTTP server');
        startHTTPServer();
      }
    } else {
      console.log('💡 Using HTTP server');
      if (process.env.NODE_ENV === 'production') {
        console.log('⚠️  PRODUCTION: Set SSL_CERT and SSL_KEY for HTTPS');
      }
      startHTTPServer();
    }
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('💡 Please check your database connection and configuration');
    process.exit(1);
  }
};

const startHTTPServer = () => {
  const server = app.listen(PORT, () => {
    logServerInfo('http', PORT);
  });
  
  setupGracefulShutdown([server]);
};

const logServerInfo = (protocol, port) => {
  const baseUrl = protocol === 'https' 
    ? `https://hub.thehotelcollective.com:${port}`
    : `http://localhost:${port}`;
  
  console.log(`🎉 Server running successfully on ${protocol.toUpperCase()} port ${port}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: ${baseUrl}/api`);
  console.log(`🏗 Auth System: ${firebaseEnabled ? 'MySQL-First + Firebase Backup' : 'MySQL-Only Authentication'}`);
  console.log(`🤖 AI Services: ${process.env.OPENAI_API_KEY ? 'Enabled' : 'Disabled'}`);
  
  if (protocol === 'https') {
    console.log('🔒 HTTPS enabled for production');
    console.log('💡 Frontend should use: REACT_APP_API_URL=' + baseUrl);
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️  PRODUCTION WARNING: Using HTTP instead of HTTPS');
    }
    console.log('💡 Frontend should use: REACT_APP_API_URL=' + baseUrl);
  }
  
  console.log('\n📋 Registration Flow:');
  if (firebaseEnabled) {
    console.log('   1. ✅ Save user to MySQL database');
    console.log('   2. 🔥 Create Firebase authentication account');
    console.log('   3. 🔄 Update MySQL user with Firebase UID');
    console.log('   4. 🎯 Return success with JWT token');
    console.log('   🏗 Fallback: Continue with MySQL-only if Firebase fails');
  } else {
    console.log('   1. ✅ Save user to MySQL database');
    console.log('   2. 🎯 Return success with JWT token');
    console.log('   🏗 Note: Firebase backup not available');
  }
  
  console.log('\n🔡 Available endpoints:');
  console.log('   🏗 Authentication:');
  console.log('     - POST /api/auth/register (MySQL-first registration)');
  console.log('     - POST /api/auth/register-firebase (Firebase-initiated users)');
  console.log('     - POST /api/auth/login');
  console.log('     - POST /api/auth/forgot-password');
  console.log('     - GET  /api/auth/me');
  
  console.log('   🏨 Properties:');
  console.log('     - POST /api/properties');
  console.log('     - GET  /api/properties/my-properties');
  console.log('     - GET  /api/properties/:id');
  console.log('     - PUT  /api/properties/:id');
  console.log('     - PATCH /api/properties/:id/status');
  console.log('     - DELETE /api/properties/:id');
  
  if (process.env.OPENAI_API_KEY) {
    console.log('   🤖 AI Services:');
    console.log('     - POST /api/ai/chat (Chat with AI assistants)');
    console.log('     - POST /api/ai/transcribe (Audio to text)');
    console.log('     - POST /api/ai/speak (Text to speech)');
    console.log('     - GET  /api/ai/health (AI services status)');
    console.log('     - GET  /api/ai/test (AI services info)');
  }
  
  console.log('   🔧 Utilities:');
  console.log('     - GET  /api/health');
  console.log('     - GET  /api/test');
  console.log('     - DELETE /api/auth/cleanup-orphaned');
  
  if (process.env.NODE_ENV === 'development') {
    console.log('   🧪 Development:');
    console.log('     - POST /api/debug/test-registration');
  }
  
  console.log('   📊 HubSpot (if available):');
  console.log('     - GET  /api/hubspot/status');
  console.log('     - GET  /api/hubspot/test-connection');
  console.log('     - POST /api/hubspot/test-hotel');
  
  console.log('\n🎯 System Status:');
  if (!firebaseEnabled) {
    console.log('⚠️  DEVELOPMENT MODE: MySQL-first authentication active');
    console.log('🔧 Firebase backup not available - user creation uses MySQL only');
    console.log('💡 Install firebase-admin to enable hybrid authentication');
  } else {
    console.log('✅ PRODUCTION READY: Hybrid authentication system active');
    console.log('💾 Primary: MySQL database for user storage');
    console.log('🔥 Backup: Firebase authentication for auth services');
    console.log('🔄 Automatic: Orphaned user cleanup available');
  }

  if (!process.env.OPENAI_API_KEY) {
    console.log('🤖 AI SERVICES: Disabled');
    console.log('💡 Add OPENAI_API_KEY to your .env file to enable AI features');
    console.log('🎯 Required for: Chat, Voice Transcription, Text-to-Speech');
  } else {
    console.log('✅ AI SERVICES: Enabled');
    console.log(`🤖 Nuvho Analyst: ${process.env.OPENAI_ASSISTANT_ID ? 'Configured' : 'Using default'}`);
    console.log(`⚙️ Nuvho Manager: ${process.env.OPENAI_MANAGER_ASSISTANT_ID ? 'Configured' : 'Using default'}`);
    console.log('🎤 Voice Features: Transcription and TTS available');
  }
  
  console.log('\n📚 Documentation:');
  console.log('   🔗 API Health: ' + baseUrl + '/api/health');
  console.log('   🔗 API Test: ' + baseUrl + '/api/test');
  if (process.env.OPENAI_API_KEY) {
    console.log('   🔗 AI Health: ' + baseUrl + '/api/ai/health');
  }
};

const setupGracefulShutdown = (servers) => {
  // Graceful shutdown handling
  const gracefulShutdown = async (signal) => {
    console.log(`\n🔔 ${signal} received. Starting graceful shutdown...`);
    
    // Close all servers
    const shutdownPromises = servers.map(server => {
      return new Promise((resolve) => {
        server.close(() => {
          console.log('🔒 Server closed');
          resolve();
        });
      });
    });
    
    Promise.all(shutdownPromises).then(async () => {
      try {
        await closePool();
        console.log('💾 Database connections closed');
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('⏰ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };
  
  // Listen for shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

// Start the server
startServer();

module.exports = app;