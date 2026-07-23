import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, getMetadata } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// PASTE FIREBASE CONFIG HERE
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

// Get or create a stable device ID stored in AsyncStorage
const DEVICE_ID_KEY = '@synchme_device_id';
let cachedDeviceId: string | null = null;

export const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      // Generate a simple UUID-like string
      id = 'device_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
      
    } else {
      
    }
    cachedDeviceId = id;
    return id;
  } catch (e) {
    console.warn('[FIREBASE] Could not get device ID from AsyncStorage, using temp ID');
    cachedDeviceId = 'device_' + Date.now().toString(36);
    return cachedDeviceId;
  }
};

// Check if a file already exists in Firebase Storage for this device
const checkFileExists = async (storagePath: string): Promise<string | null> => {
  try {
    const storageRef = ref(storage, storagePath);
    await getMetadata(storageRef); // throws if not found
    const url = await getDownloadURL(storageRef);
    
    return url;
  } catch (e: any) {
    if (e?.code === 'storage/object-not-found') {
      return null; // File doesn't exist
    }
    return null; // Other error — fall through to upload
  }
};

export const uploadSongToFirebase = async (fileUri: string, filename: string): Promise<{ url: string; path: string }> => {
  try {
    const deviceId = await getDeviceId();
    // Use original filename, organized per device folder
    const storagePath = `songs/${deviceId}/${filename}`;
    
    // Check if already uploaded — skip re-upload
    const existingUrl = await checkFileExists(storagePath);
    if (existingUrl) {
      
      return { url: existingUrl, path: storagePath };
    }

    
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const storageRef = ref(storage, storagePath);
    
    await uploadBytes(storageRef, blob);
    
    
    const url = await getDownloadURL(storageRef);
    
    
    return { url, path: storagePath };
  } catch (error) {
    console.error('[FIREBASE] Upload error:', error);
    throw error;
  }
};

export const deleteSongFromFirebase = async (storagePath: string): Promise<void> => {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
    
  } catch (error) {
    console.error(`[FIREBASE] Delete error for ${storagePath}:`, error);
  }
};
