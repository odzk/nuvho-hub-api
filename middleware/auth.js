// middleware/auth.js
const jwt = require('jsonwebtoken');
const { verifyFirebaseToken } = require('../config/firebase');

// Main auth middleware (existing Firebase + JWT logic)
const verifyToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    console.log('🔐 Auth middleware - Headers:', { 
      authorization: authHeader ? `Bearer ${authHeader.substring(7, 20)}...` : 'None',
      userAgent: req.headers['user-agent']?.substring(0, 50)
    });
    
    // Check if no token
    if (!authHeader) {
      console.log('❌ No authorization header');
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Extract token (assuming Bearer token format: "Bearer [token]")
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      console.log('❌ No token in authorization header');
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    console.log('🎟️ Token type:', token.length > 1000 ? 'Firebase ID Token' : 'Custom JWT');

    try {
      // Try Firebase token verification first
      const decodedFirebaseToken = await verifyFirebaseToken(token);
      
      console.log('✅ Firebase token verified for user:', decodedFirebaseToken.email);
      
      // Set user info from Firebase token
      req.user = {
        id: decodedFirebaseToken.uid,
        email: decodedFirebaseToken.email,
        role: decodedFirebaseToken.role || 'hoteladmin', // Default role
        firebaseUser: true
      };
      
      next();
    } catch (firebaseError) {
      console.log('❌ Firebase verification failed:', firebaseError.message);
      
      // If Firebase fails, try JWT verification (fallback for existing tokens)
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ JWT token verified for user:', decoded.email);
        req.user = decoded;
        next();
      } catch (jwtError) {
        console.error('❌ Both token verifications failed:', {
          firebase: firebaseError.message,
          jwt: jwtError.message
        });
        
        return res.status(401).json({ 
          message: 'Token is not valid',
          error: 'Authentication failed'
        });
      }
    }
  } catch (err) {
    console.error('💥 Auth middleware error:', err);
    res.status(401).json({ message: 'Authorization failed' });
  }
};

// Optional auth middleware (allows both authenticated and anonymous access)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    // Try Firebase token verification first
    const decodedFirebaseToken = await verifyFirebaseToken(token);
    req.user = {
      id: decodedFirebaseToken.uid,
      email: decodedFirebaseToken.email,
      role: decodedFirebaseToken.role || 'hoteladmin',
      firebaseUser: true
    };
  } catch (firebaseError) {
    try {
      // Fallback to JWT verification
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (jwtError) {
      req.user = null;
    }
  }
  
  next();
};

// Role-based access control
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'No user context'
      });
    }

    const userRole = req.user.role || 'hoteluser';
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        error: `Role ${userRole} not authorized. Required: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

// Admin only access
const requireAdmin = requireRole(['superadmin', 'superuser', 'groupadmin']);

// Hotel admin or higher access
const requireHotelAdmin = requireRole(['superadmin', 'superuser', 'groupadmin', 'regionaladmin', 'hoteladmin']);

// Export main middleware as default for backward compatibility
module.exports = verifyToken;

// Also export named exports for AI search routes
module.exports.verifyToken = verifyToken;
module.exports.optionalAuth = optionalAuth;
module.exports.requireRole = requireRole;
module.exports.requireAdmin = requireAdmin;
module.exports.requireHotelAdmin = requireHotelAdmin;