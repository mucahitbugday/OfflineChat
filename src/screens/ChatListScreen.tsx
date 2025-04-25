import { StyleSheet, View, FlatList, TouchableOpacity } from 'react-native'
import React from 'react'
import { Text, useTheme, Avatar, Surface } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'

type RootStackParamList = {
  ChatDetailScreen: { chatId: string }
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

// Mock data for chat list
const mockChats = [
  {
    id: '1',
    name: 'John Doe',
    lastMessage: 'Hey, how are you doing?',
    time: '10:30 AM',
    unreadCount: 2,
    avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
  },
  {
    id: '2',
    name: 'Jane Smith',
    lastMessage: 'Can we meet tomorrow?',
    time: 'Yesterday',
    unreadCount: 0,
    avatar: 'https://randomuser.me/api/portraits/women/1.jpg',
  },
  {
    id: '3',
    name: 'Mike Johnson',
    lastMessage: 'The project is going well!',
    time: 'Yesterday',
    unreadCount: 5,
    avatar: 'https://randomuser.me/api/portraits/men/2.jpg',
  },
  {
    id: '4',
    name: 'Sarah Wilson',
    lastMessage: 'Thanks for your help!',
    time: '2 days ago',
    unreadCount: 0,
    avatar: 'https://randomuser.me/api/portraits/women/2.jpg',
  },
]

const ChatItem = ({ chat }: { chat: typeof mockChats[0] }) => {
  const navigation = useNavigation<NavigationProp>()
  const theme = useTheme()

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('ChatDetailScreen', { chatId: chat.id })}
      activeOpacity={0.7}
    >
      <Surface style={styles.chatItem}>
        <Avatar.Image 
          size={50} 
          source={{ uri: chat.avatar }} 
          style={styles.avatar}
        />
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName}>{chat.name}</Text>
            <Text style={styles.chatTime}>{chat.time}</Text>
          </View>
          <View style={styles.chatFooter}>
            <Text 
              style={[
                styles.lastMessage,
                chat.unreadCount > 0 && styles.unreadMessage
              ]}
              numberOfLines={1}
            >
              {chat.lastMessage}
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

export default function ChatListScreen() {
  const theme = useTheme()

  return (
    <>
      <StatusBar
        backgroundColor={theme.colors.primary}
        barStyle="light-content"
      />
      <SafeAreaView style={[styles.container, { backgroundColor: '#F0F2F5' }]}>
        <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.headerTitle}>Chats</Text>
        </View>
        
        <FlatList
          data={mockChats}
          renderItem={({ item }) => <ChatItem chat={item} />}
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