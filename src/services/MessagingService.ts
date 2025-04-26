import { BleManager } from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';
import { DiscoveredUser } from './DiscoveryService';
import createSocket from 'react-native-udp';
import { Platform } from 'react-native';

/**
 * Mesaj bilgilerini tutan arayüz
 * @property id - Mesajın benzersiz kimliği
 * @property senderId - Gönderen cihazın kimliği
 * @property receiverId - Alıcı cihazın kimliği
 * @property content - Mesaj içeriği
 * @property timestamp - Mesajın gönderilme zamanı
 * @property status - Mesajın durumu (gönderildi, iletildi, okundu)
 */
export interface Message {
    id: string;
    senderId: string;
    receiverId: string;
    content: string;
    timestamp: Date;
    status: 'sent' | 'delivered' | 'read';
}

/**
 * Mesajlaşma Servisi
 * Bu servis cihazlar arası mesajlaşmayı hem Bluetooth hem de WiFi üzerinden sağlar.
 * Singleton pattern kullanır, yani uygulama genelinde tek bir örnek oluşturulur.
 * 
 * Kullanım örneği:
 * const messagingService = MessagingService.getInstance();
 * await messagingService.sendMessage(user, "Merhaba!");
 * messagingService.startListening((message) => {
 *     console.log('Yeni mesaj:', message.content);
 * });
 */
class MessagingService {
    private bleManager: BleManager;
    private static instance: MessagingService;
    private readonly SERVICE_UUID = '0000FFE0-0000-1000-8000-00805F9B34FB';
    private readonly CHARACTERISTIC_UUID = '0000FFE1-0000-1000-8000-00805F9B34FB';
    private readonly MESSAGE_PORT = 12346;
    private messageSocket: any | null = null;
    private messageHandlers: ((message: Message) => void)[] = [];

    private constructor() {
        this.bleManager = new BleManager();
    }

    /**
     * Servisin tek örneğini döndürür (Singleton pattern)
     */
    public static getInstance(): MessagingService {
        if (!MessagingService.instance) {
            MessagingService.instance = new MessagingService();
        }
        return MessagingService.instance;
    }

    /**
     * Mesaj gönderir
     * @param user - Mesajın gönderileceği kullanıcı
     * @param content - Mesaj içeriği
     * @returns Mesajın başarıyla gönderilip gönderilmediği
     */
    public async sendMessage(user: DiscoveredUser, content: string): Promise<boolean> {
        try {
            if (user.connectionType === 'Bluetooth') {
                return await this.sendBluetoothMessage(user, content);
            } else {
                return await this.sendWiFiMessage(user, content);
            }
        } catch (error) {
            console.error('Mesaj gönderme hatası:', error);
            return false;
        }
    }

    /**
     * Bluetooth üzerinden mesaj gönderir
     * @param user - Mesajın gönderileceği kullanıcı
     * @param content - Mesaj içeriği
     */
    private async sendBluetoothMessage(user: DiscoveredUser, content: string): Promise<boolean> {
        try {
            const device = await this.bleManager.connectToDevice(user.deviceId);
            await device.discoverAllServicesAndCharacteristics();
            
            const service = await device.services();
            const characteristic = await service[0].characteristics();
            
            const message = JSON.stringify({
                type: 'message',
                content,
                timestamp: new Date().toISOString()
            });

            await characteristic[0].writeWithResponse(message);
            await this.bleManager.cancelDeviceConnection(user.deviceId);
            
            return true;
        } catch (error) {
            console.error('Bluetooth mesaj gönderme hatası:', error);
            return false;
        }
    }

    /**
     * WiFi üzerinden mesaj gönderir
     * @param user - Mesajın gönderileceği kullanıcı
     * @param content - Mesaj içeriği
     */
    private async sendWiFiMessage(user: DiscoveredUser, content: string): Promise<boolean> {
        try {
            if (!user.ipAddress) {
                throw new Error('Kullanıcı için IP adresi bulunamadı');
            }

            const message = {
                type: 'message',
                content,
                timestamp: new Date().toISOString(),
                senderId: Platform.OS === 'ios' ? 'ios-device' : 'android-device'
            };

            return new Promise((resolve) => {
                this.messageSocket?.send(
                    JSON.stringify(message),
                    0,
                    JSON.stringify(message).length,
                    this.MESSAGE_PORT,
                    user.ipAddress,
                    (error: Error | null) => {
                        if (error) {
                            console.error('WiFi mesaj gönderme hatası:', error);
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    }
                );
            });
        } catch (error) {
            console.error('WiFi mesaj gönderme hatası:', error);
            return false;
        }
    }

    /**
     * Mesaj dinlemeyi başlatır
     * @param onMessageReceived - Yeni bir mesaj alındığında çağrılacak fonksiyon
     */
    public async startListening(onMessageReceived: (message: Message) => void) {
        this.messageHandlers.push(onMessageReceived);

        // WiFi mesaj dinleme soketini kur
        this.messageSocket = new createSocket();
        this.messageSocket.bind(this.MESSAGE_PORT, () => {
            console.log('Mesaj soketi port', this.MESSAGE_PORT, 'üzerine bağlandı');
            
            this.messageSocket?.on('message', (msg: Buffer, rinfo: any) => {
                try {
                    const message = JSON.parse(msg.toString());
                    if (message.type === 'message') {
                        const receivedMessage: Message = {
                            id: Math.random().toString(36).substr(2, 9),
                            senderId: message.senderId,
                            receiverId: 'me',
                            content: message.content,
                            timestamp: new Date(message.timestamp),
                            status: 'delivered'
                        };

                        this.messageHandlers.forEach(handler => handler(receivedMessage));
                    }
                } catch (error) {
                    console.error('Mesaj ayrıştırma hatası:', error);
                }
            });
        });

        // Bluetooth mesaj dinleme
        this.bleManager.startDeviceScan(null, null, async (error, device) => {
            if (error) return;

            if (device) {
                try {
                    const connectedDevice = await this.bleManager.connectToDevice(device.id);
                    await connectedDevice.discoverAllServicesAndCharacteristics();
                    
                    const service = await connectedDevice.services();
                    const characteristic = await service[0].characteristics();
                    
                    characteristic[0].monitor((error, characteristic) => {
                        if (error) return;
                        
                        if (characteristic?.value) {
                            const message = JSON.parse(characteristic.value);
                            const receivedMessage: Message = {
                                id: Math.random().toString(36).substr(2, 9),
                                senderId: device.id,
                                receiverId: 'me',
                                content: message.content,
                                timestamp: new Date(message.timestamp),
                                status: 'delivered'
                            };

                            this.messageHandlers.forEach(handler => handler(receivedMessage));
                        }
                    });
                } catch (error) {
                    console.error('Bluetooth dinleme hatası:', error);
                }
            }
        });
    }

    /**
     * Mesaj dinlemeyi durdurur ve kaynakları temizler
     */
    public stopListening() {
        this.bleManager.stopDeviceScan();
        if (this.messageSocket) {
            this.messageSocket.close();
            this.messageSocket = null;
        }
        this.messageHandlers = [];
    }
}

export default MessagingService; 