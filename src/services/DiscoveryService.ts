import { BleManager } from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
const TcpSocket: any = require('react-native-tcp');


/**
 * Keşfedilen kullanıcı bilgilerini tutan arayüz
 * @property id - Kullanıcının benzersiz kimliği
 * @property name - Kullanıcının görünen adı
 * @property deviceId - Cihazın benzersiz kimliği
 * @property connectionType - Bağlantı tipi (WiFi veya Bluetooth)
 * @property signalStrength - Sinyal gücü (dBm cinsinden)
 * @property lastSeen - Son görülme zamanı
 * @property ipAddress - WiFi bağlantısı varsa IP adresi
 */
export interface DiscoveredUser {
    id: string;
    name: string;
    deviceId: string;
    connectionType: 'WiFi' | 'Bluetooth';
    signalStrength: number;
    lastSeen: Date;
    ipAddress?: string;
}

/**
 * UDP üzerinden gönderilen mesaj formatı
 */
interface UDPMessage {
    type: string;
    deviceId: string;
    timestamp: string;
}

/**
 * UDP mesaj alındığında gelen bilgiler
 */
interface RInfo {
    address: string;
    port: number;
    family: string;
}

/**
 * Cihaz Keşif Servisi
 * Bu servis yakındaki cihazları hem Bluetooth hem de WiFi üzerinden bulur.
 * Singleton pattern kullanır, yani uygulama genelinde tek bir örnek oluşturulur.
 * 
 * Kullanım örneği:
 * const discoveryService = DiscoveryService.getInstance();
 * await discoveryService.startDiscovery((user) => {
 *     console.log('Yeni cihaz bulundu:', user.name);
 * });
 */
class DiscoveryService {
    private bleManager: BleManager;
    private static instance: DiscoveryService;
    private discoveredUsers: Map<string, DiscoveredUser> = new Map();
    private readonly SERVICE_UUID = '0000FFE0-0000-1000-8000-00805F9B34FB';
    private readonly CHARACTERISTIC_UUID = '0000FFE1-0000-1000-8000-00805F9B34FB';
    private readonly DISCOVERY_PORT = 12345;
    private readonly DISCOVERY_INTERVAL = 5000; // 5 saniye
    private discoveryInterval: NodeJS.Timeout | null = null;
    private tcpServer: any | null = null;
    private tcpClients: Set<any> = new Set();

    private constructor() {
        this.bleManager = new BleManager();
    }

    /**
     * Servisin tek örneğini döndürür (Singleton pattern)
     */
    public static getInstance(): DiscoveryService {
        if (!DiscoveryService.instance) {
            DiscoveryService.instance = new DiscoveryService();
        }
        return DiscoveryService.instance;
    }

    /**
     * Cihaz keşfini başlatır
     * @param onUserDiscovered - Yeni bir cihaz bulunduğunda çağrılacak fonksiyon
     */
    public async startDiscovery(onUserDiscovered: (user: DiscoveredUser) => void) {
        await this.startBluetoothDiscovery(onUserDiscovered);
        await this.startWiFiDiscovery(onUserDiscovered);
    }

    /**
     * Bluetooth üzerinden cihaz keşfini başlatır
     * @param onUserDiscovered - Yeni bir cihaz bulunduğunda çağrılacak fonksiyon
     */
    private async startBluetoothDiscovery(onUserDiscovered: (user: DiscoveredUser) => void) {
        this.bleManager.startDeviceScan(null, null, async (error, device) => {
            if (error) {
                console.error('Bluetooth tarama hatası:', error);
                return;
            }

            if (device && device.name) {
                try {
                    const connectedDevice = await this.bleManager.connectToDevice(device.id);
                    await connectedDevice.discoverAllServicesAndCharacteristics();

                    const services = await connectedDevice.services();
                    const hasOurService = services.some(service =>
                        service.uuid.toLowerCase() === this.SERVICE_UUID.toLowerCase()
                    );

                    if (hasOurService) {
                        const user: DiscoveredUser = {
                            id: device.id,
                            name: device.name,
                            deviceId: device.id,
                            connectionType: 'Bluetooth',
                            signalStrength: device.rssi || 0,
                            lastSeen: new Date()
                        };

                        this.discoveredUsers.set(device.id, user);
                        onUserDiscovered(user);
                    }

                    await this.bleManager.cancelDeviceConnection(device.id);
                } catch (error) {
                    console.error('Cihaz bağlantı hatası:', error);
                }
            }
        });
    }

    /**
     * WiFi üzerinden cihaz keşfini başlatır
     * @param onUserDiscovered - Yeni bir cihaz bulunduğunda çağrılacak fonksiyon
     */
    private async startWiFiDiscovery(onUserDiscovered: (user: DiscoveredUser) => void) {
        try {
            const netInfo = await NetInfo.fetch();
            console.log('Ağ bilgisi:', netInfo);

            if (netInfo.type === 'wifi') {
                console.log('WiFi bağlantısı tespit edildi');
                // WiFi ağının IP adresini al
                const wifiInfo = await WifiManager.getCurrentWifiSSID();
                console.log('WiFi SSID:', wifiInfo);

                this.setupTCPServer(onUserDiscovered);
                this.startTCPDiscovery(onUserDiscovered);
            } else {
                console.log('WiFi bağlantısı bulunamadı, tür:', netInfo.type);
            }
        } catch (error) {
            console.error('WiFi tarama hatası:', error);
        }
    }

    /**
     * TCP sunucusunu kurar ve mesaj dinlemeyi başlatır
     * @param onUserDiscovered - Yeni bir cihaz bulunduğunda çağrılacak fonksiyon
     */
    private setupTCPServer(onUserDiscovered: (user: DiscoveredUser) => void) {
        try {
            console.log('TCP sunucusu oluşturuluyor...');

            // Önce mevcut sunucuyu temizle
            if (this.tcpServer) {
                try {
                    this.tcpServer.close();
                    this.tcpServer = null;
                } catch (error) {
                    console.error('Sunucu kapatma hatası:', error);
                }
            }

            // Yeni sunucu oluştur
            this.tcpServer = TcpSocket.createServer((socket: {
                address: () => { address: string };
                on: (event: string, callback: Function) => void;
                write: (data: string) => void;
                end: () => void;
            }) => {
                console.log('Yeni bağlantı alındı:', socket.address());

                // Bağlantıyı kaydet
                this.tcpClients.add(socket);

                // Mesaj dinleyicisi ekle
                socket.on('data', (data: Buffer) => {
                    try {
                        const message: UDPMessage = JSON.parse(data.toString());

                        if (message.type === 'discovery') {
                            const user: DiscoveredUser = {
                                id: message.deviceId,
                                name: `User-${message.deviceId}`,
                                deviceId: message.deviceId,
                                connectionType: 'WiFi',
                                signalStrength: -50,
                                lastSeen: new Date(),
                                ipAddress: socket.address().address
                            };

                            this.discoveredUsers.set(message.deviceId, user);
                            onUserDiscovered(user);
                        }
                    } catch (error) {
                        console.error('TCP mesaj ayrıştırma hatası:', error);
                    }
                });

                // Bağlantı koptuğunda
                socket.on('error', (error: Error) => {
                    console.error('TCP bağlantı hatası:', error);
                    this.tcpClients.delete(socket);
                });

                socket.on('close', () => {
                    console.log('Bağlantı kapandı');
                    this.tcpClients.delete(socket);
                });
            });

            // Sunucuyu başlat
            this.tcpServer.listen(this.DISCOVERY_PORT, '0.0.0.0', () => {
                console.log('TCP sunucusu port', this.DISCOVERY_PORT, 'üzerinde dinliyor');
            });

            // Sunucu hata yönetimi
            this.tcpServer.on('error', (error: Error) => {
                console.error('TCP sunucu hatası:', error);
                setTimeout(() => {
                    this.setupTCPServer(onUserDiscovered);
                }, 5000);
            });

        } catch (error) {
            console.error('TCP sunucu kurulum hatası:', error);
            setTimeout(() => {
                this.setupTCPServer(onUserDiscovered);
            }, 5000);
        }
    }

    /**
     * TCP üzerinden düzenli olarak keşif mesajları gönderir
     * @param onUserDiscovered - Yeni bir cihaz bulunduğunda çağrılacak fonksiyon
     */
    private startTCPDiscovery(onUserDiscovered: (user: DiscoveredUser) => void) {
        // Önceki interval'i temizle
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
            this.discoveryInterval = null;
        }

        this.discoveryInterval = setInterval(async () => {
            try {
                const broadcastMessage: UDPMessage = {
                    type: 'discovery',
                    deviceId: Platform.OS === 'ios' ? 'ios-device' : 'android-device',
                    timestamp: new Date().toISOString()
                };

                const messageString = JSON.stringify(broadcastMessage);
                console.log('Keşif mesajı gönderiliyor...');

                // Yerel ağdaki tüm IP'lere bağlanmayı dene
                const localIP = await this.getLocalIP();
                if (localIP) {
                    const networkPrefix = localIP.substring(0, localIP.lastIndexOf('.') + 1);

                    // 1'den 255'e kadar olan IP'leri tara
                    for (let i = 1; i <= 255; i++) {
                        const targetIP = networkPrefix + i;
                        if (targetIP !== localIP) {
                            const client = TcpSocket.createConnection({
                                port: this.DISCOVERY_PORT,
                                host: targetIP
                            }, () => {
                                client.write(messageString);
                                client.end();
                            });

                            client.on('error', () => {
                                // Bağlantı hatası normal, bu IP'de sunucu yok demektir
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('TCP keşif hatası:', error);
            }
        }, this.DISCOVERY_INTERVAL);
    }

    private async getLocalIP(): Promise<string | null> {
        try {
            const wifiInfo = await WifiManager.getCurrentWifiSSID();
            if (wifiInfo) {
                const netInfo = await NetInfo.fetch();
                if (netInfo.details && 'ipAddress' in netInfo.details) {
                    return (netInfo.details as { ipAddress: string }).ipAddress;
                }
            }
            return null;
        } catch (error) {
            console.error('IP adresi alma hatası:', error);
            return null;
        }
    }

    /**
     * Cihaz keşfini durdurur ve kaynakları temizler
     */
    public stopDiscovery() {
        this.bleManager.stopDeviceScan();
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
            this.discoveryInterval = null;
        }
        if (this.tcpServer) {
            try {
                this.tcpServer.close();
                this.tcpServer = null;
            } catch (error) {
                console.error('Sunucu kapatma hatası:', error);
            }
        }
        this.tcpClients.forEach(client => {
            try {
                client.end();
            } catch (error) {
                console.error('İstemci kapatma hatası:', error);
            }
        });
        this.tcpClients.clear();
        this.discoveredUsers.clear();
    }

    /**
     * Keşfedilen tüm cihazları döndürür
     */
    public getDiscoveredUsers(): DiscoveredUser[] {
        return Array.from(this.discoveredUsers.values());
    }
}

export default DiscoveryService;
 