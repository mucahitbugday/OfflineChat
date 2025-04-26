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

export default function DiscoverScreen() {
    const theme = useTheme()
    const [devices, setDevices] = useState<any[]>([])
    const [message, setMessage] = useState('')
    const [isScanning, setIsScanning] = useState(false)
    const [deviceName, setDeviceName] = useState('')
    const [isEditingName, setIsEditingName] = useState(false)
    const [connectionType, setConnectionType] = useState<'bluetooth' | 'wifi'>('bluetooth')
    const bleManager = useRef(getBleManager()).current
    const scanTimeout = useRef<NodeJS.Timeout | null>(null)
    const isMounted = useRef(true)
    const [logs, setLogs] = useState<string[]>([]);
    const [showLogModal, setShowLogModal] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);

    useEffect(() => {
        isMounted.current = true
        loadDeviceName()
        checkPermissionsAndScan()

        return () => {
            isMounted.current = false
            cleanup()
        }
    }, [connectionType])

    const loadDeviceName = async () => {
        try {
            const savedName = await AsyncStorage.getItem(DEVICE_NAME_KEY)
            if (savedName) {
                setDeviceName(savedName)
            } else {
                // Varsayılan cihaz ismi
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
                startScan()
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

    const checkWifiPermissions = async () => {
        if (Platform.OS === 'android') {
            try {
                const locationPermission = await check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)
                if (locationPermission !== RESULTS.GRANTED) {
                    await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)
                }
                return true
            } catch (error) {
                console.error('WiFi izin hatası:', error)
                return false
            }
        }
        return true
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

            // Önce port durumunu kontrol et
            const isPortOpen = await checkPortStatus();
            if (!isPortOpen) {
                Alert.alert(
                    'Port Hatası',
                    'Port 8080 kapalı veya yanıt vermiyor. Lütfen uygulamayı her iki cihazda da yeniden başlatın.',
                    [{ text: 'Tamam' }]
                );
                return;
            }

            setDevices([]);
            setIsScanning(true);
            setScanProgress(0);

            // Mevcut WiFi ağını al
            try {
                const currentSSID = await WifiManager.getCurrentWifiSSID();
                const currentBSSID = await WifiManager.getBSSID();

                addLog(`Bağlı WiFi: ${currentSSID || 'Bilinmiyor'}`);
                addLog(`BSSID: ${currentBSSID || 'Bilinmiyor'}`);

                if (!currentSSID) {
                    addLog('HATA: WiFi ağına bağlı değil');
                    Alert.alert(
                        'Bağlantı Hatası',
                        'WiFi ağına bağlı değilsiniz!',
                        [{ text: 'Tamam' }]
                    );
                    return;
                }
            } catch (error) {
                addLog(`HATA: WiFi bilgileri alınamadı: ${error}`);
                return;
            }

            // Ağ bilgilerini al
            try {
                const networkInfo = await NetInfo.fetch();
                addLog(`Ağ tipi: ${networkInfo.type}`);
                addLog(`Bağlantı durumu: ${networkInfo.isConnected ? 'Bağlı' : 'Bağlı değil'}`);

                if (networkInfo.type !== 'wifi' || !networkInfo.isConnected) {
                    addLog('HATA: WiFi bağlantısı yok');
                    Alert.alert(
                        'Bağlantı Hatası',
                        'WiFi bağlantısı yok!',
                        [{ text: 'Tamam' }]
                    );
                    return;
                }

                if (!networkInfo.details || !('ipAddress' in networkInfo.details) || !networkInfo.details.ipAddress) {
                    addLog('HATA: IP adresi alınamadı');
                    Alert.alert(
                        'Bağlantı Hatası',
                        'IP adresi alınamadı!',
                        [{ text: 'Tamam' }]
                    );
                    return;
                }

                const ipAddress = networkInfo.details.ipAddress;
                const subnet = ipAddress.substring(0, ipAddress.lastIndexOf('.') + 1);

                addLog(`IP adresi: ${ipAddress}`);
                addLog(`Alt ağ: ${subnet}`);

                // Alt ağdaki tüm IP'leri tara
                const totalIPs = 255;
                let foundDevices = 0;

                for (let i = 1; i <= totalIPs; i++) {
                    const targetIP = `${subnet}${i}`;
                    setScanProgress(Math.round((i / totalIPs) * 100));

                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 500);

                        const response = await fetch(`http://${targetIP}:${PORT}/ping`, {
                            method: 'GET',
                            signal: controller.signal
                        });

                        clearTimeout(timeoutId);

                        if (response.ok) {
                            const data = await response.json();
                            foundDevices++;
                            addLog(`Cihaz bulundu: ${targetIP} (${data.deviceName || 'İsimsiz'})`);

                            if (data.deviceName) {
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
                        // Port kapalı veya cihaz yanıt vermiyor
                        continue;
                    }
                }

                addLog(`Tarama tamamlandı. ${foundDevices} cihaz bulundu.`);
            } catch (error) {
                addLog(`HATA: Ağ bilgileri alınamadı: ${error}`);
                Alert.alert(
                    'Bağlantı Hatası',
                    'Ağ bilgileri alınamadı!',
                    [{ text: 'Tamam' }]
                );
            }

            setIsScanning(false);
            setScanProgress(0);
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
                                Mesaj Gönder
                            </Button>
                        </Surface>
                    )}
                    contentContainerStyle={{ padding: 10 }}
                />
            )}

            {/* Log Panel */}
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
