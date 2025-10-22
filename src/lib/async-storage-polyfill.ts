// Simple polyfill for @react-native-async-storage/async-storage in browser
export const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.clear();
  },

  async getAllKeys(): Promise<string[]> {
    if (typeof window === 'undefined') return [];
    return Object.keys(localStorage);
  },
};

export default AsyncStorage;