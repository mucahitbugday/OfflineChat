import AsyncStorage from '@react-native-async-storage/async-storage';
import { Chat, Message } from '../models/Chat';
import { BleManager } from 'react-native-ble-plx';
import { PORT } from '../constants/Config';
import NetInfo from '@react-native-community/netinfo';

const CHATS_STORAGE_KEY = '@chats';
const DEVICE_STATUS_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 2000; // 2 seconds
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';

export interface Device {
  id: string;
  name: string;
  ip?: string;
  online?: boolean;
  lastSeen?: string;
}

class ChatService {
  private chats: Chat[] = [];
  private deviceStatusCheckInterval: NodeJS.Timeout | null = null;
  private bleManager: BleManager | null = null;
  public discoveredDevices: Map<string, Device> = new Map();

  constructor() {
    this.loadChats();
    this.startDeviceStatusCheck();
  }

  public setDiscoveredDevice(deviceId: string, device: Device) {
    this.discoveredDevices.set(deviceId, device);
  }

  private async loadChats() {
    try {
      const storedChats = await AsyncStorage.getItem(CHATS_STORAGE_KEY);
      if (storedChats) {
        this.chats = JSON.parse(storedChats);
      }
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  }

  private async saveChats() {
    try {
      await AsyncStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(this.chats));
    } catch (error) {
      console.error('Error saving chats:', error);
    }
  }

  private startDeviceStatusCheck() {
    this.deviceStatusCheckInterval = setInterval(() => {
      this.checkDeviceStatus();
    }, DEVICE_STATUS_INTERVAL);
  }

  private async checkDeviceStatus() {
    try {
      // Get all chats
      const chats = await this.getChats();

      // Check each device's status
      for (const chat of chats) {
        try {
          // Try to ping the device via WiFi first
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);

          try {
            // Get device info from discovered devices
            const device = this.discoveredDevices.get(chat.id);
            if (!device?.ip) {
              console.debug(`No IP address found for device ${chat.id}`);
              continue;
            }

            const response = await fetch(`http://${device.ip}:${PORT}/ping`, {
              method: 'GET',
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              // Device is online via WiFi
              await this.updateDeviceStatus(chat.id, true);
              continue;
            }
          } catch (error) {
            console.debug(`WiFi ping failed for device ${chat.id}:`, error);
          }

          // WiFi ping failed, try Bluetooth
          try {
            if (!this.bleManager) {
              this.bleManager = new BleManager();
            }

            const device = await this.bleManager.connectToDevice(chat.id, {
              timeout: CONNECTION_TIMEOUT
            });

            // If we can connect, device is online
            await this.updateDeviceStatus(chat.id, true);
            await device.cancelConnection();
          } catch (error) {
            console.debug(`Bluetooth connection failed for device ${chat.id}:`, error);
            // Both WiFi and Bluetooth failed, device is offline
            await this.updateDeviceStatus(chat.id, false);
          }
        } catch (error) {
          console.error(`Error checking status for device ${chat.id}:`, error);
          // Mark device as offline if we encounter any errors
          await this.updateDeviceStatus(chat.id, false);
        }
      }
    } catch (error) {
      console.error('Error in device status check loop:', error);
    }
  }

  async addMessage(chatId: string, message: Message): Promise<void> {
    try {
      const chat = await this.getChat(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      chat.messages.push(message);
      chat.lastMessage = message;
      chat.updatedAt = new Date().toISOString();

      await this.saveChat(chat);
    } catch (error) {
      console.error('Error adding message:', error);
    }
  }

  async getChats(): Promise<Chat[]> {
    try {
      const chatsJson = await AsyncStorage.getItem(CHATS_STORAGE_KEY);
      return chatsJson ? JSON.parse(chatsJson) : [];
    } catch (error) {
      console.error('Error getting chats:', error);
      return [];
    }
  }

  async getChat(chatId: string): Promise<Chat | undefined> {
    try {
      const chats = await this.getChats();
      return chats.find(chat => chat.id === chatId);
    } catch (error) {
      console.error('Error getting chat:', error);
      return undefined;
    }
  }

  async markAsRead(chatId: string): Promise<void> {
    try {
      const chat = await this.getChat(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      chat.unreadCount = 0;
      chat.updatedAt = new Date().toISOString();

      await this.saveChat(chat);
    } catch (error) {
      console.error('Error marking chat as read:', error);
    }
  }

  async deleteChat(chatId: string): Promise<void> {
    try {
      const chats = await this.getChats();
      const updatedChats = chats.filter(chat => chat.id !== chatId);
      await AsyncStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(updatedChats));
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  }

  public async updateDeviceStatus(chatId: string, online: boolean) {
    const chat = await this.getChat(chatId);
    if (chat) {
      chat.updatedAt = new Date().toISOString();
      await this.saveChat(chat);
    }
  }

  private async getDeviceInfo(deviceId: string): Promise<Device | null> {
    // Implement logic to get device info from your device discovery service
    return null;
  }

  public cleanup() {
    if (this.deviceStatusCheckInterval) {
      clearInterval(this.deviceStatusCheckInterval);
      this.deviceStatusCheckInterval = null;
    }

    if (this.bleManager) {
      this.bleManager.destroy();
      this.bleManager = null;
    }
  }

  private async saveChat(chat: Chat): Promise<void> {
    try {
      const chats = await this.getChats();
      const index = chats.findIndex(c => c.id === chat.id);

      if (index >= 0) {
        chats[index] = chat;
      } else {
        chats.push(chat);
      }

      await AsyncStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats));
    } catch (error) {
      console.error('Error saving chat:', error);
    }
  }

  public async startDiscovery() {
    try {
      // Start Bluetooth discovery
      if (!this.bleManager) {
        this.bleManager = new BleManager();
      }

      this.bleManager.startDeviceScan(
        [SERVICE_UUID],
        {
          allowDuplicates: false,
          scanMode: 2, // SCAN_MODE_BALANCED
          callbackType: 1, // CALLBACK_TYPE_ALL_MATCHES
        },
        async (error, device) => {
          if (error) {
            console.error('Scan error:', error);
            return;
          }

          if (device) {
            // Create or update chat for this device
            const chat: Chat = {
              id: device.id,
              deviceName: device.name || 'Unknown Device',
              messages: [],
              lastMessage: undefined,
              unreadCount: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await this.saveChat(chat);
          }
        }
      );
    } catch (error) {
      console.error('Error starting discovery:', error);
    }
  }

  public stopDiscovery() {
    if (this.bleManager) {
      this.bleManager.stopDeviceScan();
    }
  }

  public async connectToDevice(chatId: string): Promise<boolean> {
    try {
      if (!this.bleManager) {
        this.bleManager = new BleManager();
      }

      const device = await this.bleManager.connectToDevice(chatId, {
        timeout: CONNECTION_TIMEOUT
      });

      await device.discoverAllServicesAndCharacteristics();
      await device.cancelConnection();

      return true;
    } catch (error) {
      console.error('Error connecting to device:', error);
      return false;
    }
  }

  public async sendMessage(chatId: string, content: string): Promise<boolean> {
    try {
      const chat = await this.getChat(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      const message: Message = {
        id: Date.now().toString(),
        content,
        senderId: 'local',
        timestamp: new Date().toISOString(),
        status: 'sent'
      };

      await this.addMessage(chatId, message);
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  public async createChat(deviceName: string, deviceIp?: string): Promise<Chat> {
    const chat: Chat = {
      id: this.generateGuid(),
      deviceName,
      deviceIp,
      messages: [],
      lastMessage: undefined,
      unreadCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.saveChat(chat);
    return chat;
  }

  public async sendMessageToIp(ip: string, content: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${ip}:${PORT}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'message',
          content: content,
          timestamp: new Date().toISOString(),
          sender: 'Me'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error('Error sending message to IP:', error);
      return false;
    }
  }

  public async findChatByIp(ip: string): Promise<Chat | undefined> {
    const chats = await this.getChats();
    return chats.find(chat => chat.deviceIp === ip);
  }
}

export const chatService = new ChatService(); 