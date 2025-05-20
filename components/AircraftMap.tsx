import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Dimensions, ActivityIndicator, Platform, TouchableOpacity, Switch } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { AircraftState } from '../lib/api/opensky';
import { getAllAircraftStates } from '../lib/api/opensky';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { openSkyRealtimeClient, ConnectionState, RealtimeEvents } from '../lib/api/opensky-realtime';

// 地図の初期表示領域
const INITIAL_REGION: Region = {
  latitude: 35.6895,  // 東京
  longitude: 139.6917,
  latitudeDelta: 5,
  longitudeDelta: 5,
};

// 更新間隔（ミリ秒）- APIのレート制限を考慮して長めに設定
const UPDATE_INTERVAL = 30000; // 30秒

// 最小更新間隔（ミリ秒）- 手動更新時にも適用
const MIN_UPDATE_INTERVAL = 10000; // 10秒

interface AircraftMapProps {
  onAircraftSelect?: (aircraft: AircraftState) => void;
}

export default function AircraftMap({ onAircraftSelect }: AircraftMapProps) {
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [aircraft, setAircraft] = useState<AircraftState[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [useRealtime, setUseRealtime] = useState<boolean>(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const mapRef = useRef<MapView>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 地図の表示領域が変更されたときに航空機データを取得
  const fetchAircraftData = async (mapRegion: Region, force: boolean = false) => {
    // リアルタイムモードが有効な場合はポーリングをスキップ
    if (useRealtime && connectionState === ConnectionState.CONNECTED) {
      return;
    }
    
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;
    
    // 最小更新間隔を確認（強制更新でない場合）
    if (!force && timeSinceLastUpdate < MIN_UPDATE_INTERVAL) {
      console.log(`更新間隔が短すぎます。残り ${Math.ceil((MIN_UPDATE_INTERVAL - timeSinceLastUpdate) / 1000)} 秒後に再試行できます。`);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);

      // 地図の表示領域から境界ボックスを計算
      const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
      const lamin = latitude - latitudeDelta / 2;
      const lamax = latitude + latitudeDelta / 2;
      const lomin = longitude - longitudeDelta / 2;
      const lomax = longitude + longitudeDelta / 2;

      // APIから航空機データを取得
      const aircraftData = await getAllAircraftStates(lamin, lomin, lamax, lomax);
      
      // 有効な位置情報を持つ航空機のみをフィルタリング
      const validAircraft = aircraftData.filter(
        (a) => a.latitude !== null && a.longitude !== null
      );
      
      setAircraft(validAircraft);
      setLastUpdateTime(now);
      setRetryCount(0); // 成功したらリトライカウントをリセット
    } catch (err: any) {
      console.error('Error fetching aircraft data:', err);
      
      // エラーメッセージをより詳細に
      if (err.message && err.message.includes('429')) {
        setError('APIのリクエスト制限に達しました。しばらく待ってから再試行してください。');
        // リトライカウントを増やす
        setRetryCount(prev => prev + 1);
        
        // リトライ回数に応じて次回の更新間隔を長くする
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        
        const nextInterval = Math.min(UPDATE_INTERVAL * Math.pow(2, retryCount), 300000); // 最大5分
        intervalRef.current = setInterval(() => {
          fetchAircraftData(region);
        }, nextInterval);
        
        console.log(`次回の更新は ${nextInterval / 1000} 秒後に行われます`);
      } else {
        setError(`航空機データの取得に失敗しました: ${err.message || '不明なエラー'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // 地図の表示領域が変更されたときのハンドラ
  const handleRegionChange = (newRegion: Region) => {
    setRegion(newRegion);
  };

  // 地図の表示領域の変更が完了したときのハンドラ
  const handleRegionChangeComplete = (newRegion: Region) => {
    // リアルタイムモードが有効な場合は境界ボックスを更新
    if (useRealtime) {
      updateRealtimeBoundingBox(newRegion);
    } else {
      // 通常モードでは地図の移動後にデータを更新
      fetchAircraftData(newRegion, false);
    }
  };

  // 航空機マーカーがタップされたときのハンドラ
  const handleMarkerPress = (aircraft: AircraftState) => {
    if (onAircraftSelect) {
      onAircraftSelect(aircraft);
    }
  };

  // 手動更新ボタンのハンドラ
  const handleManualRefresh = () => {
    if (useRealtime) {
      // リアルタイムモードの場合は何もしない
      return;
    }
    fetchAircraftData(region, true);
  };

  // リアルタイムモード切り替えのハンドラ
  const handleRealtimeToggle = (value: boolean) => {
    setUseRealtime(value);
    
    if (value) {
      // リアルタイムモードを有効化
      startRealtimeUpdates();
    } else {
      // リアルタイムモードを無効化
      stopRealtimeUpdates();
      // 通常のポーリングを再開
      setupPollingInterval();
    }
  };

  // リアルタイム更新の開始
  const startRealtimeUpdates = () => {
    // ポーリング間隔をクリア
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // WebSocket接続を開始
    try {
      // OpenSky Networkのアカウント情報がある場合は設定
      // openSkyRealtimeClient.setCredentials('your_username', 'your_password');
      
      // 現在の地図の境界ボックスを設定
      updateRealtimeBoundingBox(region);
      
      // WebSocket接続を開始
      openSkyRealtimeClient.connect();
    } catch (error) {
      console.error('Failed to start realtime updates:', error);
      setError('リアルタイム更新の開始に失敗しました。通常モードに戻ります。');
      setUseRealtime(false);
    }
  };

  // リアルタイム更新の停止
  const stopRealtimeUpdates = () => {
    openSkyRealtimeClient.disconnect();
  };

  // リアルタイム更新の境界ボックスを更新
  const updateRealtimeBoundingBox = (mapRegion: Region) => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    const lamin = latitude - latitudeDelta / 2;
    const lamax = latitude + latitudeDelta / 2;
    const lomin = longitude - longitudeDelta / 2;
    const lomax = longitude + longitudeDelta / 2;
    
    openSkyRealtimeClient.setBoundingBox(lamin, lomin, lamax, lomax);
  };

  // 通常のポーリング間隔を設定
  const setupPollingInterval = () => {
    // 既存の間隔をクリア
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // 初回データ取得
    fetchAircraftData(region, true);
    
    // 定期的な更新を設定
    intervalRef.current = setInterval(() => {
      fetchAircraftData(region);
    }, UPDATE_INTERVAL);
  };

  // WebSocketイベントリスナーの設定
  useEffect(() => {
    // 航空機データ更新イベントのリスナー
    const handleAircraftUpdate = (aircraftStates: AircraftState[]) => {
      // 有効な位置情報を持つ航空機のみをフィルタリング
      const validAircraft = aircraftStates.filter(
        (a) => a.latitude !== null && a.longitude !== null
      );
      
      setAircraft(validAircraft);
      setLastUpdateTime(Date.now());
      setLoading(false);
      setError(null);
    };
    
    // 接続状態変更イベントのリスナー
    const handleConnectionStateChange = (state: ConnectionState) => {
      setConnectionState(state);
      
      if (state === ConnectionState.CONNECTED) {
        setError(null);
      } else if (state === ConnectionState.ERROR) {
        setError('WebSocket接続エラーが発生しました。');
      }
    };
    
    // エラーイベントのリスナー
    const handleError = (error: Error) => {
      console.error('WebSocket error:', error);
      setError(`リアルタイム更新エラー: ${error.message}`);
    };
    
    // イベントリスナーを登録
    openSkyRealtimeClient.on(RealtimeEvents.AIRCRAFT_UPDATE, handleAircraftUpdate);
    openSkyRealtimeClient.on(RealtimeEvents.CONNECTION_STATE_CHANGE, handleConnectionStateChange);
    openSkyRealtimeClient.on(RealtimeEvents.ERROR, handleError);
    
    // クリーンアップ関数
    return () => {
      // イベントリスナーを削除
      openSkyRealtimeClient.removeListener(RealtimeEvents.AIRCRAFT_UPDATE, handleAircraftUpdate);
      openSkyRealtimeClient.removeListener(RealtimeEvents.CONNECTION_STATE_CHANGE, handleConnectionStateChange);
      openSkyRealtimeClient.removeListener(RealtimeEvents.ERROR, handleError);
      
      // WebSocket接続を閉じる
      openSkyRealtimeClient.disconnect();
    };
  }, []);

  // 初期化時のポーリング設定
  useEffect(() => {
    // 通常モードの場合はポーリングを設定
    if (!useRealtime) {
      setupPollingInterval();
    }
    
    // クリーンアップ関数
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []); // 依存配列を空にして、コンポーネントのマウント時にのみ実行

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

  // 接続状態に基づいたステータステキストを取得
  const getConnectionStatusText = () => {
    if (!useRealtime) return '';
    
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return '接続済み（リアルタイム）';
      case ConnectionState.CONNECTING:
        return '接続中...';
      case ConnectionState.DISCONNECTED:
        return '切断済み';
      case ConnectionState.ERROR:
        return '接続エラー';
      default:
        return '';
    }
  };

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

      {/* リアルタイムモード切り替えスイッチ */}
      <View style={styles.realtimeContainer}>
        <Text style={styles.realtimeText}>リアルタイムモード</Text>
        <Switch
          value={useRealtime}
          onValueChange={handleRealtimeToggle}
          trackColor={{ false: '#767577', true: '#81b0ff' }}
          thumbColor={useRealtime ? '#3366FF' : '#f4f3f4'}
        />
        {useRealtime && (
          <Text style={[
            styles.connectionStatus,
            connectionState === ConnectionState.CONNECTED ? styles.connected : 
            connectionState === ConnectionState.ERROR ? styles.error : styles.connecting
          ]}>
            {getConnectionStatusText()}
          </Text>
        )}
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
          最終更新: {getLastUpdateTimeString()}
        </Text>
        <TouchableOpacity 
          style={[
            styles.refreshButton,
            (useRealtime || loading || (Date.now() - lastUpdateTime < MIN_UPDATE_INTERVAL)) ? styles.disabledButton : {}
          ]}
          onPress={handleManualRefresh}
          disabled={useRealtime || loading || (Date.now() - lastUpdateTime < MIN_UPDATE_INTERVAL)}
        >
          <MaterialCommunityIcons
            name="refresh"
            size={20}
            color={(useRealtime || loading || (Date.now() - lastUpdateTime < MIN_UPDATE_INTERVAL)) ? "#999" : "#3366FF"}
          />
          <Text style={[
            styles.refreshText,
            {color: (useRealtime || loading || (Date.now() - lastUpdateTime < MIN_UPDATE_INTERVAL)) ? "#999" : "#3366FF"}
          ]}>
            更新
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
  disabledButton: {
    opacity: 0.6,
    borderColor: '#eee',
  },
  refreshText: {
    fontSize: 12,
    marginLeft: 4,
  },
  realtimeContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 10,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1000,
  },
  realtimeText: {
    fontSize: 12,
    marginRight: 8,
  },
  connectionStatus: {
    fontSize: 10,
    marginLeft: 8,
  },
  connected: {
    color: 'green',
  },
  connecting: {
    color: 'orange',
  },
  error: {
    color: 'red',
  },
}); 