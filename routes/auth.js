// routes/auth.js
// Enhanced auth routes with MySQL-first registration and Firebase debug

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Middleware for authentication (JWT or Firebase token verification)
const authMiddleware = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/register-firebase', authController.registerFirebaseUser);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);

// Protected routes
router.get('/me', authMiddleware, authController.getCurrentUser);

// Utility routes
router.delete('/cleanup-orphaned', authController.cleanupOrphanedUsers);

// Debug routes (development only)
if (process.env.NODE_ENV === 'development') {
  router.get('/debug/firebase', authController.debugFirebase);
  
  // Test registration endpoint with detailed logging
  router.post('/debug/test-registration', async (req, res) => {
    try {
      const testData = {
        email: `test-${Date.now()}@nuvho.com`,
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'User',
        displayName: 'Test User',
        hotelName: 'Test Hotel',
        role: 'hoteluser',
        ...req.body
      };
      
      console.log('🧪 Starting test registration with data:', {
        ...testData,
        password: '[REDACTED]'
      });
      
      // Create mock request/response for controller
      const mockReq = { body: testData };
      let responseData = {};
      
      const mockRes = {
        status: (code) => {
          responseData.status = code;
          return mockRes;
        },
        json: (data) => {
          responseData.data = data;
          console.log('🧪 Test registration result:', {
            status: responseData.status,
            success: data.success,
            flow: data.flow,
            message: data.message,
            hasFirebaseUid: !!data.firebaseUid,
            hasToken: !!data.token
          });
          
          res.json({
            testStatus: 'completed',
            testData: {
              ...testData,
              password: '[REDACTED]'
            },
            result: responseData
          });
          return mockRes;
        }
      };
      
      await authController.register(mockReq, mockRes);
      
    } catch (error) {
      console.error('🧪 Test registration failed:', error);
      res.status(500).json({
        testStatus: 'failed',
        error: error.message
      });
    }
  });
}

module.exports = router;