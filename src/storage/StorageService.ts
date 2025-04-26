import AsyncStorage from '@react-native-async-storage/async-storage';



export const DEVICE_NAME_KEY = '@DEVICE_NAME_KEY';


export const StorageService = {
  async getItem<T>(key: string): Promise<T | null> {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  },
  async setItem<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }
}; 