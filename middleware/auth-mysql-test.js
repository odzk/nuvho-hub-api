// middleware/auth-mysql-test.js
// Ultra-simple auth for MySQL testing - accepts ANY Bearer token

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  console.log('🔐 MySQL Auth Check:', authHeader ? 'Token provided' : 'No token');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ No Bearer token provided');
    return res.status(401).json({ message: 'Authorization header with Bearer token required' });
  }

  const token = authHeader.split(' ')[1];
  
  if (!token || token.length < 5) {
    console.log('❌ Invalid token format');
    return res.status(401).json({ message: 'Invalid token format' });
  }

  console.log('✅ Token accepted for MySQL testing:', token.substring(0, 10) + '...');
  
  // Create a simple user object for MySQL storage
  req.user = {
    id: 'mysql-test-user-' + Date.now(),
    email: 'test@mysql.dev',
    role: 'hoteladmin'
  };
  
  next();
};