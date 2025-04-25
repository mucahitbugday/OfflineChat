import { StyleSheet, View, FlatList, TouchableOpacity, Alert, TextInput } from 'react-native'
import React, { useState, useEffect } from 'react'
import { Text, useTheme, Avatar, Surface, Button, IconButton, SegmentedButtons } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { BleManager } from 'react-native-ble-plx'
import { PERMISSIONS, request, RESULTS } from 'react-native-permissions'
import NetInfo from '@react-native-community/netinfo'
import WifiManager from 'react-native-wifi-reborn'

type RootStackParamList = {
    ChatDetailScreen: { chatId: string }
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

type DiscoveredUserProps = {
    id: string
    name: string
    distance: string
    connectionType: string
    avatar: string
}

// Mock data for discovered users
const mockDiscoveredUsers = [
    {
        id: '1',
        name: 'John Doe',
        distance: 'Nearby',
        connectionType: 'WiFi',
        avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
    },
    {
        id: '2',
        name: 'Jane Smith',
        distance: '2m away',
        connectionType: 'Bluetooth',
        avatar: 'https://randomuser.me/api/portraits/women/1.jpg',
    },
    {
        id: '3',
        name: 'Mike Johnson',
        distance: '5m away',
        connectionType: 'Bluetooth',
        avatar: 'https://randomuser.me/api/portraits/men/2.jpg',
    },
]

const DiscoveredUser = ({ user, onSendMessage }: { user: typeof mockDiscoveredUsers[0], onSendMessage: () => void }) => {
    const navigation = useNavigation<NavigationProp>()
    const theme = useTheme()

    return (
        <TouchableOpacity
            onPress={() => navigation.navigate('ChatDetailScreen', { chatId: user.id })}
            activeOpacity={0.7}
        >
            <Surface style={styles.userItem}>
                <Avatar.Image
                    size={50}
                    source={{ uri: user.avatar }}
                    style={styles.avatar}
                />
                <View style={styles.userContent}>
                    <View style={styles.userHeader}>
                        <Text style={styles.userName}>{user.name}</Text>
                        <View style={styles.connectionType}>
                            <IconButton
                                icon={user.connectionType === 'WiFi' ? 'wifi' : 'bluetooth'}
                                size={16}
                                iconColor={theme.colors.primary}
                                style={styles.connectionIcon}
                            />
                            <Text style={styles.connectionText}>{user.connectionType}</Text>
                        </View>
                    </View>
                    <Text style={styles.distance}>{user.distance}</Text>
                </View>
                <Button
                    mode="contained"
                    onPress={onSendMessage}
                    style={styles.chatButton}
                    labelStyle={styles.chatButtonLabel}
                >
                    Chat
                </Button>
            </Surface>
        </TouchableOpacity>
    )
}

export default function DiscoverScreen() {
    const theme = useTheme()
    const [isScanning, setIsScanning] = useState(false)
    const [discoveredUsers, setDiscoveredUsers] = useState<DiscoveredUserProps[]>([])
    const [connectionType, setConnectionType] = useState('both') // 'wifi', 'bluetooth', or 'both'
    const [message, setMessage] = useState('')
    const bleManager = new BleManager()

    useEffect(() => {
        checkPermissions()
        return () => {
            bleManager.destroy()
        }
    }, [])

    const checkPermissions = async () => {
        try {
            const bluetoothPermission = await request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN)
            const locationPermission = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)
            const bluetoothConnectPermission = await request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT)
            const wifiPermission = await request(PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION)

            if (
                bluetoothPermission === RESULTS.GRANTED &&
                locationPermission === RESULTS.GRANTED &&
                bluetoothConnectPermission === RESULTS.GRANTED &&
                wifiPermission === RESULTS.GRANTED
            ) {
                await startScanning()
            } else {
                Alert.alert(
                    'Permissions Required',
                    'Please grant Bluetooth, WiFi, and Location permissions to discover nearby users.',
                    [{ text: 'OK' }]
                )
            }
        } catch (error) {
            console.error('Permission error:', error)
        }
    }

    const startScanning = async () => {
        setIsScanning(true)
        setDiscoveredUsers([])

        try {
            if (connectionType === 'bluetooth' || connectionType === 'both') {
                // Start Bluetooth scanning
                bleManager.startDeviceScan(null, null, (error, device) => {
                    if (error) {
                        console.error('Scan error:', error)
                        return
                    }

                    if (device && device.name) {
                        const exists = discoveredUsers.find(d => d.id === device.id)
                        if (exists) return

                        setDiscoveredUsers(prev => [
                            ...prev,
                            {
                                id: device.id,
                                name: device.name || 'Unknown Device',
                                distance: 'Unknown',
                                connectionType: 'Bluetooth',
                                avatar: 'https://randomuser.me/api/portraits/lego/1.jpg',
                            },
                        ])
                    }
                })
            }

            if (connectionType === 'wifi' || connectionType === 'both') {
                // Start WiFi scanning
                try {
                    const wifiList = await WifiManager.loadWifiList()
                    wifiList.forEach(wifi => {
                        if (wifi.SSID) {
                            const exists = discoveredUsers.find(d => d.id === wifi.BSSID)
                            if (exists) return

                            setDiscoveredUsers(prev => [
                                ...prev,
                                {
                                    id: wifi.BSSID,
                                    name: wifi.SSID,
                                    distance: `${wifi.level} dBm`,
                                    connectionType: 'WiFi',
                                    avatar: 'https://randomuser.me/api/portraits/lego/2.jpg',
                                },
                            ])
                        }
                    })
                } catch (error) {
                    console.error('WiFi scan error:', error)
                }
            }
        } catch (error) {
            console.error('Scanning error:', error)
        } finally {
            setIsScanning(false)
        }
    }

    const sendMessage = async (userId: string, connectionType: string) => {
        if (!message.trim()) return

        try {
            if (connectionType === 'Bluetooth') {
                // Bluetooth mesaj gönderme işlemi
                const device = await bleManager.connectToDevice(userId)
                await device.discoverAllServicesAndCharacteristics()
                // Mesaj gönderme işlemleri burada yapılacak
            } else if (connectionType === 'WiFi') {
                // WiFi mesaj gönderme işlemi
                // WiFi üzerinden mesaj gönderme işlemleri burada yapılacak
            }

            Alert.alert('Success', 'Message sent successfully!')
            setMessage('')
        } catch (error) {
            console.error('Message sending error:', error)
            Alert.alert('Error', 'Failed to send message')
        }
    }

    return (
        <>
            <StatusBar backgroundColor={theme.colors.primary} barStyle="light-content" />
            <SafeAreaView style={[styles.container, { backgroundColor: '#F0F2F5' }]}>
                <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
                    <Text style={styles.headerTitle}>Discover People</Text>
                    <View style={styles.headerControls}>
                        <SegmentedButtons
                            value={connectionType}
                            onValueChange={setConnectionType}
                            buttons={[
                                { value: 'wifi', label: 'WiFi' },
                                { value: 'bluetooth', label: 'Bluetooth' },
                                { value: 'both', label: 'Both' },
                            ]}
                            style={styles.segmentedButtons}
                        />
                        <Button
                            mode="contained"
                            onPress={startScanning}
                            loading={isScanning}
                            style={styles.scanButton}
                            labelStyle={styles.scanButtonLabel}
                        >
                            {isScanning ? 'Scanning...' : 'Scan'}
                        </Button>
                    </View>
                </View>

                <View style={styles.messageInputContainer}>
                    <TextInput
                        style={styles.messageInput}
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Type a message..."
                        multiline
                    />
                </View>

                <FlatList
                    data={discoveredUsers}
                    renderItem={({ item }) => (
                        <DiscoveredUser
                            user={item}
                            onSendMessage={() => sendMessage(item.id, item.connectionType)}
                        />
                    )}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                />
            </SafeAreaView>
        </>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 16,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '600',
    },
    scanButton: {
        borderRadius: 20,
        paddingHorizontal: 16,
    },
    scanButtonLabel: {
        color: '#fff',
        fontSize: 14,
    },
    list: {
        padding: 8,
    },
    userItem: {
        flexDirection: 'row',
        padding: 12,
        marginBottom: 8,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        alignItems: 'center',
    },
    avatar: {
        marginRight: 12,
    },
    userContent: {
        flex: 1,
        justifyContent: 'center',
    },
    userHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111B21',
    },
    connectionType: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    connectionIcon: {
        margin: 0,
        padding: 0,
    },
    connectionText: {
        fontSize: 12,
        color: '#667781',
        marginLeft: 4,
    },
    distance: {
        fontSize: 14,
        color: '#667781',
    },
    chatButton: {
        marginLeft: 12,
        borderRadius: 20,
        paddingHorizontal: 16,
    },
    chatButtonLabel: {
        color: '#fff',
        fontSize: 14,
    },
    headerControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    segmentedButtons: {
        marginRight: 8,
    },
    messageInputContainer: {
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
    },
    messageInput: {
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        padding: 12,
        minHeight: 50,
        maxHeight: 100,
    },
})

