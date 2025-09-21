const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false,
        message: 'No token, authorization denied' 
      });
    }

    // Extract token from "Bearer TOKEN" format
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No token found in Authorization header' 
      });
    }

    console.log('Auth middleware - token received:', token.substring(0, 20) + '...');

    try {
      // Try to verify as standard JWT first
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      console.log('JWT verification successful for user:', decoded.id || decoded.email);
      next();
    } catch (jwtError) {
      console.log('JWT verification failed:', jwtError.message);
      
      // If JWT fails, check if it might be a Firebase token
      if (token.length > 100) {
        console.log('Long token detected, might be Firebase ID token');
        
        // For now, create a mock user for Firebase tokens
        // TODO: Implement proper Firebase admin SDK verification
        req.user = {
          id: 'firebase-user',
          email: 'firebase-user@example.com',
          tokenType: 'firebase'
        };
        console.log('Firebase token accepted (mock verification)');
        next();
      } else {
        console.log('Token validation failed completely');
        return res.status(401).json({ 
          success: false,
          message: 'Token is not valid',
          debug: {
            tokenLength: token.length,
            jwtError: jwtError.message,
            tokenPreview: token.substring(0, 20) + '...'
          }
        });
      }
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error in authentication',
      error: error.message 
    });
  }
};

module.exports = auth;