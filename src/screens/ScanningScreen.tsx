import { Alert, FlatList, Platform, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import React, { useEffect, useRef, useState } from 'react'
import { Button, IconButton, Modal, Portal, SegmentedButtons, Surface, TextInput, useTheme } from 'react-native-paper'
import { DEVICE_NAME_KEY, StorageService } from '../storage/StorageService'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PERMISSIONS, request, RESULTS, check } from 'react-native-permissions'
import { BleManager, State } from 'react-native-ble-plx'
import TcpSocket from 'react-native-tcp-socket'
import NetInfo from '@react-native-community/netinfo'
import WifiManager from 'react-native-wifi-reborn'
import DeviceInfo from 'react-native-device-info';

// Define service and characteristic UUIDs
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'
const WIFI_SERVICE_ID = 'offline-chat-wifi-service' // WiFi bağlantıları için tanımlayıcı
const PORT = 8080 // WiFi mesajlaşma için port numarası



let bleManagerInstance: BleManager | null = null;
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


const getBleManager = () => {
    if (!bleManagerInstance) {
        bleManagerInstance = new BleManager();
    }
    return bleManagerInstance;
};


export default function ScanningScreen({ navigation }: any) {
    const theme = useTheme()

    //#region Device Name
    const [isEditingName, setIsEditingName] = useState(false)
    const [deviceName, setDeviceName] = useState('')
    const saveDeviceName = async (name: string) => {
        try {
            await StorageService.setItem(DEVICE_NAME_KEY, name)
            setDeviceName(name)
            setIsEditingName(false)
        } catch (error) {
            console.error('Cihaz ismi kaydetme hatası:', error)
        }
    }
    const loadDeviceName = async () => {
        try {
            const savedName = await StorageService.getItem<string>(DEVICE_NAME_KEY)
            if (savedName) {
                setDeviceName(savedName)
            } else {
                const defaultName = `Cihaz-${Math.floor(Math.random() * 1000)}`
                setDeviceName(defaultName)
                await StorageService.setItem(DEVICE_NAME_KEY, defaultName)
            }
        } catch (error) {
            console.error('Cihaz ismi yükleme hatası:', error)
        }
    }
    //#endregion

    //#region Log Modal
    const [showLogModal, setShowLogModal] = useState(false)
    const [logs, setLogs] = useState<string[]>([])
    const addLog = (message: string) => {
        console.log(message); // Konsola da yazdır
        setLogs(prevLogs => {
            const newLogs = [...prevLogs, `${new Date().toLocaleTimeString()}: ${message}`];
            return newLogs; // Son 50 logu tut
        });
    };
    const clearLogs = () => {
        setLogs([])
    }
    //#endregion

    //#region Scanning
    const [devices, setDevices] = useState<any[]>([])
    const [isScanning, setIsScanning] = useState(false)
    const [connectionType, setConnectionType] = useState<'bluetooth' | 'wifi'>('wifi')
    const isMounted = useRef(true)
    const bleManager = useRef(getBleManager()).current
    const [server, setServer] = useState<TcpSocketServer | null>(null);
    const scanTimeout = useRef<NodeJS.Timeout | null>(null)


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
                [{ text: 'Tamam', onPress: () => { if (isMounted.current) { setIsScanning(false) } } }]
            )
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
    const startServer = async () => {
        try {
            addLog('Sunucu başlatılıyor...');

            // Önce mevcut sunucuyu durdur
            await stopServer();

            // Port'un serbest kalması için bekle
            await new Promise(resolve => setTimeout(resolve, 1000));

            const uniqueId = await DeviceInfo.getUniqueId();
            addLog(`Cihaz ID: ${uniqueId}`);

            const options = {
                host: '0.0.0.0',
                port: PORT,
                reuseAddress: true
            };

            addLog(`Sunucu ayarları: ${JSON.stringify(options)}`);

            const tcpServer = TcpSocket.createServer((socket: TcpSocketClient) => {
                addLog('Yeni bağlantı alındı');

                socket.on('data', (data: Buffer | string) => {
                    try {
                        const message = typeof data === 'string' ? data : data.toString();
                        addLog(`Gelen veri: ${message}`);

                        if (message.includes('GET /ping')) {
                            const response = JSON.stringify({ 
                                status: 'success', 
                                deviceName: deviceName, 
                                uniqueId: uniqueId, 
                                serviceId: WIFI_SERVICE_ID, // WiFi servis tanımlayıcısını ekle
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
                            addLog('Ping yanıtı gönderildi');
                        }
                    } catch (error) {
                        addLog(`HATA: Mesaj işleme hatası: ${error}`);
                    }
                });

                socket.on('error', (error: Error) => {
                    addLog(`Socket hatası: ${error.message}`);
                });

                socket.on('close', () => {
                    addLog('Bağlantı kapandı');
                });
            });

            tcpServer.on('error', (error: Error) => {
                addLog(`HATA: Sunucu hatası: ${error.message}`);
                if ((error as any).code === 'EADDRINUSE') {
                    addLog('Port kullanımda, yeniden başlatılıyor...');
                    setTimeout(() => startServer(), 2000);
                }
            });

            tcpServer.on('listening', () => {
                addLog(`✅ Sunucu başarıyla başlatıldı. Port: ${PORT}`);
            });

            tcpServer.listen(options);
            setServer(tcpServer);

        } catch (error) {
            addLog(`HATA: Sunucu başlatma hatası: ${error}`);
            setTimeout(() => startServer(), 2000);
        }
    };

    const stopServer = async () => {
        return new Promise<void>((resolve) => {
            if (server) {
                try {
                    server.close(() => {
                        addLog('Sunucu başarıyla durduruldu');
                        setServer(null);
                        resolve();
                    });

                    // 2 saniye içinde kapanmazsa zorla kapat
                    setTimeout(() => {
                        if (server) {
                            setServer(null);
                            resolve();
                        }
                    }, 2000);
                } catch (error) {
                    addLog(`UYARI: Sunucu durdurma hatası: ${error}`);
                    setServer(null);
                    resolve();
                }
            } else {
                resolve();
            }
        });
    };

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
    //#endregion

    //#region Bluetooth Scan
    const startBluetoothScan = async () => {
        if (!isMounted.current) return

        try {
            const isBluetoothReady = await checkBluetoothState()
            if (!isBluetoothReady) return

            setDevices([])
            setIsScanning(true)

            stopWifiScan()
            clearLogs()
            addLog('Bluetooth taraması başlatılıyor...')

            bleManager.startDeviceScan(
                [SERVICE_UUID],
                {
                    allowDuplicates: false,
                    scanMode: 1, // SCAN_MODE_LOW_LATENCY
                    callbackType: 1, // CALLBACK_TYPE_ALL_MATCHES
                },
                async (error, device) => {
                    if (!isMounted.current) return

                    if (error) {
                        console.error('Tarama hatası:', error)
                        addLog(`Tarama hatası: ${error}`)
                        return
                    }

                    if (device) {
                        try {
                            await device.discoverAllServicesAndCharacteristics()
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
                        } catch (error) {
                            console.error('Cihaz işleme hatası:', error)
                            addLog(`Cihaz işleme hatası: ${error}`)
                        }
                    }
                }
            )

            if (scanTimeout.current) {
                clearTimeout(scanTimeout.current)
            }

            scanTimeout.current = setTimeout(() => {
                if (isMounted.current) {
                    stopBluetoothScan()
                    addLog('Bluetooth taraması tamamlandı')
                }
            }, 60000)

        } catch (error) {
            console.error('Tarama başlatma hatası:', error)
            addLog(`Tarama başlatma hatası: ${error}`)
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
    const stopBluetoothScan = () => {
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
    //#endregion

    //#region WiFi Scan
    const [scanProgress, setScanProgress] = useState(0);

    const startWifiScan = async () => {
        try {
            clearLogs();
            addLog('WiFi taraması başlatılıyor...');

            await stopServer();
            await startServer();

            setDevices([]);
            setIsScanning(true);
            setScanProgress(0);

            const networkInfo = await NetInfo.fetch() as NetworkState;

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

            await new Promise(resolve => setTimeout(resolve, 2000));

            const startIp = 0;
            const endIp = 255;
            const timeout = 2000;
            let foundDevices = 0;
            let completedScans = 0;

            addLog('IP taraması başlıyor...');

            if (!setIsScanning) return;

            const batchSize = 5;
            for (let i = startIp; i <= endIp; i += batchSize) {
                const endIndex = Math.min(i + batchSize - 1, endIp);
                const promises = [];

                for (let j = i; j <= endIndex; j++) {
                    const targetIP = `${subnet}.${j}`;
                    if (targetIP === ipAddress) {
                        completedScans++;
                        continue;
                    }

                    await new Promise(resolve => setTimeout(resolve, 50));

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
                                    // Sadece aynı servis ID'sine sahip cihazları listele
                                    if (data && data.deviceName && data.serviceId === WIFI_SERVICE_ID) {
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
                    '2. Her iki cihazda da uygulama çalışıyor olmalı',
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
    const stopWifiScan = () => {

        if (isMounted.current) {
            setIsScanning(false)
            setScanProgress(0)
        }
    }

    //#endregion
 
    const sendMessage = async (device: any) => {
        try {
            addLog('Mesaj gönderme işlemi başlatılıyor...');
            await stopServer();
            addLog('Sunucu durduruldu, ChatDetailScreen\'e geçiliyor...');
            
            navigation.navigate('ChatDetailScreen', { 
                PORT: PORT, 
                deviceID: device.id, 
                deviceName: device.name, 
                deviceIP: device.ip, 
                connectionType: connectionType 
            });
        } catch (error) {
            addLog(`HATA: Mesaj gönderme hatası: ${error}`);
            Alert.alert('Hata', 'Mesaj gönderme işlemi başlatılamadı. Lütfen tekrar deneyin.');
        }
    }

    useEffect(() => {
        loadDeviceName();
        checkPermissionsAndScan();
        startServer();

        return () => {
            isMounted.current = false;
            cleanup();
            stopServer();
        };
    }, []);
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar backgroundColor={theme.colors.primary} barStyle="light-content" />

            <View style={styles.header}>
                <Text style={styles.title}>Yakındaki Cihazlar</Text>
                <Button
                    mode="contained"
                    onPress={connectionType === 'bluetooth' ? startBluetoothScan : startWifiScan}
                    style={styles.scanButton}
                    disabled={isScanning}
                >
                    {isScanning ? 'Taranıyor...' : 'Yeniden Tara'}
                </Button>

            </View>

            <View style={styles.connectionTypeContainer}>
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
            </View>

            {isScanning && (
                <View style={styles.progressContainer}>
                    <Text style={styles.progressText}>Tarama: %{scanProgress}</Text>
                </View>
            )}

            <View style={styles.deviceNameContainer}>
                {isEditingName ? (
                    <View style={styles.deviceNameInputContainer}>
                        <TextInput style={styles.deviceNameInput} value={deviceName} onChangeText={setDeviceName} placeholder="Cihaz ismini girin" />
                        <Button mode="contained" onPress={() => saveDeviceName(deviceName)} style={styles.saveButton}>
                            Kaydet
                        </Button>
                    </View>
                ) : (
                    <View style={styles.deviceNameDisplayContainer}>
                        <Text style={styles.deviceNameText}>Cihaz İsmi: {deviceName}</Text>
                        <IconButton icon="pencil" size={20} onPress={() => setIsEditingName(true)} />
                    </View>
                )}
            </View>

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
                            <Button mode="contained" onPress={() => sendMessage(item)}>
                                Mesaj Gönder ({connectionType === 'bluetooth' ? 'BT' : 'WiFi'})
                            </Button>
                        </Surface>
                    )}
                    contentContainerStyle={{ padding: 10 }}
                />
            )}



            {/* Log Modal */}
            <Button
                mode="text"
                onPress={() => setShowLogModal(true)}
                style={styles.logButton}
            >
                Detaylar
            </Button>
            <Portal>
                <Modal visible={showLogModal} onDismiss={() => setShowLogModal(false)} contentContainerStyle={styles.modalContainer} >
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Detaylı Loglar</Text>
                        <IconButton icon="close" size={24} onPress={() => setShowLogModal(false)} />
                    </View>
                    <ScrollView style={styles.modalScrollView}>
                        {[...logs].reverse().map((log, index) => (
                            <Text key={logs.length - 1 - index} style={[styles.modalLogText, log.includes('HATA:') && styles.modalErrorLog,]}>
                                {logs.length - index}-{log}
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
    activeButton: {
        backgroundColor: '#6200ee',
    },
    inactiveButton: {
        backgroundColor: '#f5f5f5',
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
    scanButton: {
        borderRadius: 20,
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
    modalErrorLog: {
        color: 'red',
        fontWeight: 'bold',
    },
    logButton: {
        padding: 0,
        marginLeft: 8,
    },
})