import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';

import OnboardingScreen from './screens/OnboardingScreen';
import ChatListScreen from './screens/ChatListScreen';
import ChatDetailScreen from './screens/ChatDetailScreen';
import ScanningScreen from './screens/ScanningScreen';
import DiscoverScreen from './screens/DiscoverScreen';

export default function App() {
  const Stack = createNativeStackNavigator();

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="OnboardingScreen" >
        <Stack.Screen name="OnboardingScreen" component={OnboardingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ChatListScreen" component={ChatListScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ChatDetailScreen" component={ChatDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="DiscoverScreen" component={DiscoverScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ScanningScreen" component={ScanningScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

