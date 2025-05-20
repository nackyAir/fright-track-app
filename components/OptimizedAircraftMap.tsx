import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Dimensions, ActivityIndicator, Platform, TouchableOpacity, Switch } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { AircraftState } from '../lib/api/opensky';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { optimizedTracker, OptimizedEvents, UpdateMode } from '../lib/api/opensky-optimized';

// 地図の初期表示領域
const INITIAL_REGION: Region = {
  latitude: 35.6895,  // 東京
  longitude: 139.6917,
  latitudeDelta: 5,
  longitudeDelta: 5,
};

interface OptimizedAircraftMapProps {
  onAircraftSelect?: (aircraft: AircraftState) => void;
}

export default function OptimizedAircraftMap({ onAircraftSelect }: OptimizedAircraftMapProps) {
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [aircraft, setAircraft] = useState<AircraftState[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [updateMode, setUpdateMode] = useState<UpdateMode>(UpdateMode.NORMAL);
  const [currentInterval, setCurrentInterval] = useState<number>(30000);
  const mapRef = useRef<MapView>(null);

  // 地図の表示領域が変更されたときのハンドラ
  const handleRegionChange = (newRegion: Region) => {
    setRegion(newRegion);
  };

  // 地図の表示領域の変更が完了したときのハンドラ
  const handleRegionChangeComplete = (newRegion: Region) => {
    // 境界ボックスを更新
    const { latitude, longitude, latitudeDelta, longitudeDelta } = newRegion;
    const lamin = latitude - latitudeDelta / 2;
    const lamax = latitude + latitudeDelta / 2;
    const lomin = longitude - longitudeDelta / 2;
    const lomax = longitude + longitudeDelta / 2;
    
    optimizedTracker.setBoundingBox(lamin, lomin, lamax, lomax);
  };

  // 航空機マーカーがタップされたときのハンドラ
  const handleMarkerPress = (aircraft: AircraftState) => {
    if (onAircraftSelect) {
      onAircraftSelect(aircraft);
    }
  };

  // 手動更新ボタンのハンドラ
  const handleManualRefresh = () => {
    setLoading(true);
    optimizedTracker.forceUpdate();
  };

  // 更新モード切り替えのハンドラ
  const handleUpdateModeChange = (mode: UpdateMode) => {
    setUpdateMode(mode);
    optimizedTracker.setUpdateMode(mode);
    setCurrentInterval(optimizedTracker.getCurrentInterval());
  };

  // 航空機の向きを計算（true_trackを使用）
  const getRotation = (aircraft: AircraftState) => {
    return aircraft.true_track !== null ? aircraft.true_track : 0;
  };

  // 最終更新時刻を表示用にフォーマット
  const getLastUpdateTimeString = () => {
    if (lastUpdateTime === 0) return '未更新';
    const date = new Date(lastUpdateTime);
    return date.toLocaleTimeString('ja-JP');
  };

  // 更新間隔を表示用にフォーマット
  const getUpdateIntervalString = () => {
    return `${(currentInterval / 1000).toFixed(1)}秒`;
  };

  // 更新モードの表示名を取得
  const getUpdateModeName = (mode: UpdateMode): string => {
    switch (mode) {
      case UpdateMode.NORMAL:
        return '通常';
      case UpdateMode.FAST:
        return '高速';
      case UpdateMode.ADAPTIVE:
        return '適応型';
      default:
        return '';
    }
  };

  // 初期化
  useEffect(() => {
    // 航空機データ更新イベントのリスナー
    const handleAircraftUpdate = (aircraftStates: AircraftState[]) => {
      setAircraft(aircraftStates);
      setLastUpdateTime(Date.now());
      setLoading(false);
      setError(null);
      setCurrentInterval(optimizedTracker.getCurrentInterval());
    };
    
    // エラーイベントのリスナー
    const handleError = (error: Error) => {
      console.error('Aircraft tracker error:', error);
      setError(`データ取得エラー: ${error.message}`);
      setLoading(false);
      setCurrentInterval(optimizedTracker.getCurrentInterval());
    };
    
    // イベントリスナーを登録
    optimizedTracker.on(OptimizedEvents.AIRCRAFT_UPDATE, handleAircraftUpdate);
    optimizedTracker.on(OptimizedEvents.ERROR, handleError);
    
    // 初期境界ボックスを設定
    const { latitude, longitude, latitudeDelta, longitudeDelta } = INITIAL_REGION;
    optimizedTracker.setBoundingBox(
      latitude - latitudeDelta / 2,
      longitude - longitudeDelta / 2,
      latitude + latitudeDelta / 2,
      longitude + longitudeDelta / 2
    );
    
    // 更新モードを設定
    optimizedTracker.setUpdateMode(updateMode);
    
    // 更新を開始
    optimizedTracker.startUpdates();
    
    // クリーンアップ関数
    return () => {
      // イベントリスナーを削除
      optimizedTracker.removeListener(OptimizedEvents.AIRCRAFT_UPDATE, handleAircraftUpdate);
      optimizedTracker.removeListener(OptimizedEvents.ERROR, handleError);
      
      // 更新を停止
      optimizedTracker.stopUpdates();
    };
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {aircraft.map((a) => (
          <Marker
            key={a.icao24}
            coordinate={{
              latitude: a.latitude!,
              longitude: a.longitude!,
            }}
            title={a.callsign || a.icao24}
            description={`${a.origin_country} | 高度: ${Math.round((a.baro_altitude || 0) * 3.28084)}ft`}
            onPress={() => handleMarkerPress(a)}
            rotation={getRotation(a)}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <MaterialCommunityIcons
              name="airplane"
              size={24}
              color={a.on_ground ? "#888888" : "#3366FF"}
            />
          </Marker>
        ))}
      </MapView>

      {/* 更新モード切り替えコントロール */}
      <View style={styles.modeContainer}>
        <Text style={styles.modeTitle}>更新モード:</Text>
        <View style={styles.modeButtons}>
          <TouchableOpacity
            style={[styles.modeButton, updateMode === UpdateMode.NORMAL ? styles.activeMode : {}]}
            onPress={() => handleUpdateModeChange(UpdateMode.NORMAL)}
          >
            <Text style={[styles.modeText, updateMode === UpdateMode.NORMAL ? styles.activeModeText : {}]}>
              通常
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, updateMode === UpdateMode.FAST ? styles.activeMode : {}]}
            onPress={() => handleUpdateModeChange(UpdateMode.FAST)}
          >
            <Text style={[styles.modeText, updateMode === UpdateMode.FAST ? styles.activeModeText : {}]}>
              高速
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, updateMode === UpdateMode.ADAPTIVE ? styles.activeMode : {}]}
            onPress={() => handleUpdateModeChange(UpdateMode.ADAPTIVE)}
          >
            <Text style={[styles.modeText, updateMode === UpdateMode.ADAPTIVE ? styles.activeModeText : {}]}>
              適応型
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ローディングインジケータ */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>航空機データを取得中...</Text>
        </View>
      )}

      {/* エラーメッセージ */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* 航空機数と更新時刻の表示 */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          表示中の航空機: {aircraft.length}機
        </Text>
        <Text style={styles.updateTimeText}>
          最終更新: {getLastUpdateTimeString()} (間隔: {getUpdateIntervalString()})
        </Text>
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={handleManualRefresh}
          disabled={loading}
        >
          <MaterialCommunityIcons
            name="refresh"
            size={20}
            color={loading ? "#999" : "#3366FF"}
          />
          <Text style={[
            styles.refreshText,
            {color: loading ? "#999" : "#3366FF"}
          ]}>
            今すぐ更新
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  loadingContainer: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 10,
    alignItems: 'center',
    borderRadius: 5,
    margin: 10,
  },
  loadingText: {
    marginTop: 5,
    fontSize: 14,
  },
  errorContainer: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    padding: 10,
    alignItems: 'center',
    borderRadius: 5,
    margin: 10,
  },
  errorText: {
    color: 'red',
    fontSize: 14,
  },
  statsContainer: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 10,
    alignItems: 'center',
    borderRadius: 5,
    margin: 10,
  },
  statsText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  updateTimeText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  refreshText: {
    fontSize: 12,
    marginLeft: 4,
  },
  modeContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 10,
    borderRadius: 5,
    zIndex: 1000,
  },
  modeTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
  },
  modeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginHorizontal: 2,
    backgroundColor: '#f0f0f0',
  },
  activeMode: {
    backgroundColor: '#3366FF',
  },
  modeText: {
    fontSize: 10,
    color: '#333',
  },
  activeModeText: {
    color: '#fff',
    fontWeight: 'bold',
  },
}); 