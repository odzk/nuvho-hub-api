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
  const { initializeFirebase } = require('./config/firebase');
  initializeFirebase();
  firebaseEnabled = true;
} catch (error) {
  console.log('⚠️ Firebase not available:', error.message);
  console.log('📝 Using simple authentication for development');
}

// Initialize express app
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes - choose auth system based on Firebase availability
app.use('/api/auth', require('./routes/auth'));
if (firebaseEnabled) {
  console.log('🔥 Using Firebase authentication');
  app.use('/api/properties', require('./routes/properties'));
} else {
  console.log('🔧 Using simple authentication (development)');
  app.use('/api/properties', require('./routes/properties-simple'));
}

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'Connected',
    firebase: firebaseEnabled ? 'Available' : 'Not Available',
    authSystem: firebaseEnabled ? 'Firebase' : 'Simple'
  });
});

// Test endpoint (no auth required)
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Backend server is running!',
    timestamp: new Date().toISOString(),
    authSystem: firebaseEnabled ? 'Firebase Authentication' : 'Simple Authentication (Development)',
    endpoints: [
      'GET /api/health',
      'GET /api/test', 
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/properties (requires auth)'
    ]
  });
});

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
  
  // Default error response
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    console.log('🚀 Starting Nuvho HotelCRM Server...');
    
    // Test database connection
    await testConnection();
    
    // Initialize database schema
    await initializeDatabase();
    
    // Start the server
    const server = app.listen(PORT, () => {
      console.log(`🎉 Server running successfully on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🔐 Auth System: ${firebaseEnabled ? 'Firebase Authentication' : 'Simple Authentication (Development)'}`);
      console.log('📋 Available endpoints:');
      console.log('   - POST /api/auth/register');
      console.log('   - POST /api/auth/login');
      console.log('   - POST /api/auth/forgot-password');
      console.log('   - GET  /api/auth/me');
      console.log('   - POST /api/properties');
      console.log('   - GET  /api/properties/my-properties');
      console.log('   - GET  /api/properties/:id');
      console.log('   - PUT  /api/properties/:id');
      console.log('   - PATCH /api/properties/:id/status');
      console.log('   - DELETE /api/properties/:id');
      console.log('   - GET  /api/health');
      console.log('   - GET  /api/test');
      
      if (!firebaseEnabled) {
        console.log('');
        console.log('⚠️  DEVELOPMENT MODE: Simple authentication active');
        console.log('💡 Any Bearer token will work in development');
        console.log('🔧 To enable Firebase: ensure service account JSON is available');
      }
    });
    
    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      console.log(`\n📡 ${signal} received. Starting graceful shutdown...`);
      
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
    console.error('💡 Please check your database connection and try again');
    process.exit(1);
  }
};

// Start the server
startServer();