// controllers/authController.js
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

// Register a new user
exports.register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, hotelName } = req.body;
    
    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Create user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      hotelName,
      role: 'hoteladmin' // Default role
    });
    
    // Generate token
    const token = generateToken(user);
    
    res.status(201).json({
      message: 'User registered successfully',
      user,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.message === 'User already exists') {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// Login a user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Validate password
    const isPasswordValid = await User.validatePassword(user, password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Generate token
    const token = generateToken(user);
    
    res.json({
      message: 'Login successful',
      user,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Find user by email
    const user = await User.findByEmail(email);
    
    // We don't want to reveal if a user exists or not for security reasons
    // So we always return the same message
    
    // In a real application, you would:
    // 1. Generate a password reset token
    // 2. Save it to the database with an expiry time
    // 3. Send an email with a link containing the token
    
    res.json({ 
      message: 'If your email is registered, you will receive password reset instructions' 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    // Still return the same message for security
    res.json({ 
      message: 'If your email is registered, you will receive password reset instructions' 
    });
  }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};