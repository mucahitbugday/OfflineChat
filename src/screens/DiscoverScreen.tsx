import { StyleSheet, View, FlatList, TouchableOpacity, Alert, TextInput, Platform, ScrollView } from 'react-native'
import React, { useState, useEffect, useRef } from 'react'
import { Text, useTheme, Avatar, Surface, Button, IconButton, SegmentedButtons, Portal, Modal } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { BleManager, State } from 'react-native-ble-plx'
import { PERMISSIONS, request, RESULTS, check } from 'react-native-permissions'
import NetInfo from '@react-native-community/netinfo'
import WifiManager from 'react-native-wifi-reborn'
import AsyncStorage from '@react-native-async-storage/async-storage'
import TcpSocket from 'react-native-tcp-socket'

// Define service and characteristic UUIDs
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'
const DEVICE_NAME_KEY = '@device_name'
const PORT = 8080 // WiFi mesajlaşma için port numarası

// Singleton BleManager instance
let bleManagerInstance: BleManager | null = null;

const getBleManager = () => {
    if (!bleManagerInstance) {
        bleManagerInstance = new BleManager();
    }
    return bleManagerInstance;
};

interface AddressInfo {
    address: string;
    port: number;
    family: string;
}

interface TcpSocketServer extends TcpSocket.Server { }
interface TcpSocketClient extends TcpSocket.Socket { }

// NetworkInfo için tip tanımlaması ekle
interface NetworkDetails {
    ipAddress?: string;
    subnet?: string;
    [key: string]: any;
}

interface NetworkState {
    type: string;
    isConnected: boolean | null;
    details: NetworkDetails;
}

export default function DiscoverScreen() {
    const theme = useTheme()
    const [devices, setDevices] = useState<any[]>([])
    const [message, setMessage] = useState('')
    const [isScanning, setIsScanning] = useState(false)
    const [deviceName, setDeviceName] = useState('')
    const [isEditingName, setIsEditingName] = useState(false)
    const [connectionType, setConnectionType] = useState<'bluetooth' | 'wifi'>('wifi')
    const bleManager = useRef(getBleManager()).current
    const scanTimeout = useRef<NodeJS.Timeout | null>(null)
    const isMounted = useRef(true)
    const [logs, setLogs] = useState<string[]>([]);
    const [showLogModal, setShowLogModal] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [server, setServer] = useState<TcpSocketServer | null>(null);

    useEffect(() => {
        isMounted.current = true;
        loadDeviceName();
        // İlk açılışta otomatik taramayı kaldır
        checkPermissionsAndScan();
        startServer();

        return () => {
            isMounted.current = false;
            cleanup();
            stopServer();
        };
    }, [connectionType]);

    const cleanup = () => {
        try {
            if (scanTimeout.current) {
                clearTimeout(scanTimeout.current)
                scanTimeout.current = null
            }

            if (isScanning) {
                bleManager.stopDeviceScan()
                setIsScanning(false)
            }
        } catch (error) {
            console.error('Temizleme hatası:', error)
        }
    }

    const checkBluetoothState = async () => {
        try {
            const state = await bleManager.state()
            if (state !== State.PoweredOn) {
                Alert.alert(
                    'Bluetooth Kapalı',
                    'Lütfen Bluetooth\'u açın ve tekrar deneyin.',
                    [
                        {
                            text: 'Tamam',
                            onPress: () => {
                                if (isMounted.current) {
                                    setIsScanning(false)
                                }
                            }
                        }
                    ]
                )
                return false
            }
            return true
        } catch (error) {
            console.error('Bluetooth durum kontrolü hatası:', error)
            return false
        }
    }

    const checkPermissionsAndScan = async () => {
        try {
            if (Platform.OS === 'android') {
                const bluetoothScanPermission = await check(PERMISSIONS.ANDROID.BLUETOOTH_SCAN)
                const bluetoothConnectPermission = await check(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT)
                const locationPermission = await check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)

                if (bluetoothScanPermission !== RESULTS.GRANTED) {
                    await request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN)
                }
                if (bluetoothConnectPermission !== RESULTS.GRANTED) {
                    await request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT)
                }
                if (locationPermission !== RESULTS.GRANTED) {
                    await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)
                }
            }

            const isBluetoothReady = await checkBluetoothState()
            if (isBluetoothReady) {
                // startScan()
            }
        } catch (error) {
            console.error('İzin hatası:', error)
            Alert.alert(
                'İzin Hatası',
                'Bluetooth ve konum izinleri alınamadı. Lütfen ayarlardan izinleri kontrol edin.',
                [
                    {
                        text: 'Tamam',
                        onPress: () => {
                            if (isMounted.current) {
                                setIsScanning(false)
                            }
                        }
                    }
                ]
            )
        }
    }


    const addLog = (message: string) => {
        console.log(message); // Konsola da yazdır
        setLogs(prevLogs => {
            const newLogs = [...prevLogs, `${new Date().toLocaleTimeString()}: ${message}`];
            return newLogs.slice(-50); // Son 50 logu tut
        });
    };

    const clearLogs = () => {
        setLogs([]);
    };

    //#region UTİLS
    const loadDeviceName = async () => {

        try {
            const savedName = await AsyncStorage.getItem(DEVICE_NAME_KEY)
            if (savedName) {
                setDeviceName(savedName)
            } else {
                const defaultName = `Cihaz-${Math.floor(Math.random() * 1000)}`
                setDeviceName(defaultName)
                await AsyncStorage.setItem(DEVICE_NAME_KEY, defaultName)
            }
        } catch (error) {
            console.error('Cihaz ismi yükleme hatası:', error)
        }
    }

    const saveDeviceName = async (name: string) => {
        try {
            await AsyncStorage.setItem(DEVICE_NAME_KEY, name)
            setDeviceName(name)
            setIsEditingName(false)
        } catch (error) {
            console.error('Cihaz ismi kaydetme hatası:', error)
        }
    }


    //#endregion UTİLS




    const startScan = async () => {
        if (!isMounted.current) return

        try {
            const isBluetoothReady = await checkBluetoothState()
            if (!isBluetoothReady) return

            setDevices([])
            setIsScanning(true)

            bleManager.startDeviceScan(
                [SERVICE_UUID],
                {
                    allowDuplicates: false,
                    scanMode: 2, // SCAN_MODE_BALANCED
                    callbackType: 1, // CALLBACK_TYPE_ALL_MATCHES
                },
                (error, device) => {
                    if (!isMounted.current) return

                    if (error) {
                        console.error('Tarama hatası:', error)
                        Alert.alert(
                            'Tarama Hatası',
                            'Cihazlar taranırken bir hata oluştu. Lütfen tekrar deneyin.',
                            [
                                {
                                    text: 'Tamam',
                                    onPress: () => {
                                        if (isMounted.current) {
                                            setIsScanning(false)
                                        }
                                    }
                                }
                            ]
                        )
                        return
                    }

                    if (device) {
                        device.discoverAllServicesAndCharacteristics()
                            .then(async () => {
                                const services = await device.services()
                                if (services && services.length > 0) {
                                    const hasOurService = services.some(
                                        (service: { uuid: string }) =>
                                            service.uuid.toLowerCase() === SERVICE_UUID.toLowerCase()
                                    )
                                    if (hasOurService) {
                                        setDevices(prevDevices => {
                                            const exists = prevDevices.find(d => d.id === device.id)
                                            if (exists) return prevDevices
                                            return [...prevDevices, device]
                                        })
                                    }
                                }
                            })
                            .catch(error => {
                                console.error('Servis keşif hatası:', error)
                            })
                    }
                }
            )

            // Clear any existing timeout
            if (scanTimeout.current) {
                clearTimeout(scanTimeout.current)
            }

            // Set new timeout
            scanTimeout.current = setTimeout(() => {
                if (isMounted.current) {
                    stopScan()
                }
            }, 30000)
        } catch (error) {
            console.error('Tarama başlatma hatası:', error)
            Alert.alert(
                'Tarama Hatası',
                'Tarama başlatılırken bir hata oluştu. Lütfen tekrar deneyin.',
                [
                    {
                        text: 'Tamam',
                        onPress: () => {
                            if (isMounted.current) {
                                setIsScanning(false)
                            }
                        }
                    }
                ]
            )
        }
    }

    const stopScan = () => {
        try {
            bleManager.stopDeviceScan()
            setIsScanning(false)
            if (scanTimeout.current) {
                clearTimeout(scanTimeout.current)
                scanTimeout.current = null
            }
        } catch (error) {
            console.error('Tarama durdurma hatası:', error)
        }
    }

    const sendMessage = async (deviceId: string) => {
        if (!message.trim()) {
            Alert.alert('Mesaj boş', 'Lütfen bir mesaj yaz!')
            return
        }

        try {
            const device = await bleManager.connectToDevice(deviceId)
            await device.discoverAllServicesAndCharacteristics()

            await device.writeCharacteristicWithResponseForService(
                SERVICE_UUID,
                CHARACTERISTIC_UUID,
                Buffer.from(message, 'utf-8').toString('base64')
            )

            Alert.alert('Başarılı', 'Mesaj gönderildi!')
            setMessage('')
        } catch (error) {
            console.error('Mesaj gönderme hatası:', error)
            Alert.alert('Hata', 'Mesaj gönderilemedi!')
        }
    }



    const checkPortStatus = async () => {
        try {
            addLog('Port 8080 kontrol ediliyor...');

            // Kendi IP adresini al
            const networkInfo = await NetInfo.fetch();
            if (!networkInfo.details || !('ipAddress' in networkInfo.details)) {
                addLog('HATA: IP adresi alınamadı');
                return false;
            }

            const localIP = networkInfo.details.ipAddress;
            if (!localIP) {
                addLog('HATA: IP adresi boş');
                return false;
            }

            addLog(`Yerel IP adresi: ${localIP}`);

            // Port kontrolü için bir test isteği gönder
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);

                const response = await fetch(`http://${localIP}:${PORT}/ping`, {
                    method: 'GET',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    addLog('✅ Port 8080 açık ve dinleniyor');
                    return true;
                } else {
                    addLog('❌ Port 8080 kapalı veya yanıt vermiyor');
                    return false;
                }
            } catch (error) {
                addLog('❌ Port 8080 kapalı veya yanıt vermiyor');
                return false;
            }
        } catch (error) {
            addLog(`HATA: Port kontrolü yapılamadı: ${error}`);
            return false;
        }
    };

    const scanWifiDevices = async () => {
        try {
            clearLogs();
            addLog('WiFi taraması başlatılıyor...');

            // Sunucuyu yeniden başlat
            await stopServer();
            await startServer();

            setDevices([]);
            setIsScanning(true);
            setScanProgress(0);

            // Ağ bilgilerini al
            const networkInfo = await NetInfo.fetch() as NetworkState;

            // WiFi SSID kontrolü
            let currentSSID;
            try {
                currentSSID = await WifiManager.getCurrentWifiSSID();
                addLog(`Bağlı WiFi: ${currentSSID || 'Bilinmiyor'}`);
            } catch (error) {
                addLog(`UYARI: WiFi SSID alınamadı: ${error}`);
            }

            // IP adresini al
            if (!networkInfo.details?.ipAddress) {
                addLog('HATA: IP adresi alınamadı');
                Alert.alert(
                    'Bağlantı Hatası',
                    'IP adresi alınamadı! Lütfen WiFi bağlantınızı kontrol edin.',
                    [{ text: 'Tamam' }]
                );
                setIsScanning(false);
                return;
            }

            const ipAddress = networkInfo.details.ipAddress;
            const subnet = ipAddress.substring(0, ipAddress.lastIndexOf('.'));
            addLog(`Yerel IP: ${ipAddress}`);
            addLog(`Alt ağ: ${subnet}`);

            // Tarama başlamadan önce kısa bir bekleme
            await new Promise(resolve => setTimeout(resolve, 2000));

            // IP aralığını tara
            const startIp = 1;
            const endIp = 255;
            const timeout = 1000; // Timeout süresini artırdık
            let foundDevices = 0;
            let completedScans = 0;

            addLog('IP taraması başlıyor...');

            // Paralel tarama için IP'leri gruplara böl
            const batchSize = 10; // Aynı anda daha az IP tara
            for (let i = startIp; i <= endIp; i += batchSize) {
                const endIndex = Math.min(i + batchSize - 1, endIp);
                const promises = [];

                for (let j = i; j <= endIndex; j++) {
                    const targetIP = `${subnet}.${j}`;
                    if (targetIP === ipAddress) {
                        completedScans++;
                        continue; // Kendi IP'mizi atlayalım
                    }

                    // Her IP taraması arasında kısa bir bekleme
                    await new Promise(resolve => setTimeout(resolve, 100));

                    promises.push(
                        new Promise<void>(async (resolve) => {
                            try {
                                addLog(`Taranan IP: ${targetIP}`);
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), timeout);

                                const response = await fetch(`http://${targetIP}:${PORT}/ping`, {
                                    method: 'GET',
                                    headers: {
                                        'Accept': 'application/json',
                                        'Cache-Control': 'no-cache'
                                    },
                                    signal: controller.signal
                                });

                                clearTimeout(timeoutId);

                                if (response.ok) {
                                    const data = await response.json();
                                    if (data && data.deviceName) {
                                        foundDevices++;
                                        const deviceInfo = `\n============================\nCİHAZ BULUNDU!\nIP: ${targetIP}\nİsim: ${data.deviceName}\n============================\n`;
                                        addLog(deviceInfo);

                                        setDevices(prevDevices => {
                                            const exists = prevDevices.find(d => d.ip === targetIP);
                                            if (exists) return prevDevices;
                                            return [...prevDevices, {
                                                id: targetIP,
                                                name: data.deviceName,
                                                ip: targetIP
                                            }];
                                        });

                                        // Cihaz bulunduğunda bildirim göster
                                        Alert.alert(
                                            'Cihaz Bulundu!',
                                            `IP: ${targetIP}\nİsim: ${data.deviceName}`,
                                            [{ text: 'Tamam' }]
                                        );
                                    } else {
                                        addLog(`UYARI: ${targetIP} adresinden cihaz ismi alınamadı`);
                                    }
                                }
                            } catch (error) {
                                // IP yanıt vermedi
                            } finally {
                                completedScans++;
                                setScanProgress(Math.round((completedScans / (endIp - startIp)) * 100));
                                resolve();
                            }
                        })
                    );
                }

                // Her batch'i bekle
                await Promise.all(promises);
            }

            addLog(`\n============================\nTarama tamamlandı!\nBulunan cihaz sayısı: ${foundDevices}\n============================\n`);
            setIsScanning(false);
            setScanProgress(0);

            if (foundDevices === 0) {
                Alert.alert(
                    'Bilgi',
                    'Hiç cihaz bulunamadı. Lütfen şunları kontrol edin:\n\n' +
                    '1. Her iki cihaz da aynı WiFi ağına bağlı olmalı\n' +
                    '2. Her iki cihazda da uygulama çalışıyor olmalı\n' +
                    '3. Her iki cihazın da IP adresi aynı alt ağda olmalı\n' +
                    '4. WiFi ağının cihazlar arası iletişime izin verdiğinden emin olun',
                    [{ text: 'Tamam' }]
                );
            }

        } catch (error) {
            addLog(`HATA: Beklenmeyen hata: ${error}`);
            setIsScanning(false);
            setScanProgress(0);
            Alert.alert(
                'Tarama Hatası',
                'WiFi cihazları taranırken bir hata oluştu!',
                [{ text: 'Tamam' }]
            );
        }
    };

    const sendWifiMessage = async (deviceIP: string) => {
        if (!message.trim()) {
            Alert.alert('Mesaj boş', 'Lütfen bir mesaj yaz!')
            return
        }

        try {
            const response = await fetch(`http://${deviceIP}:${PORT}/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message,
                    sender: deviceName
                })
            })

            if (response.ok) {
                Alert.alert('Başarılı', 'Mesaj gönderildi!')
                setMessage('')
            } else {
                throw new Error('Mesaj gönderilemedi')
            }
        } catch (error) {
            console.error('WiFi mesaj gönderme hatası:', error)
            Alert.alert('Hata', 'Mesaj gönderilemedi!')
        }
    }

    const getSocketAddress = (address: string | AddressInfo | {}): string => {
        if (typeof address === 'string') {
            return address;
        }
        if (address && typeof address === 'object' && 'address' in address) {
            return (address as AddressInfo).address;
        }
        return 'Bilinmeyen';
    };

    const stopServer = () => {
        return new Promise<void>((resolve) => {
            if (server) {
                try {
                    // Tüm bağlantıları kapat
                    server.close(() => {
                        addLog('Sunucu başarıyla durduruldu');
                        setServer(null);
                        resolve();
                    });

                    // 3 saniye içinde kapanmazsa zorla kapat
                    setTimeout(() => {
                        if (server) {
                            setServer(null);
                            resolve();
                        }
                    }, 3000);
                } catch (error) {
                    addLog('UYARI: Sunucu durdurulurken hata: ' + error);
                    setServer(null);
                    resolve();
                }
            } else {
                resolve();
            }
        });
    };

    const startServer = async () => {
        try {
            addLog('Sunucu başlatılıyor...');

            // Önce mevcut sunucuyu durdur ve port'un serbest kalmasını bekle
            await stopServer();

            // Port'un serbest kalması için kısa bir bekleme
            await new Promise(resolve => setTimeout(resolve, 1000));

            addLog('TCPSocket sunucusu oluşturuluyor...');

            // Server options
            const options = {
                host: '0.0.0.0',
                port: PORT
            };

            // Basitleştirilmiş sunucu oluşturma
            const tcpServer = TcpSocket.createServer((socket: TcpSocketClient) => {
                addLog('Yeni bağlantı alındı');

                socket.on('data', (data: Buffer | string) => {
                    try {
                        const message = typeof data === 'string' ? data : data.toString();
                        addLog('Veri alındı: ' + message);

                        // Ping isteği kontrolü
                        if (message.includes('GET /ping')) {
                            const response = JSON.stringify({
                                status: 'success',
                                deviceName: deviceName,
                                timestamp: new Date().toISOString()
                            });

                            const httpResponse =
                                'HTTP/1.1 200 OK\r\n' +
                                'Content-Type: application/json\r\n' +
                                'Access-Control-Allow-Origin: *\r\n' +
                                'Content-Length: ' + response.length + '\r\n' +
                                '\r\n' +
                                response;

                            socket.write(httpResponse);
                            addLog('Ping yanıtı gönderildi: ' + response);
                        }
                    } catch (error) {
                        addLog('HATA: Mesaj işlenirken hata: ' + error);
                    }
                });

                socket.on('error', (error: Error) => {
                    addLog('Socket hatası: ' + error);
                });

                socket.on('close', () => {
                    addLog('Bağlantı kapandı');
                });
            });

            if (!tcpServer) {
                throw new Error('Sunucu nesnesi oluşturulamadı');
            }

            tcpServer.on('error', (error: Error) => {
                addLog('HATA: Sunucu hatası: ' + error);
                if ((error as any).code === 'EADDRINUSE') {
                    addLog('Port 8080 kullanımda. Port serbest bırakılıyor...');
                    stopServer().then(() => {
                        setTimeout(() => {
                            addLog('Sunucu yeniden başlatılıyor...');
                            startServer();
                        }, 5000);
                    });
                } else {
                    setTimeout(() => {
                        addLog('Sunucu yeniden başlatılıyor...');
                        startServer();
                    }, 5000);
                }
            });

            tcpServer.on('listening', () => {
                addLog('✅ Sunucu başarıyla başlatıldı. Port: ' + PORT);
            });

            // Sunucuyu başlat
            tcpServer.listen(options);
            addLog('Sunucu dinlemeye başladı');

            setServer(tcpServer);
            addLog('Sunucu state\'e kaydedildi');

        } catch (error) {
            addLog('HATA: Sunucu başlatılamadı: ' + error);
            setTimeout(() => {
                addLog('Sunucu yeniden başlatılıyor...');
                startServer();
            }, 5000);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar backgroundColor={theme.colors.primary} barStyle="light-content" />

            <View style={styles.header}>
                <Text style={styles.title}>Yakındaki Cihazlar</Text>
                <Button
                    mode="contained"
                    onPress={connectionType === 'bluetooth' ? startScan : scanWifiDevices}
                    style={styles.scanButton}
                    disabled={isScanning}
                >
                    {isScanning ? 'Taranıyor...' : 'Yeniden Tara'}
                </Button>
            </View>

            {/* Bağlantı Türü Seçimi */}
            {/* <View style={styles.connectionTypeContainer}>
                <Text style={styles.connectionTypeTitle}>Bağlantı Türü</Text>
                <SegmentedButtons
                    value={connectionType}
                    onValueChange={setConnectionType}
                    buttons={[
                        {
                            value: 'bluetooth',
                            label: 'Bluetooth',
                            icon: 'bluetooth',
                            style: connectionType === 'bluetooth' ? styles.activeButton : styles.inactiveButton
                        },
                        {
                            value: 'wifi',
                            label: 'WiFi',
                            icon: 'wifi',
                            style: connectionType === 'wifi' ? styles.activeButton : styles.inactiveButton
                        }
                    ]}
                    style={styles.segmentedButtons}
                />
            </View> */}

            <View style={styles.deviceNameContainer}>
                {isEditingName ? (
                    <View style={styles.deviceNameInputContainer}>
                        <TextInput
                            style={styles.deviceNameInput}
                            value={deviceName}
                            onChangeText={setDeviceName}
                            placeholder="Cihaz ismini girin"
                        />
                        <Button
                            mode="contained"
                            onPress={() => saveDeviceName(deviceName)}
                            style={styles.saveButton}
                        >
                            Kaydet
                        </Button>
                    </View>
                ) : (
                    <View style={styles.deviceNameDisplayContainer}>
                        <Text style={styles.deviceNameText}>Cihaz İsmi: {deviceName}</Text>
                        <IconButton
                            icon="pencil"
                            size={20}
                            onPress={() => setIsEditingName(true)}
                        />
                    </View>
                )}
            </View>

            <TextInput
                placeholder="Göndereceğin mesajı yaz..."
                style={styles.input}
                value={message}
                onChangeText={setMessage}
            />

            {devices.length === 0 && !isScanning ? (
                <View style={styles.emptyStateContainer}>
                    <Text style={styles.emptyStateText}>
                        {connectionType === 'bluetooth'
                            ? 'Henüz hiç Bluetooth cihazı bulunamadı'
                            : 'Henüz hiç WiFi cihazı bulunamadı'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={devices}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <Surface style={styles.deviceItem}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.deviceName}>{item.name || 'İsimsiz Cihaz'}</Text>
                                <Text style={styles.deviceId}>{connectionType === 'bluetooth' ? item.id : item.ip}</Text>
                            </View>
                            <Button
                                mode="contained"
                                onPress={() => connectionType === 'bluetooth' ? sendMessage(item.id) : sendWifiMessage(item.ip)}
                            >
                                Mesaj Gönder ({connectionType === 'bluetooth' ? 'BT' : 'WiFi'})
                            </Button>
                        </Surface>
                    )}
                    contentContainerStyle={{ padding: 10 }}
                />
            )}

            <View style={styles.logContainer}>
                <View style={styles.logHeader}>
                    <Text style={styles.logTitle}>Tarama Logları</Text>
                    <View style={styles.logActions}>
                        <Button
                            mode="text"
                            onPress={() => setShowLogModal(true)}
                            style={styles.logButton}
                        >
                            Detaylar
                        </Button>
                        <Button
                            mode="text"
                            onPress={clearLogs}
                            style={styles.logButton}
                        >
                            Temizle
                        </Button>
                    </View>
                </View>
                <ScrollView
                    style={styles.logScrollView}
                    ref={scrollViewRef => {
                        if (scrollViewRef) {
                            scrollViewRef.scrollToEnd({ animated: true });
                        }
                    }}
                >
                    {logs.slice(-5).map((log, index) => (
                        <Text key={index} style={[
                            styles.logText,
                            log.includes('HATA:') && styles.errorLog
                        ]}>
                            {log}
                        </Text>
                    ))}
                </ScrollView>
                {isScanning && (
                    <View style={styles.progressContainer}>
                        <Text style={styles.progressText}>Tarama: %{scanProgress}</Text>
                    </View>
                )}
            </View>

            {/* Log Modal */}
            <Portal>
                <Modal
                    visible={showLogModal}
                    onDismiss={() => setShowLogModal(false)}
                    contentContainerStyle={styles.modalContainer}
                >
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Detaylı Loglar</Text>
                        <IconButton
                            icon="close"
                            size={24}
                            onPress={() => setShowLogModal(false)}
                        />
                    </View>
                    <ScrollView style={styles.modalScrollView}>
                        {logs.map((log, index) => (
                            <Text key={index} style={[
                                styles.modalLogText,
                                log.includes('HATA:') && styles.errorLog
                            ]}>
                                {log}
                            </Text>
                        ))}
                    </ScrollView>
                </Modal>
            </Portal>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0F2F5',
    },
    connectionTypeContainer: {
        backgroundColor: '#fff',
        padding: 16,
        marginBottom: 8,
        elevation: 2,
    },
    connectionTypeTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
        color: '#333',
    },
    segmentedButtons: {
        marginHorizontal: 0,
    },
    activeButton: {
        backgroundColor: '#6200ee',
    },
    inactiveButton: {
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#6200ee',
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    scanButton: {
        borderRadius: 20,
    },
    deviceNameContainer: {
        padding: 16,
        backgroundColor: '#fff',
        margin: 16,
        borderRadius: 8,
        elevation: 2,
    },
    deviceNameInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    deviceNameInput: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        padding: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    saveButton: {
        borderRadius: 4,
    },
    deviceNameDisplayContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    deviceNameText: {
        fontSize: 16,
        fontWeight: '500',
    },
    input: {
        backgroundColor: '#fff',
        margin: 16,
        padding: 12,
        borderRadius: 8,
    },
    deviceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        elevation: 2,
    },
    deviceName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    deviceId: {
        fontSize: 12,
        color: '#555',
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyStateText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
    logContainer: {
        backgroundColor: '#f5f5f5',
        padding: 10,
        margin: 10,
        borderRadius: 8,
        maxHeight: 200,
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
    },
    logActions: {
        flexDirection: 'row',
    },
    logButton: {
        padding: 0,
        marginLeft: 8,
    },
    logScrollView: {
        maxHeight: 100,
    },
    logText: {
        fontSize: 12,
        color: '#000',
        marginBottom: 2,
    },
    errorLog: {
        color: 'red',
        fontWeight: 'bold',
    },
    progressContainer: {
        marginTop: 5,
        padding: 5,
        backgroundColor: '#e0e0e0',
        borderRadius: 4,
    },
    progressText: {
        fontSize: 12,
        color: '#333',
        textAlign: 'center',
    },
    modalContainer: {
        backgroundColor: 'white',
        margin: 20,
        padding: 20,
        borderRadius: 8,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    modalScrollView: {
        maxHeight: '80%',
    },
    modalLogText: {
        fontSize: 12,
        color: '#000',
        marginBottom: 4,
        padding: 4,
        backgroundColor: '#f5f5f5',
        borderRadius: 4,
    },
    logTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
})
