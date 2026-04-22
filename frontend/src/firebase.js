import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBWTe05Veeo12Fo9yFVeZ0mgk-GDm3Z39w",
  authDomain: "empath-os.firebaseapp.com",
  projectId: "empath-os",
  storageBucket: "empath-os.firebasestorage.app",
  messagingSenderId: "723285383886",
  appId: "1:723285383886:web:d28a8e8142ce190bb38e9f",
  measurementId: "G-TL3EHQY14W"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { app, analytics, db };
