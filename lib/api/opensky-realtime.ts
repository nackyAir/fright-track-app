import { AircraftState } from './opensky';
import { EventEmitter } from 'events';

// WebSocketの接続状態
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

// リアルタイム更新のイベント
export enum RealtimeEvents {
  AIRCRAFT_UPDATE = 'aircraft_update',
  CONNECTION_STATE_CHANGE = 'connection_state_change',
  ERROR = 'error'
}

// OpenSky NetworkのWebSocket URL（有料アカウントが必要）
const OPENSKY_WS_URL = 'wss://opensky-network.org/api/websocket';

/**
 * OpenSky NetworkのWebSocketを使用したリアルタイム航空機データ取得クラス
 * 注意: このクラスを使用するには、OpenSky Networkの有料アカウントが必要です
 */
export class OpenSkyRealtimeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000; // 初期再接続遅延（ミリ秒）
  private credentials: { username: string; password: string } | null = null;
  private boundingBox: [number, number, number, number] | null = null; // [lamin, lomin, lamax, lomax]

  constructor() {
    super();
  }

  /**
   * 認証情報を設定
   * @param username OpenSky Networkのユーザー名
   * @param password OpenSky Networkのパスワード
   */
  setCredentials(username: string, password: string): void {
    this.credentials = { username, password };
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
    
    // 接続中の場合は、新しい境界ボックスでサブスクリプションを更新
    if (this.connectionState === ConnectionState.CONNECTED && this.ws) {
      this.subscribe();
    }
  }

  /**
   * WebSocket接続を開始
   */
  connect(): void {
    if (this.connectionState === ConnectionState.CONNECTING || 
        this.connectionState === ConnectionState.CONNECTED) {
      return;
    }

    this.updateConnectionState(ConnectionState.CONNECTING);

    try {
      // WebSocket URLに認証情報を追加
      let wsUrl = OPENSKY_WS_URL;
      if (this.credentials) {
        const { username, password } = this.credentials;
        const auth = btoa(`${username}:${password}`);
        wsUrl = `${OPENSKY_WS_URL}?auth=${auth}`;
      }

      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * WebSocket接続を閉じる
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.updateConnectionState(ConnectionState.DISCONNECTED);
    this.reconnectAttempts = 0;
  }

  /**
   * 航空機データのサブスクリプションを開始
   */
  private subscribe(): void {
    if (!this.ws || this.connectionState !== ConnectionState.CONNECTED) {
      return;
    }

    if (this.boundingBox) {
      const [lamin, lomin, lamax, lomax] = this.boundingBox;
      
      // 境界ボックスに基づいてサブスクリプションリクエストを送信
      const subscriptionRequest = {
        type: 'subscribe',
        data: {
          type: 'bbox',
          lamin,
          lomin,
          lamax,
          lomax
        }
      };
      
      this.ws.send(JSON.stringify(subscriptionRequest));
      console.log('Subscribed to aircraft updates within bounding box');
    }
  }

  /**
   * WebSocket接続が開いたときのハンドラ
   */
  private handleOpen(): void {
    console.log('WebSocket connection established');
    this.updateConnectionState(ConnectionState.CONNECTED);
    this.reconnectAttempts = 0;
    
    // 境界ボックスが設定されている場合はサブスクリプションを開始
    if (this.boundingBox) {
      this.subscribe();
    }
  }

  /**
   * WebSocketメッセージを受信したときのハンドラ
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      // 航空機データの更新イベントを発行
      if (data.type === 'aircraft_update' && Array.isArray(data.data)) {
        // データを AircraftState 形式に変換
        const aircraftStates: AircraftState[] = data.data.map((aircraft: any) => ({
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
        
        this.emit(RealtimeEvents.AIRCRAFT_UPDATE, aircraftStates);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      this.emit(RealtimeEvents.ERROR, error);
    }
  }

  /**
   * WebSocketエラーが発生したときのハンドラ
   */
  private handleError(error: any): void {
    console.error('WebSocket error:', error);
    this.updateConnectionState(ConnectionState.ERROR);
    this.emit(RealtimeEvents.ERROR, error);
    
    // エラー後に再接続を試みる
    this.attemptReconnect();
  }

  /**
   * WebSocket接続が閉じたときのハンドラ
   */
  private handleClose(): void {
    console.log('WebSocket connection closed');
    this.updateConnectionState(ConnectionState.DISCONNECTED);
    
    // 接続が閉じた後に再接続を試みる
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
      this.emit(RealtimeEvents.ERROR, new Error('Maximum reconnection attempts reached'));
    }
  }

  /**
   * 接続状態を更新し、イベントを発行
   */
  private updateConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.emit(RealtimeEvents.CONNECTION_STATE_CHANGE, state);
  }

  /**
   * 現在の接続状態を取得
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }
}

// シングルトンインスタンスをエクスポート
export const openSkyRealtimeClient = new OpenSkyRealtimeClient(); 