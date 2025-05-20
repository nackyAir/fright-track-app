import { AircraftState } from './opensky';
import { EventEmitter } from 'events';

// 更新イベント
export enum OptimizedEvents {
  AIRCRAFT_UPDATE = 'aircraft_update',
  ERROR = 'error'
}

// 更新モード
export enum UpdateMode {
  NORMAL = 'normal',     // 通常の更新間隔（30秒）
  FAST = 'fast',         // 高速更新（5秒）
  ADAPTIVE = 'adaptive'  // 適応型更新（状況に応じて間隔を調整）
}

/**
 * 最適化されたポーリングによる航空機データ取得クラス
 */
export class OptimizedAircraftTracker extends EventEmitter {
  private updateInterval: NodeJS.Timeout | null = null;
  private boundingBox: [number, number, number, number] | null = null; // [lamin, lomin, lamax, lomax]
  private lastUpdateTime: number = 0;
  private updateMode: UpdateMode = UpdateMode.NORMAL;
  private normalInterval: number = 30000;  // 通常更新間隔（ミリ秒）
  private fastInterval: number = 5000;     // 高速更新間隔（ミリ秒）
  private adaptiveMinInterval: number = 5000;  // 適応型最小間隔（ミリ秒）
  private adaptiveMaxInterval: number = 60000; // 適応型最大間隔（ミリ秒）
  private currentInterval: number = 30000; // 現在の更新間隔（ミリ秒）
  private aircraftCache: Map<string, AircraftState> = new Map(); // ICAO24をキーとした航空機キャッシュ
  private movementThreshold: number = 0.0001; // 移動検出のしきい値（緯度/経度）
  private isActive: boolean = false;
  private errorCount: number = 0;
  private maxErrorCount: number = 5;
  private lastSuccessTime: number = 0;

  constructor() {
    super();
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
    
    // アクティブな場合は、新しい境界ボックスでデータを取得
    if (this.isActive) {
      this.fetchAircraftData();
    }
  }

  /**
   * 更新モードを設定
   * @param mode 更新モード
   */
  setUpdateMode(mode: UpdateMode): void {
    this.updateMode = mode;
    
    // 更新間隔を調整
    this.adjustUpdateInterval();
    
    // アクティブな場合は、更新間隔を再設定
    if (this.isActive) {
      this.restartUpdateInterval();
    }
  }

  /**
   * 更新を開始
   */
  startUpdates(): void {
    if (this.isActive) {
      return;
    }
    
    this.isActive = true;
    this.errorCount = 0;
    
    // 初回データ取得
    this.fetchAircraftData();
    
    // 更新間隔を設定
    this.restartUpdateInterval();
  }

  /**
   * 更新を停止
   */
  stopUpdates(): void {
    if (!this.isActive) {
      return;
    }
    
    this.isActive = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * 更新間隔を再設定
   */
  private restartUpdateInterval(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.updateInterval = setInterval(() => {
      this.fetchAircraftData();
    }, this.currentInterval);
  }

  /**
   * 更新間隔を調整
   */
  private adjustUpdateInterval(): void {
    switch (this.updateMode) {
      case UpdateMode.NORMAL:
        this.currentInterval = this.normalInterval;
        break;
      case UpdateMode.FAST:
        this.currentInterval = this.fastInterval;
        break;
      case UpdateMode.ADAPTIVE:
        // 適応型更新では、航空機の動きや数に基づいて間隔を調整
        this.adaptUpdateInterval();
        break;
    }
  }

  /**
   * 適応型更新間隔の調整
   */
  private adaptUpdateInterval(): void {
    const now = Date.now();
    const timeSinceLastSuccess = now - this.lastSuccessTime;
    
    // エラーが多い場合は間隔を長くする
    if (this.errorCount > 2) {
      this.currentInterval = Math.min(this.currentInterval * 1.5, this.adaptiveMaxInterval);
      return;
    }
    
    // 前回の更新から時間が経っていない場合は調整しない
    if (timeSinceLastSuccess < 10000) {
      return;
    }
    
    // 航空機の数に基づいて間隔を調整
    const aircraftCount = this.aircraftCache.size;
    
    if (aircraftCount > 50) {
      // 多数の航空機がある場合は間隔を長くする
      this.currentInterval = Math.min(this.currentInterval * 1.2, this.adaptiveMaxInterval);
    } else if (aircraftCount < 10) {
      // 少数の航空機の場合は間隔を短くする
      this.currentInterval = Math.max(this.currentInterval * 0.8, this.adaptiveMinInterval);
    }
    
    // 航空機の移動速度に基づいて調整
    const hasRapidMovement = this.detectRapidMovement();
    if (hasRapidMovement) {
      // 急速な移動がある場合は間隔を短くする
      this.currentInterval = Math.max(this.currentInterval * 0.7, this.adaptiveMinInterval);
    }
  }

  /**
   * 航空機の急速な移動を検出
   * @returns 急速な移動が検出された場合はtrue
   */
  private detectRapidMovement(): boolean {
    // キャッシュが少ない場合は検出しない
    if (this.aircraftCache.size < 5) {
      return false;
    }
    
    // 高速で移動している航空機の数をカウント
    let rapidMovementCount = 0;
    
    for (const aircraft of this.aircraftCache.values()) {
      // 速度が高い航空機をカウント（200 m/s以上 ≈ 720 km/h）
      if (aircraft.velocity !== null && aircraft.velocity > 200) {
        rapidMovementCount++;
      }
    }
    
    // 高速移動している航空機が一定数以上ある場合はtrueを返す
    return rapidMovementCount > Math.max(3, this.aircraftCache.size * 0.1);
  }

  /**
   * APIから航空機データを取得
   */
  private async fetchAircraftData(): Promise<void> {
    if (!this.boundingBox || !this.isActive) {
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
        this.emit(OptimizedEvents.AIRCRAFT_UPDATE, []);
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
      
      // 有効な位置情報を持つ航空機のみをフィルタリング
      const validAircraft = aircraftStates.filter(
        (a) => a.latitude !== null && a.longitude !== null
      );
      
      // キャッシュを更新
      this.updateCache(validAircraft);
      
      // 航空機データ更新イベントを発行
      this.emit(OptimizedEvents.AIRCRAFT_UPDATE, validAircraft);
      
      // 成功情報を更新
      this.lastUpdateTime = Date.now();
      this.lastSuccessTime = this.lastUpdateTime;
      this.errorCount = 0;
      
      // 適応型更新モードの場合は間隔を調整
      if (this.updateMode === UpdateMode.ADAPTIVE) {
        this.adaptUpdateInterval();
        this.restartUpdateInterval();
      }
    } catch (error) {
      console.error('Error fetching aircraft data:', error);
      this.emit(OptimizedEvents.ERROR, error);
      
      // エラーカウントを増やす
      this.errorCount++;
      
      // レート制限エラーの場合は間隔を長くする
      if (error instanceof Error && error.message.includes('429')) {
        this.currentInterval = Math.min(this.currentInterval * 2, this.adaptiveMaxInterval);
        console.log(`Rate limited. Increasing interval to ${this.currentInterval / 1000} seconds`);
        this.restartUpdateInterval();
      }
      
      // エラーが多すぎる場合は更新を一時停止
      if (this.errorCount >= this.maxErrorCount) {
        console.error(`Too many errors (${this.errorCount}). Pausing updates for 2 minutes.`);
        
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
        
        // 2分後に再開
        setTimeout(() => {
          this.errorCount = 0;
          this.currentInterval = this.normalInterval;
          this.restartUpdateInterval();
        }, 120000);
      }
    }
  }

  /**
   * 航空機キャッシュを更新
   * @param aircraft 航空機データの配列
   */
  private updateCache(aircraft: AircraftState[]): void {
    // 新しいデータでキャッシュを更新
    for (const a of aircraft) {
      this.aircraftCache.set(a.icao24, a);
    }
    
    // 古いデータを削除（最終接触から5分以上経過）
    const now = Math.floor(Date.now() / 1000); // 現在のUNIXタイムスタンプ（秒）
    const expirationTime = 300; // 5分（秒）
    
    for (const [icao24, cachedAircraft] of this.aircraftCache.entries()) {
      if (now - cachedAircraft.last_contact > expirationTime) {
        this.aircraftCache.delete(icao24);
      }
    }
  }

  /**
   * 現在の更新間隔を取得
   * @returns 更新間隔（ミリ秒）
   */
  getCurrentInterval(): number {
    return this.currentInterval;
  }

  /**
   * 更新間隔を手動で設定
   * @param interval 更新間隔（ミリ秒）
   */
  setCustomInterval(interval: number): void {
    this.currentInterval = Math.max(1000, interval); // 最小1秒
    
    if (this.isActive) {
      this.restartUpdateInterval();
    }
  }

  /**
   * 最後の更新時刻を取得
   * @returns 最後の更新時刻（ミリ秒）
   */
  getLastUpdateTime(): number {
    return this.lastUpdateTime;
  }

  /**
   * 手動更新を実行
   */
  forceUpdate(): void {
    if (!this.isActive) {
      return;
    }
    
    this.fetchAircraftData();
  }
}

// シングルトンインスタンスをエクスポート
export const optimizedTracker = new OptimizedAircraftTracker(); 