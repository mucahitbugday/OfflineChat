import { StatusBar, StyleSheet, Text, View } from 'react-native'
import React, { useEffect } from 'react'
import { ProgressBar, useTheme } from 'react-native-paper'

export default function OnboardingScreen({ navigation }: { navigation: any }) {
    const { colors } = useTheme()
    useEffect(() => {
        const fetchDataAndNavigate = async () => {
             navigation.reset({ index: 0, routes: [{ name: 'ChatListScreen' }], });
        };
        setTimeout(() => { fetchDataAndNavigate() }, 1500);
    })

    return (
        <>
            <StatusBar animated={true} backgroundColor={colors.primary} barStyle='default' />
            <View style={[styles.container, { backgroundColor: colors.primary }]}>
                <Text style={styles.logoText}>Chat</Text>
                <View style={{ width: '70%', marginTop: 30 }}><ProgressBar   indeterminate visible /></View>
            </View>
        </>
    )
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoText: {
        fontSize: 60,
        color: '#fff',
        fontWeight: '600',
    },
    logoDesc: {
        fontSize: 20,
        color: '#fff',
        fontWeight: '600',
    }
})