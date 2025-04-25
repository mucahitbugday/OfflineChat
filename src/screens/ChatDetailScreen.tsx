import { StyleSheet, View, FlatList, KeyboardAvoidingView, Platform, Animated } from 'react-native'
import React, { useState, useRef } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useTheme, Avatar, IconButton, TextInput, Surface } from 'react-native-paper'
import { StatusBar } from 'react-native'
import { useNavigation } from '@react-navigation/native'

// Mock messages data
const mockMessages = [
  {
    id: '1',
    text: 'Hey, how are you?',
    time: '10:30 AM',
    isMe: false,
  },
  {
    id: '2',
    text: 'I\'m good, thanks! How about you?',
    time: '10:31 AM',
    isMe: true,
  },
  {
    id: '3',
    text: 'Doing well! Just working on some projects.',
    time: '10:32 AM',
    isMe: false,
  },
  {
    id: '4',
    text: 'That sounds interesting! What kind of projects?',
    time: '10:33 AM',
    isMe: true,
  },
]

const MessageBubble = ({ message, index }: { message: typeof mockMessages[0], index: number }) => {
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
          <Text style={[
            styles.messageTime,
            message.isMe ? styles.myMessageTime : styles.theirMessageTime
          ]}>
            {message.time}
          </Text>
        </Surface>
      </View>
    </Animated.View>
  )
}

export default function ChatDetailScreen() {
  const [message, setMessage] = useState('')
  const navigation = useNavigation()
  const theme = useTheme()
  const [isInputFocused, setIsInputFocused] = useState(false)
  
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
                <Text style={styles.headerTitle}>John Doe</Text>
                <Text style={styles.headerSubtitle}>Online</Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <IconButton
                icon="phone"
                iconColor="#fff"
                size={24}
                onPress={() => {}}
              />
              <IconButton
                icon="dots-vertical"
                iconColor="#fff"
                size={24}
                onPress={() => {}}
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
            data={mockMessages}
            renderItem={({ item, index }) => <MessageBubble message={item} index={index} />}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            inverted
            showsVerticalScrollIndicator={false}
          />
          
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <IconButton
                icon="emoticon-outline"
                iconColor="#54656F"
                size={24}
                onPress={() => {}}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Message"
                placeholderTextColor="#667781"
                value={message}
                onChangeText={setMessage}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                multiline
                maxLength={1000}
              />
              {message.length > 0 ? (
                <IconButton
                  icon="send"
                  iconColor="#fff"
                  size={24}
                  onPress={() => {
                    // Handle send message
                    setMessage('')
                  }}
                  style={styles.sendButton}
                />
              ) : (
                <>
                  <IconButton
                    icon="attachment"
                    iconColor="#54656F"
                    size={24}
                    onPress={() => {}}
                    style={styles.inputIcon}
                  />
                  <IconButton
                    icon="camera"
                    iconColor="#54656F"
                    size={24}
                    onPress={() => {}}
                    style={styles.inputIcon}
                  />
                </>
              )}
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
  },
  myMessageText: {
    color: '#000',
  },
  theirMessageText: {
    color: '#000',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myMessageTime: {
    color: '#128C7E',
  },
  theirMessageTime: {
    color: '#667781',
  },
  inputContainer: {
    backgroundColor: '#F0F2F5',
    padding: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 8,
    minHeight: 40,
  },
  input: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 16,
    maxHeight: 100,
    paddingVertical: 8,
    color: '#111B21',
  },
  inputIcon: {
    margin: 0,
  },
  sendButton: {
    backgroundColor: '#128C7E',
    margin: 0,
    marginLeft: 4,
  },
})