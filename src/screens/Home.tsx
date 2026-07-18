import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { ScreenType } from '../../App';

interface Props {
  onNavigate: (screen: ScreenType) => void;
}

export default function Home({ onNavigate }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>SynchMe</Text>
      <Text style={styles.subtitle}>Synchronized Audio Playback</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.hostButton]}
          onPress={() => onNavigate('HOST')}
        >
          <Text style={styles.buttonText}>Host a Session</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.guestButton]}
          onPress={() => onNavigate('GUEST')}
        >
          <Text style={styles.buttonText}>Join as Guest</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 60,
  },
  buttonContainer: {
    width: '100%',
    gap: 20,
  },
  button: {
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  hostButton: {
    backgroundColor: '#007AFF',
  },
  guestButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});
