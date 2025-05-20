import React from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { AircraftState } from '../lib/api/opensky';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface AircraftDetailsProps {
  aircraft: AircraftState;
  onClose: () => void;
}

export default function AircraftDetails({ aircraft, onClose }: AircraftDetailsProps) {
  // 航空機の速度をノットに変換（m/s → knot）
  const getSpeedInKnots = (speedMs: number | null): string => {
    if (speedMs === null) return '不明';
    return `${Math.round(speedMs * 1.94384)} kt`;
  };

  // 高度をフィートに変換（m → ft）
  const getAltitudeInFeet = (altitudeM: number | null): string => {
    if (altitudeM === null) return '不明';
    return `${Math.round(altitudeM * 3.28084)} ft`;
  };

  // 垂直速度を分あたりのフィートに変換（m/s → ft/min）
  const getVerticalRateInFtMin = (rateMs: number | null): string => {
    if (rateMs === null) return '不明';
    return `${Math.round(rateMs * 196.85)} ft/min`;
  };

  // タイムスタンプを日時に変換
  const formatTimestamp = (timestamp: number | null): string => {
    if (timestamp === null) return '不明';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('ja-JP');
  };

  // 方位角を方角に変換
  const getHeadingDirection = (heading: number | null): string => {
    if (heading === null) return '不明';
    
    const directions = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
                        '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
    const index = Math.round(((heading % 360) / 22.5)) % 16;
    return `${heading}° (${directions[index]})`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {aircraft.callsign ? aircraft.callsign.trim() : 'N/A'} ({aircraft.icao24})
        </Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>基本情報</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>コールサイン:</Text>
            <Text style={styles.infoValue}>{aircraft.callsign ? aircraft.callsign.trim() : '不明'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>ICAO24:</Text>
            <Text style={styles.infoValue}>{aircraft.icao24}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>国籍:</Text>
            <Text style={styles.infoValue}>{aircraft.origin_country}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>スコーク:</Text>
            <Text style={styles.infoValue}>{aircraft.squawk || '不明'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>地上:</Text>
            <Text style={styles.infoValue}>{aircraft.on_ground ? 'はい' : 'いいえ'}</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>位置情報</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>緯度:</Text>
            <Text style={styles.infoValue}>
              {aircraft.latitude !== null ? aircraft.latitude.toFixed(6) : '不明'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>経度:</Text>
            <Text style={styles.infoValue}>
              {aircraft.longitude !== null ? aircraft.longitude.toFixed(6) : '不明'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>気圧高度:</Text>
            <Text style={styles.infoValue}>
              {getAltitudeInFeet(aircraft.baro_altitude)}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>幾何高度:</Text>
            <Text style={styles.infoValue}>
              {getAltitudeInFeet(aircraft.geo_altitude)}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>位置更新:</Text>
            <Text style={styles.infoValue}>
              {formatTimestamp(aircraft.time_position)}
            </Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>飛行情報</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>速度:</Text>
            <Text style={styles.infoValue}>
              {getSpeedInKnots(aircraft.velocity)}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>方位:</Text>
            <Text style={styles.infoValue}>
              {getHeadingDirection(aircraft.true_track)}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>垂直速度:</Text>
            <Text style={styles.infoValue}>
              {getVerticalRateInFtMin(aircraft.vertical_rate)}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>最終接触:</Text>
            <Text style={styles.infoValue}>
              {formatTimestamp(aircraft.last_contact)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    maxHeight: '80%',
    width: '90%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  closeButton: {
    padding: 5,
  },
  scrollView: {
    maxHeight: '100%',
  },
  infoSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    backgroundColor: '#f5f5f5',
    padding: 5,
    borderRadius: 5,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 5,
  },
  infoLabel: {
    fontWeight: '600',
    width: '40%',
  },
  infoValue: {
    flex: 1,
  },
}); 