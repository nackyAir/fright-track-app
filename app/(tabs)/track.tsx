import React, { useState } from 'react';
import { StyleSheet, View, Modal, SafeAreaView, StatusBar, Platform } from 'react-native';
import OptimizedAircraftMap from '../../components/OptimizedAircraftMap';
import AircraftDetails from '../../components/AircraftDetails';
import { AircraftState } from '../../lib/api/opensky';

export default function TrackScreen() {
  const [selectedAircraft, setSelectedAircraft] = useState<AircraftState | null>(null);

  // 航空機が選択されたときのハンドラ
  const handleAircraftSelect = (aircraft: AircraftState) => {
    setSelectedAircraft(aircraft);
  };

  // モーダルを閉じるハンドラ
  const handleCloseModal = () => {
    setSelectedAircraft(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* 最適化された航空機マップ */}
      <OptimizedAircraftMap onAircraftSelect={handleAircraftSelect} />
      
      {/* 航空機詳細モーダル */}
      <Modal
        visible={selectedAircraft !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalContainer}>
          {selectedAircraft && (
            <AircraftDetails
              aircraft={selectedAircraft}
              onClose={handleCloseModal}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
}); 