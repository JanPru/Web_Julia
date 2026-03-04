// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
// IMPORTANT: Replace these placeholder values with your own Firebase project config.
//
// Steps to get your config:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (or use an existing one)
// 3. Click "Add app" > Web (</>)
// 4. Register your app and copy the config object
// 5. Enable Firestore Database (Build > Firestore Database > Create database)
// 6. Enable Storage (Build > Storage > Get started)
// 7. Enable Anonymous Auth (Build > Authentication > Sign-in method > Anonymous > Enable)
// 8. Paste your config values below

const firebaseConfig = {
  apiKey: "AIzaSyBw-ycgrmTxDNufS4GGbj7W6TYQnLRUq2E",
  authDomain: "web-jj.firebaseapp.com",
  projectId: "web-jj",
  storageBucket: "web-jj.firebasestorage.app",
  messagingSenderId: "288687229729",
  appId: "1:288687229729:web:5dd74da1aed14d63f38c60",
  measurementId: "G-7WBCN7MLQ7"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();

// Sign in anonymously for accessing Firebase services
let currentUser = null;

const authReady = new Promise((resolve) => {
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            console.log("✓ Firebase authenticated:", user.uid);
            resolve(user);
        } else {
            auth.signInAnonymously().catch((error) => {
                console.warn("Auth error:", error.message);
                // Continue without auth — app will work with open Firestore rules
                resolve(null);
            });
        }
    });
});

// Helper: Check if Firebase is properly configured
function isFirebaseConfigured() {
    return firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.projectId !== "YOUR_PROJECT_ID";
}
