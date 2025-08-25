// models/User.js
// This is a simple in-memory model for now
// In a real application, you would use a database (MongoDB, PostgreSQL, etc.)

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// In-memory database
const users = [];

class User {
  static async create(userData) {
    const { email, password, firstName, lastName, hotelName, role = 'hoteladmin' } = userData;
    
    // Check if user with this email already exists
    const existingUser = users.find(user => user.email === email);
    if (existingUser) {
      throw new Error('User already exists');
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const newUser = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      firstName,
      lastName,
      hotelName: hotelName || '',
      role,
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  }
  
  static async findByEmail(email) {
    return users.find(user => user.email === email) || null;
  }
  
  static async findById(id) {
    return users.find(user => user.id === id) || null;
  }
  
  static async validatePassword(user, password) {
    return bcrypt.compare(password, user.password);
  }
  
  static async updatePassword(userId, newPassword) {
    const userIndex = users.findIndex(user => user.id === userId);
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update user
    users[userIndex].password = hashedPassword;
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = users[userIndex];
    return userWithoutPassword;
  }
  
  static getAll() {
    // Return users without passwords
    return users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }
}

module.exports = User;