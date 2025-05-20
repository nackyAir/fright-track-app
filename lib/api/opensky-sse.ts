import { AircraftState } from './opensky';
import { EventEmitter } from 'events';

// SSE接続状態
export enum SSEConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

// SSEイベント
export enum SSEEvents {
  AIRCRAFT_UPDATE = 'aircraft_update',
  CONNECTION_STATE_CHANGE = 'connection_state_change',
  ERROR = 'error'
}

/**
 * Server-Sent Events (SSE) を使用したリアルタイム航空機データ取得クラス
 * 注意: このクラスを使用するには、SSEをサポートするサーバーが必要です
 */
export class OpenSkySSEClient extends EventEmitter {
  private eventSource: EventSource | null = null;
  private connectionState: SSEConnectionState = SSEConnectionState.DISCONNECTED;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000; // 初期再接続遅延（ミリ秒）
  private sseUrl: string = '';
  private boundingBox: [number, number, number, number] | null = null; // [lamin, lomin, lamax, lomax]
  private pollingInterval: NodeJS.Timeout | null = null;
  private pollingDelay: number = 5000; // ポーリング間隔（ミリ秒）

  constructor() {
    super();
  }

  /**
   * SSE接続URLを設定
   * @param url SSE接続URL
   */
  setSSEUrl(url: string): void {
    this.sseUrl = url;
  }

  /**
   * 監視する境界ボックスを設定
   * @param lamin 最小緯度
   * @param lomin 最小経度
   * @param lamax 最大緯度
   * @param lomax 最大経度
   */
  setBoundingBox(lamin: number, lomin: number, lamax: number, lomax: number): void {
    this.boundingBox = [lamin, lomin, lamax, lomax];
    
    // 接続中の場合は、新しい境界ボックスでSSE接続を更新
    if (this.connectionState === SSEConnectionState.CONNECTED) {
      this.disconnect();
      this.connect();
    }
  }

  /**
   * SSE接続を開始
   */
  connect(): void {
    if (this.connectionState === SSEConnectionState.CONNECTING || 
        this.connectionState === SSEConnectionState.CONNECTED) {
      return;
    }

    this.updateConnectionState(SSEConnectionState.CONNECTING);

    try {
      // SSEがサポートされているか確認
      if (typeof EventSource === 'undefined') {
        throw new Error('Server-Sent Events are not supported in this browser');
      }

      // 境界ボックスが設定されているか確認
      if (!this.boundingBox) {
        throw new Error('Bounding box not set');
      }

      // SSE接続URLが設定されているか確認
      if (!this.sseUrl) {
        // SSEサーバーがない場合は、ポーリングによるシミュレーションを開始
        this.startPollingSimulation();
        return;
      }

      // 境界ボックスパラメータを追加
      const [lamin, lomin, lamax, lomax] = this.boundingBox;
      const url = `${this.sseUrl}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
      
      // EventSourceを作成
      this.eventSource = new EventSource(url);
      
      // イベントリスナーを設定
      this.eventSource.onopen = this.handleOpen.bind(this);
      this.eventSource.onmessage = this.handleMessage.bind(this);
      this.eventSource.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error('Failed to connect to SSE:', error);
      this.handleError(error);
      
      // SSEがサポートされていない場合は、ポーリングによるシミュレーションを開始
      this.startPollingSimulation();
    }
  }

  /**
   * SSE接続を閉じる
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    this.updateConnectionState(SSEConnectionState.DISCONNECTED);
    this.reconnectAttempts = 0;
  }

  /**
   * ポーリングによるSSEシミュレーションを開始
   * 注意: これは実際のSSEではなく、通常のAPIポーリングによるシミュレーションです
   */
  private startPollingSimulation(): void {
    console.log('Starting SSE simulation with polling');
    this.updateConnectionState(SSEConnectionState.CONNECTED);
    
    // ポーリング間隔をクリア
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    // 初回データ取得
    this.fetchAircraftData();
    
    // 定期的なポーリングを設定
    this.pollingInterval = setInterval(() => {
      this.fetchAircraftData();
    }, this.pollingDelay);
  }

  /**
   * APIから航空機データを取得（ポーリングシミュレーション用）
   */
  private async fetchAircraftData(): Promise<void> {
    if (!this.boundingBox) {
      return;
    }
    
    try {
      const [lamin, lomin, lamax, lomax] = this.boundingBox;
      const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.states) {
        this.emit(SSEEvents.AIRCRAFT_UPDATE, []);
        return;
      }
      
      // データを AircraftState 形式に変換
      const aircraftStates: AircraftState[] = data.states.map((state: any[]) => ({
        icao24: state[0],
        callsign: state[1],
        origin_country: state[2],
        time_position: state[3],
        last_contact: state[4],
        longitude: state[5],
        latitude: state[6],
        baro_altitude: state[7],
        on_ground: state[8],
        velocity: state[9],
        true_track: state[10],
        vertical_rate: state[11],
        sensors: state[12],
        geo_altitude: state[13],
        squawk: state[14],
        spi: state[15],
        position_source: state[16],
      }));
      
      // 航空機データ更新イベントを発行
      this.emit(SSEEvents.AIRCRAFT_UPDATE, aircraftStates);
    } catch (error) {
      console.error('Error fetching aircraft data:', error);
      this.emit(SSEEvents.ERROR, error);
      
      // レート制限エラーの場合はポーリング間隔を長くする
      if (error instanceof Error && error.message.includes('429')) {
        this.pollingDelay = Math.min(this.pollingDelay * 2, 30000); // 最大30秒
        console.log(`Rate limited. Increasing polling delay to ${this.pollingDelay / 1000} seconds`);
      }
    }
  }

  /**
   * SSE接続が開いたときのハンドラ
   */
  private handleOpen(): void {
    console.log('SSE connection established');
    this.updateConnectionState(SSEConnectionState.CONNECTED);
    this.reconnectAttempts = 0;
  }

  /**
   * SSEメッセージを受信したときのハンドラ
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      // 航空機データの更新イベントを発行
      if (Array.isArray(data)) {
        // データを AircraftState 形式に変換
        const aircraftStates: AircraftState[] = data.map((aircraft: any) => ({
          icao24: aircraft.icao24,
          callsign: aircraft.callsign,
          origin_country: aircraft.origin_country || '',
          time_position: aircraft.time_position,
          last_contact: aircraft.last_contact,
          longitude: aircraft.longitude,
          latitude: aircraft.latitude,
          baro_altitude: aircraft.baro_altitude,
          on_ground: aircraft.on_ground,
          velocity: aircraft.velocity,
          true_track: aircraft.true_track,
          vertical_rate: aircraft.vertical_rate,
          sensors: aircraft.sensors,
          geo_altitude: aircraft.geo_altitude,
          squawk: aircraft.squawk,
          spi: aircraft.spi,
          position_source: aircraft.position_source,
        }));
        
        this.emit(SSEEvents.AIRCRAFT_UPDATE, aircraftStates);
      }
    } catch (error) {
      console.error('Error parsing SSE message:', error);
      this.emit(SSEEvents.ERROR, error);
    }
  }

  /**
   * SSEエラーが発生したときのハンドラ
   */
  private handleError(error: any): void {
    console.error('SSE error:', error);
    this.updateConnectionState(SSEConnectionState.ERROR);
    this.emit(SSEEvents.ERROR, error);
    
    // エラー後に再接続を試みる
    this.attemptReconnect();
  }

  /**
   * 再接続を試みる
   */
  private attemptReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      console.log(`Attempting to reconnect in ${delay / 1000} seconds...`);
      
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    } else {
      console.error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
      this.emit(SSEEvents.ERROR, new Error('Maximum reconnection attempts reached'));
      
      // SSEが失敗した場合は、ポーリングによるシミュレーションを開始
      this.startPollingSimulation();
    }
  }

  /**
   * 接続状態を更新し、イベントを発行
   */
  private updateConnectionState(state: SSEConnectionState): void {
    this.connectionState = state;
    this.emit(SSEEvents.CONNECTION_STATE_CHANGE, state);
  }

  /**
   * 現在の接続状態を取得
   */
  getConnectionState(): SSEConnectionState {
    return this.connectionState;
  }

  /**
   * ポーリング間隔を設定
   * @param delay ポーリング間隔（ミリ秒）
   */
  setPollingDelay(delay: number): void {
    this.pollingDelay = delay;
    
    // ポーリングシミュレーション中の場合は、間隔を更新
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = setInterval(() => {
        this.fetchAircraftData();
      }, this.pollingDelay);
    }
  }
}

// シングルトンインスタンスをエクスポート
export const openSkySSEClient = new OpenSkySSEClient(); 