// models/User.js
// Updated to save to MySQL first, then Firebase backup
// Primary flow: MySQL -> Firebase -> Update MySQL with Firebase UID

const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

class User {
  constructor(userData) {
    this.id = userData.id;
    this.firebaseUid = userData.firebase_uid;
    this.email = userData.email;
    this.password = userData.password_hash; // Keep original property name for compatibility
    this.firstName = userData.first_name;
    this.lastName = userData.last_name;
    this.displayName = userData.display_name;
    this.hotelName = userData.hotel_name;
    this.role = userData.role;
    this.isActive = userData.is_active;
    this.emailVerified = userData.email_verified;
    this.lastLogin = userData.last_login;
    this.loginCount = userData.login_count;
    this.phone = userData.phone;
    this.avatarUrl = userData.avatar_url;
    this.timezone = userData.timezone;
    this.language = userData.language;
    this.authProvider = userData.auth_provider;
    this.createdAt = userData.created_at;
    this.updatedAt = userData.updated_at;
  }

  // Create new user in MySQL first (NEW FLOW)
  static async create(userData) {
    const connection = await pool.getConnection();
    
    try {
      const {
        email,
        password,
        firstName,
        lastName,
        displayName,
        hotelName = '',
        role = 'hoteluser'
      } = userData;

      // Validate required fields
      if (!email || !firstName || !lastName) {
        throw new Error('Email, first name, and last name are required');
      }

      // Check if user already exists by email
      const [existingUsers] = await connection.execute(
        'SELECT id, email FROM users WHERE email = ?',
        [email.toLowerCase().trim()]
      );

      if (existingUsers.length > 0) {
        throw new Error('User already exists');
      }

      // Hash password if provided and valid
      let hashedPassword = null;
      if (password && typeof password === 'string' && password.trim().length > 0) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(password.trim(), salt);
      }

      const finalDisplayName = displayName || `${firstName} ${lastName}`;

      // Insert new user WITHOUT Firebase UID initially (use auto-increment ID)
      const [result] = await connection.execute(
        `INSERT INTO users (
          email, first_name, last_name, display_name,
          password_hash, role, hotel_name, is_active, auth_provider, 
          email_verified, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          email.toLowerCase().trim(),
          firstName.trim(),
          lastName.trim(),
          finalDisplayName.trim(),
          hashedPassword,
          role,
          hotelName,
          true, // is_active
          'email', // auth_provider (using 'email' to match database enum)
          false // email_verified (will be updated after Firebase)
        ]
      );

      const userId = result.insertId;

      // Fetch the created user
      const [newUsers] = await connection.execute(
        'SELECT * FROM users WHERE id = ?',
        [userId]
      );

      connection.release();

      if (newUsers.length === 0) {
        throw new Error('Failed to create user');
      }

      console.log('✅ User created in MySQL with ID:', userId, 'for email:', email);
      
      // Return user without password
      const userInstance = new User(newUsers[0]);
      const { password: _, ...userWithoutPassword } = userInstance;
      return userWithoutPassword;

    } catch (error) {
      connection.release();
      console.error('❌ MySQL user creation error:', error);
      throw error;
    }
  }

  // Update user with Firebase UID after Firebase account creation
  static async updateFirebaseUid(userId, firebaseUid) {
    const connection = await pool.getConnection();
    
    try {
      // Update user with Firebase UID and auth provider
      const [result] = await connection.execute(
        `UPDATE users SET 
         firebase_uid = ?, 
         auth_provider = 'firebase', 
         email_verified = TRUE,
         updated_at = NOW() 
         WHERE id = ?`,
        [firebaseUid, userId]
      );

      if (result.affectedRows === 0) {
        connection.release();
        throw new Error('User not found for Firebase UID update');
      }

      // Fetch updated user
      const [users] = await connection.execute(
        'SELECT * FROM users WHERE id = ?',
        [userId]
      );

      connection.release();

      if (users.length === 0) {
        throw new Error('User not found after Firebase UID update');
      }

      console.log('✅ Firebase UID updated for user:', userId);
      
      // Return updated user without password
      const userInstance = new User(users[0]);
      const { password: _, ...userWithoutPassword } = userInstance;
      return userWithoutPassword;

    } catch (error) {
      connection.release();
      console.error('❌ Firebase UID update error:', error);
      throw error;
    }
  }

  // Find user by email (maintains exact compatibility)
  static async findByEmail(email) {
    const connection = await pool.getConnection();
    
    try {
      const [users] = await connection.execute(
        'SELECT * FROM users WHERE email = ? AND is_active = TRUE AND is_deleted = FALSE',
        [email.toLowerCase().trim()]
      );

      connection.release();

      if (users.length === 0) {
        return null;
      }

      return new User(users[0]);

    } catch (error) {
      connection.release();
      console.error('❌ Find user by email error:', error);
      return null;
    }
  }

  // Find user by ID (maintains exact compatibility)
  static async findById(id) {
    const connection = await pool.getConnection();
    
    try {
      const [users] = await connection.execute(
        'SELECT * FROM users WHERE id = ? AND is_active = TRUE AND is_deleted = FALSE',
        [id]
      );

      connection.release();

      if (users.length === 0) {
        return null;
      }

      return new User(users[0]);

    } catch (error) {
      connection.release();
      console.error('❌ Find user by ID error:', error);
      return null;
    }
  }

  // Find user by Firebase UID
  static async findByFirebaseUid(firebaseUid) {
    if (!firebaseUid) return null;
    
    const connection = await pool.getConnection();
    
    try {
      const [users] = await connection.execute(
        'SELECT * FROM users WHERE firebase_uid = ? AND is_active = TRUE AND is_deleted = FALSE',
        [firebaseUid]
      );

      connection.release();

      if (users.length === 0) {
        return null;
      }

      return new User(users[0]);

    } catch (error) {
      connection.release();
      console.error('❌ Find user by Firebase UID error:', error);
      return null;
    }
  }

  // Validate password (maintains exact compatibility)
  static async validatePassword(user, password) {
    if (!user.password || !password) {
      return false;
    }

    try {
      return await bcrypt.compare(password, user.password);
    } catch (error) {
      console.error('❌ Password validation error:', error);
      return false;
    }
  }

  // Update password (maintains compatibility)
  static async updatePassword(userId, newPassword) {
    const connection = await pool.getConnection();
    
    try {
      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Update user password
      const [result] = await connection.execute(
        'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
        [hashedPassword, userId]
      );

      if (result.affectedRows === 0) {
        connection.release();
        throw new Error('User not found');
      }

      // Fetch updated user
      const [users] = await connection.execute(
        'SELECT * FROM users WHERE id = ?',
        [userId]
      );

      connection.release();

      if (users.length === 0) {
        throw new Error('User not found');
      }

      // Return user without password
      const userInstance = new User(users[0]);
      const { password: _, ...userWithoutPassword } = userInstance;
      return userWithoutPassword;

    } catch (error) {
      connection.release();
      console.error('❌ Update password error:', error);
      throw error;
    }
  }

  // Get all users (maintains compatibility)
  static async getAll() {
    const connection = await pool.getConnection();
    
    try {
      const [users] = await connection.execute(
        'SELECT * FROM users WHERE is_active = TRUE AND is_deleted = FALSE ORDER BY created_at DESC'
      );

      connection.release();

      // Return users without passwords
      return users.map(userData => {
        const userInstance = new User(userData);
        const { password: _, ...userWithoutPassword } = userInstance;
        return userWithoutPassword;
      });

    } catch (error) {
      connection.release();
      console.error('❌ Get all users error:', error);
      return [];
    }
  }

  // Update last login
  static async updateLastLogin(userId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.execute(
        'UPDATE users SET last_login = NOW(), login_count = login_count + 1 WHERE id = ?',
        [userId]
      );

      connection.release();
      console.log('📊 Updated last login for user:', userId);

    } catch (error) {
      connection.release();
      console.error('❌ Update last login error:', error);
    }
  }

  // Update user profile
  static async updateProfile(userId, updates) {
    const connection = await pool.getConnection();
    
    try {
      const allowedFields = [
        'first_name', 'last_name', 'display_name', 'phone', 
        'avatar_url', 'timezone', 'language', 'hotel_name'
      ];

      const updateFields = [];
      const updateValues = [];

      Object.keys(updates).forEach(key => {
        const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (allowedFields.includes(dbField)) {
          updateFields.push(`${dbField} = ?`);
          updateValues.push(updates[key]);
        }
      });

      if (updateFields.length === 0) {
        connection.release();
        throw new Error('No valid fields to update');
      }

      updateValues.push(userId);

      await connection.execute(
        `UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`,
        updateValues
      );

      connection.release();

      // Return updated user
      return await User.findById(userId);

    } catch (error) {
      connection.release();
      console.error('❌ Update profile error:', error);
      throw error;
    }
  }

  // Clean up orphaned users (users created in MySQL but Firebase failed)
  static async cleanupOrphanedUsers(olderThanMinutes = 60) {
    const connection = await pool.getConnection();
    
    try {
      // Mark orphaned users as deleted (users without firebase_uid older than specified time)
      const [result] = await connection.execute(
        `UPDATE users SET 
         is_deleted = TRUE, 
         updated_at = NOW() 
         WHERE firebase_uid IS NULL 
         AND auth_provider = 'email' 
         AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
         AND is_deleted = FALSE`,
        [olderThanMinutes]
      );

      connection.release();
      
      if (result.affectedRows > 0) {
        console.log(`🧹 Cleaned up ${result.affectedRows} orphaned users`);
      }

      return result.affectedRows;

    } catch (error) {
      connection.release();
      console.error('❌ Cleanup orphaned users error:', error);
      return 0;
    }
  }

  // Convert to JSON (hide sensitive fields)
  toJSON() {
    const { password, ...userWithoutPassword } = this;
    return userWithoutPassword;
  }
}

module.exports = User;