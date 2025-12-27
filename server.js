// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Database configuration
const { testConnection, initializeDatabase, closePool } = require('./config/database');

// Pinecone configuration
const { initializePinecone, testPineconeConnection } = require('./config/pinecone');
const { initializeOpenAI } = require('./services/embeddingService');

// Conditionally initialize Firebase
let firebaseEnabled = false;
try {
  const { initializeFirebase } = require('./config/firebase');
  initializeFirebase();
  firebaseEnabled = true;
} catch (error) {
  console.log('⚠️ Firebase not available:', error.message);
  console.log('🔧 Using simple authentication for development');
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

// Properties routes
if (firebaseEnabled) {
  console.log('🔥 Using Firebase authentication');
  app.use('/api/properties', require('./routes/properties'));
} else {
  console.log('🔧 Using simple authentication (development)');
  app.use('/api/properties', require('./routes/properties-simple'));
}

// AI-powered search routes
app.use('/api/search', require('./routes/search'));

// Health check route - enhanced with AI capabilities status
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: 'Connected',
    firebase: firebaseEnabled ? 'Available' : 'Not Available',
    authSystem: firebaseEnabled ? 'Firebase' : 'Simple',
    ai_features: {
      pinecone: false,
      embeddings: false,
      semantic_search: false
    }
  };

  // Test Pinecone connection
  try {
    await testPineconeConnection();
    health.ai_features.pinecone = true;
    health.ai_features.semantic_search = true;
  } catch (error) {
    console.log('⚠️ Pinecone not available for health check');
  }

  // Check OpenAI availability
  if (process.env.OPENAI_API_KEY) {
    health.ai_features.embeddings = true;
  }

  res.json(health);
});

// Test endpoint - enhanced with AI features info
app.get('/api/test', (req, res) => {
  const aiFeatures = {
    pinecone_available: !!process.env.PINECONE_API_KEY,
    openai_available: !!process.env.OPENAI_API_KEY,
    semantic_search: !!(process.env.PINECONE_API_KEY && process.env.OPENAI_API_KEY),
  };

  res.json({
    message: 'Backend server is running!',
    timestamp: new Date().toISOString(),
    authSystem: firebaseEnabled ? 'Firebase Authentication' : 'Simple Authentication (Development)',
    ai_features: aiFeatures,
    endpoints: [
      'GET /api/health',
      'GET /api/test',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/properties (requires auth)',
      'POST /api/search/hotels (AI semantic search)',
      'GET /api/search/hotels/:id/similar',
      'POST /api/search/hotels/advanced',
      'GET /api/search/stats',
      'GET /api/search/health'
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

  // OpenAI API errors
  if (err.response && err.response.status === 429) {
    return res.status(429).json({
      message: 'AI service rate limit exceeded',
      error: 'Please try again later'
    });
  }

  // Pinecone errors
  if (err.message && err.message.includes('Pinecone')) {
    return res.status(503).json({
      message: 'Vector search service unavailable',
      error: 'AI features temporarily disabled'
    });
  }
  
  // Default error response
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Initialize database and AI services, then start server
const startServer = async () => {
  try {
    console.log('🚀 Starting Nuvho HotelCRM Server with AI Features...');
    
    // Test database connection
    console.log('📊 Testing MySQL connection...');
    await testConnection();
    
    // Initialize database schema
    console.log('🔧 Initializing database schema...');
    await initializeDatabase();
    
    // Initialize AI services
    console.log('🤖 Initializing AI services...');
    
    // Initialize OpenAI for embeddings
    const openaiEnabled = initializeOpenAI();
    
    // Initialize Pinecone for vector search
    const pineconeEnabled = await initializePinecone();
    
    if (pineconeEnabled && openaiEnabled) {
      console.log('✅ Full AI capabilities enabled (Pinecone + OpenAI)');
      await testPineconeConnection();
    } else if (pineconeEnabled) {
      console.log('⚠️ Partial AI capabilities (Pinecone only - add OPENAI_API_KEY for embeddings)');
    } else if (openaiEnabled) {
      console.log('⚠️ Partial AI capabilities (OpenAI only - check Pinecone configuration)');
    } else {
      console.log('⚠️ AI features disabled (missing API keys/configuration)');
    }
    
    // Start the server
    const server = app.listen(PORT, () => {
      console.log(`🎉 Server running successfully on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🔐 Auth System: ${firebaseEnabled ? 'Firebase Authentication' : 'Simple Authentication (Development)'}`);
      
      // Log AI capabilities
      if (pineconeEnabled && openaiEnabled) {
        console.log('🧠 AI Features: Semantic Search, Hotel Similarity, Smart Recommendations');
      } else {
        console.log('🔧 AI Features: Limited (check API keys and configuration)');
      }
      
      console.log('📋 Available endpoints:');
      console.log('   Authentication:');
      console.log('   - POST /api/auth/register');
      console.log('   - POST /api/auth/login');
      console.log('   - POST /api/auth/forgot-password');
      console.log('   - GET  /api/auth/me');
      
      console.log('   Hotel Management:');
      console.log('   - POST /api/properties');
      console.log('   - GET  /api/properties/my-properties');
      console.log('   - GET  /api/properties/:id');
      console.log('   - PUT  /api/properties/:id');
      console.log('   - PATCH /api/properties/:id/status');
      console.log('   - DELETE /api/properties/:id');
      
      if (pineconeEnabled || openaiEnabled) {
        console.log('   AI-Powered Search:');
        console.log('   - POST /api/search/hotels (semantic search)');
        console.log('   - GET  /api/search/hotels/:id/similar');
        console.log('   - POST /api/search/hotels/advanced');
        console.log('   - POST /api/search/hotels/:id/embedding');
        console.log('   - POST /api/search/hotels/embeddings/generate-all');
        console.log('   - GET  /api/search/stats');
        console.log('   - GET  /api/search/health');
      }
      
      console.log('   System:');
      console.log('   - GET  /api/health');
      console.log('   - GET  /api/test');
      
      if (!firebaseEnabled) {
        console.log('');
        console.log('⚠️  DEVELOPMENT MODE: Simple authentication active');
        console.log('💡 Any Bearer token will work in development');
        console.log('🔧 To enable Firebase: ensure service account JSON is available');
      }

      if (!pineconeEnabled || !openaiEnabled) {
        console.log('');
        console.log('🔧 AI SETUP REQUIRED:');
        if (!pineconeEnabled) {
          console.log('   • Add PINECONE_API_KEY to .env');
          console.log('   • Ensure Pinecone index exists: hotel-embeddings');
        }
        if (!openaiEnabled) {
          console.log('   • Add OPENAI_API_KEY to .env for embedding generation');
        }
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
    console.error('💡 Please check your database connection and API keys');
    process.exit(1);
  }
};

// Start the server
startServer();