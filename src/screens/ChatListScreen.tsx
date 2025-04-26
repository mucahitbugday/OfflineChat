import { StyleSheet, View, FlatList, TouchableOpacity } from 'react-native'
import React, { useEffect, useState } from 'react'
import { Text, useTheme, Avatar, Surface, IconButton } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'react-native'
import { chatService } from '../services/ChatService'
import { Chat } from '../models/Chat'

const ChatItem = ({ chat, navigation }: { chat: Chat, navigation: any }) => {
  const theme = useTheme()

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <TouchableOpacity onPress={() => navigation.navigate('ChatDetailScreen', { chatId: chat.id })} activeOpacity={0.7}>
      <Surface style={styles.chatItem}>
        <Avatar.Text size={50} label={chat.deviceName.charAt(0)} style={styles.avatar} />
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName}>{chat.deviceName}</Text>
            <Text style={styles.chatTime}>{formatTime(chat.updatedAt)}</Text>
          </View>
          <View style={styles.chatFooter}>
            <Text style={[styles.lastMessage, chat.unreadCount > 0 && styles.unreadMessage]} numberOfLines={1} >
              {chat.lastMessage?.content || 'No messages yet'}
            </Text>
            {chat.unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.unreadCount}>{chat.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </Surface>
    </TouchableOpacity>
  )
}

export default function ChatListScreen({ navigation }: { navigation: any }) {
  const theme = useTheme()
  const [chats, setChats] = useState<Chat[]>([])

  useEffect(() => {
    const loadChats = async () => {
      const loadedChats = await chatService.getChats()
      setChats(loadedChats)
    }
    loadChats()
  }, [])

  return (
    <>
      <StatusBar backgroundColor={theme.colors.primary} barStyle="light-content" />
      <SafeAreaView style={[styles.container, { backgroundColor: '#F0F2F5' }]}>
        <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.headerTitle}>Chats</Text>
          <View style={{ flexDirection: 'row' }}>
            {/* <IconButton icon="delete-outline" iconColor="#fff" size={24} onPress={() => navigation.navigate('DiscoverScreen')} /> */}
            <IconButton icon="account-search" iconColor="#fff" size={24} onPress={() => navigation.navigate('ScanningScreen')} />
          </View>
        </View>

        <FlatList
          data={chats}
          renderItem={({ item }) => <ChatItem chat={item} navigation={navigation} />}
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
  list: {
    padding: 8,
  },
  chatItem: {
    flexDirection: 'row',
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  avatar: {
    marginRight: 12,
  },
  chatContent: {
    flex: 1,
    justifyContent: 'center',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111B21',
  },
  chatTime: {
    fontSize: 12,
    color: '#667781',
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#667781',
    flex: 1,
    marginRight: 8,
  },
  unreadMessage: {
    color: '#111B21',
    fontWeight: '500',
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
})