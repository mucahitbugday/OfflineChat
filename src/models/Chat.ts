import { Device } from './Device';

export interface Message {
  id: string;
  content: string;
  senderId: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
}

export interface Chat {
  id: string; // GUID
  deviceName: string;
  deviceIp?: string; // Optional IP address for direct messaging
  messages: Message[];
  lastMessage: Message | undefined;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
} 