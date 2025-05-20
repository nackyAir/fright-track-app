import { Image, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';

export default function HomeScreen() {
  const navigateToTrack = () => {
    router.push('/(tabs)/track');
  };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">航空機追跡アプリ</ThemedText>
        <HelloWave />
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">リアルタイム航空機追跡</ThemedText>
        <ThemedText>
          このアプリでは、OpenSky NetworkのAPIを使用して、世界中の航空機の位置情報をリアルタイムで表示します。
          地図上で航空機をタップすると、詳細情報を確認できます。
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">主な機能</ThemedText>
        <ThemedView style={styles.featureItem}>
          <IconSymbol size={24} name="map.fill" color="#3366FF" />
          <ThemedText style={styles.featureText}>
            インタラクティブな地図上で航空機の位置を表示
          </ThemedText>
        </ThemedView>
        <ThemedView style={styles.featureItem}>
          <IconSymbol size={24} name="info.circle.fill" color="#3366FF" />
          <ThemedText style={styles.featureText}>
            航空機の詳細情報（コールサイン、高度、速度など）を表示
          </ThemedText>
        </ThemedView>
        <ThemedView style={styles.featureItem}>
          <IconSymbol size={24} name="arrow.clockwise" color="#3366FF" />
          <ThemedText style={styles.featureText}>
            10秒ごとに自動更新される最新データ
          </ThemedText>
        </ThemedView>
      </ThemedView>

      <TouchableOpacity style={styles.trackButton} onPress={navigateToTrack}>
        <ThemedView style={styles.buttonContent}>
          <IconSymbol size={24} name="airplane" color="#FFFFFF" />
          <ThemedText style={styles.buttonText}>航空機追跡を開始</ThemedText>
        </ThemedView>
      </TouchableOpacity>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">データについて</ThemedText>
        <ThemedText>
          このアプリは、OpenSky NetworkのAPIを使用しています。表示されるデータは、ADS-B、Mode S、FLARM、MLATなどの技術を使用して収集された公開情報です。
          データの更新頻度や精度は、OpenSky Networkのサービス状況によって異なる場合があります。
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 16,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  featureText: {
    flex: 1,
  },
  trackButton: {
    backgroundColor: '#3366FF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
