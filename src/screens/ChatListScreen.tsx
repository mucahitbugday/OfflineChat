import { StyleSheet, View, FlatList, Image } from 'react-native'
import React from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, Surface, useTheme, Avatar, Badge } from 'react-native-paper'

// Temporary mock data
const mockChats = [
  {
    id: '1',
    name: 'John Doe',
    lastMessage: 'Hey, how are you doing?',
    timestamp: '10:30 AM',
    unreadCount: 2,
    avatar: 'https://randomuser.me/api/portraits/men/1.jpg'
  },
  {
    id: '2',
    name: 'Jane Smith',
    lastMessage: 'Can we meet tomorrow?',
    timestamp: 'Yesterday',
    unreadCount: 0,
    avatar: 'https://randomuser.me/api/portraits/women/1.jpg'
  },
  {
    id: '3',
    name: 'Mike Johnson',
    lastMessage: 'The project is due next week',
    timestamp: '2 days ago',
    unreadCount: 5,
    avatar: 'https://randomuser.me/api/portraits/men/2.jpg'
  },
]

const ChatItem = ({ item }: { item: typeof mockChats[0] }) => {
  const theme = useTheme()
  
  return (
    <Surface style={styles.chatItem}>
      <Avatar.Image 
        size={50} 
        source={{ uri: item.avatar }} 
        style={styles.avatar}
      />
      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text variant="titleMedium">{item.name}</Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {item.timestamp}
          </Text>
        </View>
        <View style={styles.chatFooter}>
          <Text 
            variant="bodyMedium" 
            style={{ color: theme.colors.onSurfaceVariant }}
            numberOfLines={1}
          >
            {item.lastMessage}
          </Text>
          {item.unreadCount > 0 && (
            <Badge size={24} style={{ backgroundColor: theme.colors.primary }}>
              {item.unreadCount}
            </Badge>
          )}
        </View>
      </View>
    </Surface>
  )
}

export default function ChatListScreen() {
  const theme = useTheme()
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.outline }]}>
        <Text variant="headlineMedium">Messages</Text>
      </View>
      <FlatList
        data={mockChats}
        renderItem={({ item }) => <ChatItem item={item} />}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  list: {
    padding: 8,
  },
  chatItem: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    elevation: 2,
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
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
})