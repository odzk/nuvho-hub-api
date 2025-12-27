// config/firebase.js
const admin = require('firebase-admin');
const path = require('path');

let firebaseApp;

const initializeFirebase = () => {
  try {
    if (!firebaseApp) {
      const serviceAccount = require(path.join(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS));
      
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      
      console.log('✅ Firebase Admin initialized successfully');
    }
    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    return null;
  }
};

const verifyFirebaseToken = async (idToken) => {
  try {
    if (!firebaseApp) {
      initializeFirebase();
    }
    
    if (!firebaseApp) {
      throw new Error('Firebase not initialized');
    }
    
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Firebase token verification error:', error);
    throw error;
  }
};

module.exports = {
  initializeFirebase,
  verifyFirebaseToken,
  admin
};