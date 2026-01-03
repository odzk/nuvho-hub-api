// controllers/authController.js
// Updated to use proper Firebase admin service integration

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Helper function to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Firebase admin service initialization (conditional)
let firebaseAdmin = null;
try {
  // Use the proper Firebase admin service
  const { initializeFirebase, admin } = require('../config/firebase');
  
  // Initialize Firebase
  const firebaseApp = initializeFirebase();
  if (firebaseApp) {
    firebaseAdmin = {
      createUser: async (email, password, displayName) => {
        try {
          console.log('🔥 Creating Firebase user:', email);
          
          const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: displayName,
            emailVerified: false
          });
          
          console.log('✅ Firebase user created successfully:', userRecord.uid);
          return { success: true, uid: userRecord.uid };
        } catch (error) {
          console.error('❌ Firebase user creation failed:', error.code, error.message);
          
          // Handle specific Firebase errors
          if (error.code === 'auth/email-already-exists') {
            return { success: false, error: 'Email already exists in Firebase', code: 'email-exists' };
          } else if (error.code === 'auth/weak-password') {
            return { success: false, error: 'Password too weak for Firebase', code: 'weak-password' };
          } else if (error.code === 'auth/invalid-email') {
            return { success: false, error: 'Invalid email format for Firebase', code: 'invalid-email' };
          }
          
          return { success: false, error: error.message, code: error.code };
        }
      },

      deleteUser: async (uid) => {
        try {
          await admin.auth().deleteUser(uid);
          console.log('🗑️ Firebase user deleted:', uid);
          return { success: true };
        } catch (error) {
          console.error('❌ Firebase user deletion failed:', error);
          return { success: false, error: error.message };
        }
      },

      verifyIdToken: async (idToken) => {
        try {
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          return { success: true, uid: decodedToken.uid, email: decodedToken.email };
        } catch (error) {
          console.error('❌ Firebase token verification failed:', error);
          return { success: false, error: error.message };
        }
      },

      updateUser: async (uid, updates) => {
        try {
          await admin.auth().updateUser(uid, updates);
          console.log('🔄 Firebase user updated:', uid);
          return { success: true };
        } catch (error) {
          console.error('❌ Firebase user update failed:', error);
          return { success: false, error: error.message };
        }
      }
    };
    
    console.log('🔥 Firebase Admin service initialized successfully');
  } else {
    console.log('⚠️ Firebase Admin initialization failed');
  }
} catch (error) {
  console.log('ℹ️ Firebase Admin not available:', error.message);
}

// Register a new user (ENHANCED FLOW: MySQL -> Firebase -> Update MySQL)
exports.register = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      displayName,
      hotelName,
      role = 'hoteluser',
      skipFirebase = false // Option to skip Firebase for testing
    } = req.body;
    
    // Validate required fields
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ 
        success: false,
        message: 'Email, first name, and last name are required' 
      });
    }

    // Validate password if not skipping Firebase
    if (!skipFirebase && (!password || password.length < 6)) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters long' 
      });
    }

    console.log('🚀 Starting MySQL-first registration for:', email);
    
    // STEP 1: Create user in MySQL first
    const userData = {
      email,
      password,
      firstName,
      lastName,
      displayName: displayName || `${firstName} ${lastName}`,
      hotelName,
      role
    };
    
    const mysqlUser = await User.create(userData);
    console.log('✅ Step 1: MySQL user created with ID:', mysqlUser.id);
    
    let firebaseUid = null;
    let registrationFlow = 'mysql-only';
    
    // STEP 2: Create Firebase user (if Firebase is available and not skipped)
    if (firebaseAdmin && !skipFirebase) {
      try {
        console.log('🔥 Step 2: Creating Firebase user...');
        
        const firebaseResult = await firebaseAdmin.createUser(
          email, 
          password, 
          displayName || `${firstName} ${lastName}`
        );
        
        if (firebaseResult.success) {
          firebaseUid = firebaseResult.uid;
          console.log('✅ Step 2: Firebase user created with UID:', firebaseUid);
          
          // STEP 3: Update MySQL user with Firebase UID
          try {
            const updatedUser = await User.updateFirebaseUid(mysqlUser.id, firebaseUid);
            console.log('✅ Step 3: MySQL user updated with Firebase UID');
            registrationFlow = 'mysql-firebase-complete';
            
            // Generate token for the updated user
            const token = generateToken(updatedUser);
            
            return res.status(201).json({
              success: true,
              message: 'User registered successfully with complete authentication',
              user: updatedUser,
              token,
              firebaseUid: firebaseUid,
              flow: registrationFlow
            });
          } catch (updateError) {
            console.error('❌ Step 3: Failed to update MySQL with Firebase UID:', updateError);
            
            // Rollback Firebase user if MySQL update fails
            await firebaseAdmin.deleteUser(firebaseUid);
            console.log('🔄 Rolled back Firebase user due to MySQL update failure');
            
            // Continue with MySQL-only flow
            registrationFlow = 'mysql-only-firebase-rollback';
          }
        } else {
          // Firebase creation failed
          console.warn('⚠️ Step 2: Firebase user creation failed:', firebaseResult.error);
          
          // Handle specific Firebase errors that should fail the entire registration
          if (firebaseResult.code === 'email-exists') {
            // Clean up MySQL user since email exists in Firebase
            await User.delete(mysqlUser.id);
            return res.status(409).json({
              success: false,
              message: 'Email already exists in authentication system'
            });
          }
          
          // For other Firebase errors, continue with MySQL-only
          registrationFlow = 'mysql-only-firebase-failed';
        }
      } catch (firebaseError) {
        console.error('❌ Step 2: Firebase registration error:', firebaseError);
        registrationFlow = 'mysql-only-firebase-error';
      }
    } else {
      console.log('ℹ️ Firebase not available or skipped - using MySQL-only registration');
      registrationFlow = 'mysql-only';
    }
    
    // Final response for MySQL-only flows
    const token = generateToken(mysqlUser);
    
    const responseMessage = {
      'mysql-only': 'User registered successfully (MySQL only)',
      'mysql-only-firebase-failed': 'User registered successfully (Firebase backup failed)',
      'mysql-only-firebase-error': 'User registered successfully (Firebase error occurred)',
      'mysql-only-firebase-rollback': 'User registered successfully (Firebase integration issue resolved)'
    };
    
    return res.status(201).json({
      success: true,
      message: responseMessage[registrationFlow],
      user: mysqlUser,
      token,
      firebaseUid: null,
      flow: registrationFlow,
      warning: registrationFlow !== 'mysql-only' ? 'Firebase authentication not available' : undefined
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    
    if (error.message === 'User already exists') {
      return res.status(409).json({ 
        success: false,
        message: 'User with this email already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Firebase user registration (for Firebase-initiated signups)
exports.registerFirebaseUser = async (req, res) => {
  try {
    const { idToken, additionalData = {} } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ 
        success: false,
        message: 'Firebase ID token is required' 
      });
    }

    // Verify Firebase token
    if (!firebaseAdmin) {
      return res.status(503).json({ 
        success: false,
        message: 'Firebase service not available' 
      });
    }

    const tokenResult = await firebaseAdmin.verifyIdToken(idToken);
    if (!tokenResult.success) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid Firebase token' 
      });
    }

    const { uid: firebaseUid, email } = tokenResult;
    
    // Check if user already exists by Firebase UID
    let existingUser = await User.findByFirebaseUid(firebaseUid);
    
    if (existingUser) {
      // Update last login
      await User.updateLastLogin(existingUser.id);
      
      const token = generateToken(existingUser);
      
      return res.json({
        success: true,
        message: 'User already exists - signed in successfully',
        user: existingUser,
        token,
        flow: 'existing-firebase-user'
      });
    }

    // Check if user exists by email (might be orphaned MySQL user)
    existingUser = await User.findByEmail(email);
    
    if (existingUser && !existingUser.firebaseUid) {
      // Update orphaned MySQL user with Firebase UID
      const updatedUser = await User.updateFirebaseUid(existingUser.id, firebaseUid);
      
      const token = generateToken(updatedUser);
      
      return res.json({
        success: true,
        message: 'Existing user linked with Firebase authentication',
        user: updatedUser,
        token,
        flow: 'mysql-firebase-link'
      });
    }

    // Create new MySQL user with Firebase UID
    const userData = {
      email,
      firstName: additionalData.firstName || email.split('@')[0],
      lastName: additionalData.lastName || '',
      displayName: additionalData.displayName || email.split('@')[0],
      hotelName: additionalData.hotelName || '',
      role: additionalData.role || 'hoteluser'
    };
    
    const newUser = await User.create(userData);
    const updatedUser = await User.updateFirebaseUid(newUser.id, firebaseUid);
    
    const token = generateToken(updatedUser);
    
    res.status(201).json({
      success: true,
      message: 'Firebase user registered successfully',
      user: updatedUser,
      token,
      flow: 'firebase-mysql-complete'
    });
    
  } catch (error) {
    console.error('❌ Firebase user registration error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during Firebase user registration',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Login a user (maintains compatibility)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }
    
    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }
    
    // Validate password
    const isPasswordValid = await User.validatePassword(user, password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }
    
    // Generate token
    const token = generateToken(user);
    
    // Update last login
    await User.updateLastLogin(user.id);
    
    res.json({
      success: true,
      message: 'Login successful',
      user,
      token
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }
    
    // Find user by email
    const user = await User.findByEmail(email);
    
    // We don't want to reveal if a user exists or not for security reasons
    // So we always return the same message
    
    // In a real application, you would:
    // 1. Generate a password reset token
    // 2. Save it to the database with an expiry time
    // 3. Send an email with a link containing the token
    
    res.json({ 
      success: true,
      message: 'If your email is registered, you will receive password reset instructions' 
    });
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    // Still return the same message for security
    res.json({ 
      success: true,
      message: 'If your email is registered, you will receive password reset instructions' 
    });
  }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('❌ Get current user error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Cleanup orphaned users (utility endpoint)
exports.cleanupOrphanedUsers = async (req, res) => {
  try {
    const olderThanMinutes = parseInt(req.query.olderThan) || 60;
    const cleanedCount = await User.cleanupOrphanedUsers(olderThanMinutes);
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} orphaned users`,
      cleanedCount
    });
  } catch (error) {
    console.error('❌ Cleanup orphaned users error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during cleanup',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Debug endpoint for Firebase connectivity (development only)
exports.debugFirebase = async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ message: 'Not found' });
  }
  
  try {
    const debugInfo = {
      firebaseAvailable: !!firebaseAdmin,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV
    };
    
    if (firebaseAdmin) {
      // Test Firebase connectivity
      try {
        const testEmail = `test-${Date.now()}@example.com`;
        const testResult = await firebaseAdmin.createUser(testEmail, 'testpass123', 'Test User');
        
        if (testResult.success) {
          // Clean up test user
          await firebaseAdmin.deleteUser(testResult.uid);
          debugInfo.firebaseConnectivity = 'working';
          debugInfo.testResult = 'success';
        } else {
          debugInfo.firebaseConnectivity = 'error';
          debugInfo.testError = testResult.error;
        }
      } catch (testError) {
        debugInfo.firebaseConnectivity = 'error';
        debugInfo.testError = testError.message;
      }
    }
    
    res.json({
      success: true,
      debug: debugInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      debug: {
        firebaseAvailable: !!firebaseAdmin,
        timestamp: new Date().toISOString()
      }
    });
  }
};