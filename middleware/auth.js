// middleware/auth.js
// Authentication middleware supporting both JWT tokens and Firebase tokens

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Try to load Firebase admin for token verification
let firebaseAdmin = null;
try {
  const { admin } = require('../config/firebase');
  firebaseAdmin = admin;
} catch (error) {
  console.log('ℹ️ Firebase admin not available for token verification');
}

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Development mode: Allow test tokens
    if (process.env.NODE_ENV === 'development' && token.startsWith('dev-test-token-')) {
      console.log('🔧 Development mode: Using test token');
      req.user = {
        id: 1, // Default to admin user for testing
        email: 'admin@nuvho.com',
        role: 'superadmin'
      };
      return next();
    }
    
    let decodedToken = null;
    let authMethod = null;
    
    // Try JWT verification first (for MySQL-first users)
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      authMethod = 'jwt';
      console.log('✅ JWT token verified for user:', decodedToken.id);
    } catch (jwtError) {
      console.log('📝 JWT verification failed, trying Firebase token...');
      
      // Try Firebase token verification (for Firebase users)
      if (firebaseAdmin) {
        try {
          const firebaseToken = await firebaseAdmin.auth().verifyIdToken(token);
          authMethod = 'firebase';
          console.log('🔥 Firebase token verified for user:', firebaseToken.uid);
          
          // Find user by Firebase UID
          const user = await User.findByFirebaseUid(firebaseToken.uid);
          if (!user) {
            return res.status(401).json({
              success: false,
              message: 'User not found for Firebase token'
            });
          }
          
          decodedToken = {
            id: user.id,
            email: user.email,
            role: user.role,
            firebaseUid: firebaseToken.uid
          };
        } catch (firebaseError) {
          console.error('❌ Firebase token verification failed:', firebaseError.message);
          return res.status(401).json({
            success: false,
            message: 'Invalid authentication token'
          });
        }
      } else {
        return res.status(401).json({
          success: false,
          message: 'Invalid authentication token'
        });
      }
    }
    
    // Verify user exists and is active (for JWT tokens)
    if (authMethod === 'jwt') {
      const user = await User.findById(decodedToken.id);
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User account not found or inactive'
        });
      }
    }
    
    // Attach user info to request
    req.user = decodedToken;
    req.authMethod = authMethod;
    
    next();
    
  } catch (error) {
    console.error('❌ Authentication middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

module.exports = authMiddleware;