import React, { useState } from 'react';
import { StyleSheet, SafeAreaView, StatusBar, View, Text } from 'react-native';
import Home from './src/screens/Home';
import HostScreen from './src/screens/HostScreen';
import GuestScreen from './src/screens/GuestScreen';

export type ScreenType = 'HOME' | 'HOST' | 'GUEST';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('HOME');

  const renderScreen = () => {
    switch (currentScreen) {
      case 'HOME':
        return <Home onNavigate={setCurrentScreen} />;
      case 'HOST':
        return <HostScreen onNavigate={setCurrentScreen} />;
      case 'GUEST':
        return <GuestScreen onNavigate={setCurrentScreen} />;
      default:
        return <Home onNavigate={setCurrentScreen} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {renderScreen()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
});
