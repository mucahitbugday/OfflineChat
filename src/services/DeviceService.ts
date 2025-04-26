import { Device } from '../models/Device';

export const DeviceService = {
  async updateDeviceStatus(devices: Device[], onlineDevices: string[]): Promise<Device[]> {
    return devices.map(device => ({
      ...device,
      online: onlineDevices.includes(device.id),
      lastSeen: onlineDevices.includes(device.id) ? new Date().toISOString() : device.lastSeen
    }));
  }
}; 