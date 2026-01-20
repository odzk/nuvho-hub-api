// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

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

const corsOptions = {
  origin: [
    'http://localhost:3000',  // React dev server
    'http://localhost:3001',  // Alternative React port
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
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
// app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Enhanced auth routes with MySQL-first support
app.use('/api/auth', require('./routes/auth'));

// Onboarding
app.use('/api/onboarding', require('./routes/onboarding'));

// Only load HubSpot routes if the file exists
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
  app.use('/api/properties', require('./routes/properties'));
} else {
  console.log('🔧 Using MySQL-first authentication (development)');
  app.use('/api/properties', require('./routes/properties-simple'));
}

// Health check route with enhanced auth system info
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await testConnection();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'Connected',
      firebase: firebaseEnabled ? 'Available' : 'Not Available',
      authSystem: firebaseEnabled ? 'MySQL-First + Firebase Backup' : 'MySQL-Only',
      aiServices: process.env.OPENAI_API_KEY ? 'Available' : 'Not Configured',
      features: {
        mysqlFirst: true,
        firebaseBackup: firebaseEnabled,
        orphanedUserCleanup: true,
        hybridAuthentication: firebaseEnabled,
        aiChat: !!process.env.OPENAI_API_KEY,
        voiceTranscription: !!process.env.OPENAI_API_KEY,
        textToSpeech: !!process.env.OPENAI_API_KEY
      }
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      database: 'Connection Failed',
      firebase: firebaseEnabled ? 'Available' : 'Not Available',
      authSystem: 'Unavailable',
      error: error.message
    });
  }
});

// Enhanced test endpoint with auth flow information
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
      voiceFeatures: !!process.env.OPENAI_API_KEY
    },
    endpoints: [
      'GET /api/health',
      'GET /api/test', 
      
      // Enhanced Auth Endpoints
      'POST /api/auth/register (MySQL-first registration)',
      'POST /api/auth/register-firebase (Firebase-initiated users)',
      'POST /api/auth/login',
      'POST /api/auth/forgot-password',
      'GET /api/auth/me',
      'DELETE /api/auth/cleanup-orphaned (utility)',
      
      // Property Endpoints
      'POST /api/properties (requires auth)',
      'GET /api/properties/my-properties',
      'GET /api/properties/:id',
      'PUT /api/properties/:id',
      'PATCH /api/properties/:id/status',
      'DELETE /api/properties/:id',
      
      // AI Services Endpoints (new)
      'POST /api/ai/chat (Chat with Nuvho Analyst)',
      'POST /api/ai/transcribe (Audio to text)',
      'POST /api/ai/speak (Text to speech)',
      'GET /api/ai/health (AI services status)',
      'GET /api/ai/test (AI services info)',
      
      // HubSpot Integration (if available)
      'GET /api/hubspot/status',
      'GET /api/hubspot/test-connection',
      'POST /api/hubspot/test-hotel'
    ],
    registrationFlow: firebaseEnabled ? [
      '1. Save user to MySQL database',
      '2. Create Firebase authentication account',
      '3. Update MySQL user with Firebase UID',
      '4. Return success with token'
    ] : [
      '1. Save user to MySQL database',
      '2. Return success with token',
      'Note: Firebase backup not available'
    ]
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
      message: 'Cleanup endpoint not available'
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

// Error handling middleware
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
  
  // Default error response
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    console.log('🚀 Starting Nuvho HotelCRM Server v2.1...');
    console.log('💾 Authentication Flow: MySQL-First + Firebase Backup');
    
    // Test database connection
    await testConnection();
    
    // Initialize database schema
    await initializeDatabase();
    
    // Start the server
    const server = app.listen(PORT, () => {
      console.log(`🎉 Server running successfully on port ${PORT}`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🏗 Auth System: ${firebaseEnabled ? 'MySQL-First + Firebase Backup' : 'MySQL-Only Authentication'}`);
      console.log(`🤖 AI Services: ${process.env.OPENAI_API_KEY ? 'Enabled' : 'Disabled'}`);
      
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
        console.log('     - POST /api/ai/chat (Chat with Nuvho Analyst)');
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
      
      if (!firebaseEnabled) {
        console.log('');
        console.log('⚠️  DEVELOPMENT MODE: MySQL-first authentication active');
        console.log('🔧 Firebase backup not available - user creation uses MySQL only');
        console.log('💡 Install firebase-admin to enable hybrid authentication');
      } else {
        console.log('');
        console.log('✅ PRODUCTION READY: Hybrid authentication system active');
        console.log('💾 Primary: MySQL database for user storage');
        console.log('🔥 Backup: Firebase authentication for auth services');
        console.log('🔄 Automatic: Orphaned user cleanup available');
      }

      if (!process.env.OPENAI_API_KEY) {
        console.log('');
        console.log('🤖 AI SERVICES: Disabled');
        console.log('💡 Add OPENAI_API_KEY to your .env file to enable AI features');
        console.log('🎯 Required for: Chat, Voice Transcription, Text-to-Speech');
      } else {
        console.log('');
        console.log('✅ AI SERVICES: Enabled');
        console.log('🤖 Nuvho Analyst: Ready for hospitality insights');
        console.log('🎤 Voice Features: Transcription and TTS available');
      }
    });
    
    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      console.log(`\n🔔 ${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        console.log('🔒 HTTP server closed');
        
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
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('💡 Please check your database connection and configuration');
    process.exit(1);
  }
};

// Start the server
startServer();