import { StyleSheet, View, FlatList, KeyboardAvoidingView, Platform, Animated, Alert } from 'react-native'
import React, { useState, useRef, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useTheme, Avatar, IconButton, TextInput, Surface } from 'react-native-paper'
import { StatusBar } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import TcpSocket from 'react-native-tcp-socket'
import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-async-storage/async-storage'

interface Message {
  id: string;
  text: string;
  time: string;
  isMe: boolean;
  status: 'sent' | 'delivered' | 'read';
  deviceGuid: string;
}

interface ReceivedMessage {
  message: string;
  sender: string;
  deviceID: string;
  connectionType: string;
  deviceGuid: string;
}

const MessageStatus = ({ status }: { status: string }) => {
  const theme = useTheme()

  return (
    <View style={styles.statusContainer}>
      {status === 'read' && (
        <IconButton
          icon="check-all"
          size={16}
          iconColor={theme.colors.primary}
          style={styles.statusIcon}
        />
      )}
      {status === 'delivered' && (
        <IconButton
          icon="check-all"
          size={16}
          iconColor="#667781"
          style={styles.statusIcon}
        />
      )}
      {status === 'sent' && (
        <IconButton
          icon="check"
          size={16}
          iconColor="#667781"
          style={styles.statusIcon}
        />
      )}
    </View>
  )
}

const MessageBubble = ({ message, index }: { message: Message, index: number }) => {
  const theme = useTheme()
  const scaleAnim = useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      delay: index * 100,
    }).start()
  }, [])

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        opacity: scaleAnim,
      }}
    >
      <View style={[
        styles.messageContainer,
        message.isMe ? styles.myMessageContainer : styles.theirMessageContainer
      ]}>
        {!message.isMe && (
          <Avatar.Image
            size={32}
            source={{ uri: 'https://randomuser.me/api/portraits/men/1.jpg' }}
            style={styles.avatar}
          />
        )}
        <View style={styles.messageContent}>
          <Surface style={[
            styles.messageBubble,
            message.isMe ? styles.myMessageBubble : styles.theirMessageBubble
          ]}>
            <Text style={[
              styles.messageText,
              message.isMe ? styles.myMessageText : styles.theirMessageText
            ]}>
              {message.text}
            </Text>
          </Surface>
          <View style={[
            styles.messageMeta,
            message.isMe ? styles.myMessageMeta : styles.theirMessageMeta
          ]}>
            <Text style={[
              styles.messageTime,
              message.isMe ? styles.myMessageTime : styles.theirMessageTime
            ]}>
              {message.time}
            </Text>
            {message.isMe && <MessageStatus status={message.status} />}
          </View>
        </View>
      </View>
    </Animated.View>
  )
}

export default function ChatDetailScreen({ navigation, route }: any) {
  const theme = useTheme()
  const { deviceID, deviceName, deviceIP, connectionType, PORT } = route.params;
  const [message, setMessage] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const serverRef = useRef<TcpSocket.Server | null>(null)
  const [localDeviceGuid, setLocalDeviceGuid] = useState<string>('')

  useEffect(() => {
    loadDeviceGuid()
    loadMessages()
    startServer()
    return () => {
      if (serverRef.current) {
        serverRef.current.close()
      }
    }
  }, [])

  const loadDeviceGuid = async () => {
    try {
      const guid = await DeviceInfo.getUniqueId()
      setLocalDeviceGuid(guid)
    } catch (error) {
      console.error('Device GUID yüklenirken hata:', error)
    }
  }

  const loadMessages = async () => {
    try {
      const storedMessages = await AsyncStorage.getItem(`messages_${deviceID}`)
      if (storedMessages) {
        setMessages(JSON.parse(storedMessages))
      }
    } catch (error) {
      console.error('Mesajlar yüklenirken hata:', error)
    }
  }

  const saveMessages = async (newMessages: Message[]) => {
    try {
      await AsyncStorage.setItem(`messages_${deviceID}`, JSON.stringify(newMessages))
    } catch (error) {
      console.error('Mesajlar kaydedilirken hata:', error)
    }
  }

  const startServer = async () => {
    try {
      console.log('Sunucu başlatılıyor...', { PORT, deviceIP, connectionType });
      
      if (serverRef.current) {
        console.log('Mevcut sunucu kapatılıyor...');
        serverRef.current.close();
        // Sunucunun tamamen kapanması için kısa bir bekleme
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Bağlantı tipine göre sunucu ayarları
      const serverOptions = {
        port: PORT,
        host: '0.0.0.0',
        reuseAddress: true,
        localAddress: deviceIP
      };

      console.log('Sunucu ayarları:', serverOptions);

      const server = TcpSocket.createServer((socket: TcpSocket.Socket) => {
        console.log('Yeni bağlantı alındı:', socket.address());
        
        socket.on('data', (data: string | Buffer) => {
          try {
            console.log('Gelen veri:', data.toString());
            const receivedMessage = JSON.parse(data.toString()) as ReceivedMessage;
            handleReceivedMessage(receivedMessage);
          } catch (error) {
            console.error('Mesaj parse hatası:', error);
            Alert.alert('Hata', 'Gelen mesaj işlenirken bir hata oluştu.');
          }
        });

        socket.on('error', (error: Error) => {
          console.error('Socket hatası:', error);
          Alert.alert('Bağlantı Hatası', `Bağlantı hatası: ${error.message}`);
        });

        socket.on('close', (had_error: boolean) => {
          console.log('Bağlantı kapandı:', { had_error, address: socket.address() });
          if (had_error) {
            Alert.alert('Bağlantı Kesildi', 'Bağlantı beklenmedik şekilde kapandı.');
          }
        });
      });

      server.on('error', (error: Error) => {
        console.error('Sunucu hatası:', error);
        Alert.alert(
          'Sunucu Hatası',
          `Sunucu başlatılırken bir hata oluştu: ${error}\nPort: ${PORT}\nIP: ${deviceIP}\nLütfen bağlantı ayarlarınızı kontrol edin.`
        );
      });

      server.on('listening', () => {
        const address = server.address();
        console.log('Sunucu başarıyla başlatıldı:', { address, PORT });
      });

      // Sunucuyu başlatmadan önce kısa bir bekleme
      await new Promise(resolve => setTimeout(resolve, 500));
      server.listen(serverOptions);
      serverRef.current = server;

    } catch (error) {
      console.error('Sunucu başlatma hatası:', error);
      Alert.alert(
        'Sunucu Hatası',
        `Sunucu başlatılamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}\nPort: ${PORT}\nIP: ${deviceIP}\nLütfen uygulamayı yeniden başlatın.`
      );
    }
  };

  const handleReceivedMessage = (receivedMessage: ReceivedMessage) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text: receivedMessage.message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: false,
      status: 'read',
      deviceGuid: receivedMessage.deviceGuid
    }

    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages, newMessage]
      saveMessages(updatedMessages)
      return updatedMessages
    })
  }

  const sendWifiMessage = async (deviceIP: string) => {
    if (!message.trim()) {
      Alert.alert('Mesaj boş', 'Lütfen bir mesaj yaz!')
      return
    }

    try {
      const client = TcpSocket.createConnection({
        port: PORT,
        host: deviceIP
      }, () => {
        const messageData = JSON.stringify({
          message,
          sender: deviceName,
          deviceID: deviceID,
          connectionType: connectionType,
          deviceGuid: localDeviceGuid
        })
        client.write(messageData)
        client.destroy()
      })

      client.on('error', (error: Error) => {
        console.error('Mesaj gönderme hatası:', error)
        Alert.alert('Hata', 'Mesaj gönderilemedi!')
      })

      client.on('close', (had_error: boolean) => {
        console.log('Bağlantı kapandı:', had_error)
      })
    } catch (error) {
      console.error('WiFi mesaj gönderme hatası:', error)
      Alert.alert('Hata', 'Mesaj gönderilemedi!')
    }
  }

  const sendMessage = () => {
    if (!message.trim()) {
      Alert.alert('Mesaj boş', 'Lütfen bir mesaj yaz!')
      return
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      text: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
      status: 'sent',
      deviceGuid: localDeviceGuid
    }

    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages, newMessage]
      saveMessages(updatedMessages)
      return updatedMessages
    })

    sendWifiMessage(deviceIP)
    setMessage('')
    setIsTyping(false)
  }

  return (
    <>
      <StatusBar
        backgroundColor={theme.colors.primary}
        barStyle="light-content"
      />
      <SafeAreaView style={[styles.container, { backgroundColor: '#F0F2F5' }]}>
        <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <IconButton
                icon="arrow-left"
                iconColor="#fff"
                size={24}
                onPress={() => navigation.goBack()}
              />
              <Avatar.Image
                size={40}
                source={{ uri: 'https://randomuser.me/api/portraits/men/1.jpg' }}
              />
              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>{deviceName || ''}  {deviceIP}</Text>
                <Text style={styles.headerSubtitle}>
                  {isTyping ? 'typing...' : 'Online'}
                </Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <IconButton
                icon="phone"
                iconColor="#fff"
                size={24}
                onPress={() => { }}
              />
              <IconButton
                icon="dots-vertical"
                iconColor="#fff"
                size={24}
                onPress={() => { }}
              />
            </View>
          </View>
        </View>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <FlatList
            data={[...messages].reverse()}
            renderItem={({ item, index }) => <MessageBubble message={item} index={index} />}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            inverted
          // showsVerticalScrollIndicator={false}
          />

          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <IconButton icon="emoticon-outline" iconColor="#54656F" size={24} onPress={() => { }} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Message" placeholderTextColor="#667781" value={message} onChangeText={(text) => { setMessage(text); setIsTyping(text.length > 0) }} onFocus={() => setIsInputFocused(true)} onBlur={() => { setIsInputFocused(false); setIsTyping(false) }} multiline maxLength={1000} />
              {message.length > 0 ? (<IconButton icon="send" iconColor="#fff" size={24} onPress={() => { sendMessage() }} style={styles.sendButton} />) : (<>     <IconButton icon="attachment" iconColor="#54656F" size={24} onPress={() => { }} style={styles.inputIcon} />     <IconButton icon="camera" iconColor="#54656F" size={24} onPress={() => { }} style={styles.inputIcon} />   </>)}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    marginLeft: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
  },
  headerActions: {
    flexDirection: 'row',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '80%',
  },
  myMessageContainer: {
    alignSelf: 'flex-end',
  },
  theirMessageContainer: {
    alignSelf: 'flex-start',
  },
  avatar: {
    marginRight: 8,
    alignSelf: 'flex-end',
  },
  messageContent: {
    flex: 1,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '100%',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  myMessageBubble: {
    backgroundColor: '#DCF8C6',
    borderTopRightRadius: 4,
  },
  theirMessageBubble: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#000',
  },
  theirMessageText: {
    color: '#000',
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  myMessageMeta: {
    justifyContent: 'flex-end',
  },
  theirMessageMeta: {
    justifyContent: 'flex-start',
  },
  messageTime: {
    fontSize: 10,
    color: '#667781',
  },
  myMessageTime: {
    marginRight: 4,
  },
  theirMessageTime: {
    marginLeft: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    margin: 0,
    padding: 0,
  },
  inputContainer: {
    backgroundColor: '#F0F2F5',
    padding: 4,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 4,
    minHeight: 36,
    maxHeight: 100,
  },
  input: {
    flex: 1,
    marginHorizontal: 4,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 6,
    paddingHorizontal: 8,
    color: '#111B21',
    backgroundColor: 'transparent',
  },
  inputIcon: {
    margin: 0,
    padding: 0,
  },
  sendButton: {
    backgroundColor: '#128C7E',
    margin: 0,
    marginLeft: 2,
    width: 32,
    height: 32,
  },
})