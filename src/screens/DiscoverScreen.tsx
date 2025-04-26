import { StyleSheet, View, FlatList, TouchableOpacity, Alert, TextInput, Platform } from 'react-native'
import React, { useState, useEffect, useRef } from 'react'
import { Text, useTheme, Avatar, Surface, Button, IconButton, SegmentedButtons } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { BleManager, State } from 'react-native-ble-plx'
import { PERMISSIONS, request, RESULTS, check } from 'react-native-permissions'
import NetInfo from '@react-native-community/netinfo'
import WifiManager from 'react-native-wifi-reborn'

// Define service and characteristic UUIDs
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'

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
    const bleManager = useRef(getBleManager()).current
    const scanTimeout = useRef<NodeJS.Timeout | null>(null)
    const isMounted = useRef(true)

    useEffect(() => {
        isMounted.current = true
        checkPermissionsAndScan()

        return () => {
            isMounted.current = false
            cleanup()
        }
    }, [])

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
                null,
                {
                    allowDuplicates: false,
                    scanMode: 2, // SCAN_MODE_BALANCED
                    callbackType: 1 // CALLBACK_TYPE_ALL_MATCHES
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

                    if (device && device.name) {
                        setDevices(prevDevices => {
                            const exists = prevDevices.find(d => d.id === device.id)
                            if (exists) return prevDevices
                            return [...prevDevices, device]
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

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar backgroundColor={theme.colors.primary} barStyle="light-content" />
            <View style={styles.header}>
                <Text style={styles.title}>Yakındaki Cihazlar</Text>
                <Button
                    mode="contained"
                    onPress={startScan}
                    style={styles.scanButton}
                    disabled={isScanning}
                >
                    {isScanning ? 'Taranıyor...' : 'Yeniden Tara'}
                </Button>
            </View>

            <TextInput
                placeholder="Göndereceğin mesajı yaz..."
                style={styles.input}
                value={message}
                onChangeText={setMessage}
            />

            <FlatList
                data={devices}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <Surface style={styles.deviceItem}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.deviceName}>{item.name}</Text>
                            <Text style={styles.deviceId}>{item.id}</Text>
                        </View>
                        <Button mode="contained" onPress={() => sendMessage(item.id)}>
                            Mesaj Gönder
                        </Button>
                    </Surface>
                )}
                contentContainerStyle={{ padding: 10 }}
            />
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
    scanButton: {
        borderRadius: 20,
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
})
