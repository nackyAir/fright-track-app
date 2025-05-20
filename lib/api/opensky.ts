import { z } from 'zod';

// OpenSky APIのレスポンスの型定義
export const AircraftStateSchema = z.object({
  icao24: z.string(),
  callsign: z.string().nullable(),
  origin_country: z.string(),
  time_position: z.number().nullable(),
  last_contact: z.number(),
  longitude: z.number().nullable(),
  latitude: z.number().nullable(),
  baro_altitude: z.number().nullable(),
  on_ground: z.boolean(),
  velocity: z.number().nullable(),
  true_track: z.number().nullable(),
  vertical_rate: z.number().nullable(),
  sensors: z.array(z.number()).nullable(),
  geo_altitude: z.number().nullable(),
  squawk: z.string().nullable(),
  spi: z.boolean(),
  position_source: z.number(),
});

export type AircraftState = z.infer<typeof AircraftStateSchema>;

export const OpenSkyResponseSchema = z.object({
  time: z.number(),
  states: z.array(z.tuple([
    z.string(),           // icao24
    z.string().nullable(), // callsign
    z.string(),           // origin_country
    z.number().nullable(), // time_position
    z.number(),           // last_contact
    z.number().nullable(), // longitude
    z.number().nullable(), // latitude
    z.number().nullable(), // baro_altitude
    z.boolean(),          // on_ground
    z.number().nullable(), // velocity
    z.number().nullable(), // true_track
    z.number().nullable(), // vertical_rate
    z.array(z.number()).nullable(), // sensors
    z.number().nullable(), // geo_altitude
    z.string().nullable(), // squawk
    z.boolean(),          // spi
    z.number(),           // position_source
  ])).nullable(),
});

export type OpenSkyResponse = z.infer<typeof OpenSkyResponseSchema>;

// OpenSky APIのレスポンスの状態配列の型
type StateArray = [
  string,           // icao24
  string | null,    // callsign
  string,           // origin_country
  number | null,    // time_position
  number,           // last_contact
  number | null,    // longitude
  number | null,    // latitude
  number | null,    // baro_altitude
  boolean,          // on_ground
  number | null,    // velocity
  number | null,    // true_track
  number | null,    // vertical_rate
  number[] | null,  // sensors
  number | null,    // geo_altitude
  string | null,    // squawk
  boolean,          // spi
  number            // position_source
];

const BASE_URL = 'https://opensky-network.org/api';

// APIリクエストの設定
const API_CONFIG = {
  maxRetries: 3,         // 最大リトライ回数
  retryDelay: 1000,      // リトライ間隔（ミリ秒）
  timeout: 10000,        // タイムアウト（ミリ秒）
  cacheDuration: 60000,  // キャッシュ有効期間（ミリ秒）
};

// キャッシュ用のオブジェクト
interface CacheItem {
  timestamp: number;
  data: AircraftState[];
}

const cache: Record<string, CacheItem> = {};

/**
 * APIリクエストを実行する関数（リトライロジック付き）
 * @param url APIのURL
 * @returns レスポンスデータ
 */
async function fetchWithRetry(url: string): Promise<any> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < API_CONFIG.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
      
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // 429エラーの場合は即座にエラーをスロー（リトライしない）
        if (response.status === 429) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      return await response.json();
    } catch (error: any) {
      lastError = error;
      
      // AbortControllerによるタイムアウトの場合
      if (error.name === 'AbortError') {
        console.warn(`Request timed out (attempt ${attempt + 1}/${API_CONFIG.maxRetries})`);
      } else {
        console.warn(`Request failed (attempt ${attempt + 1}/${API_CONFIG.maxRetries}): ${error.message}`);
      }
      
      // 429エラーの場合はリトライしない
      if (error.message && error.message.includes('429')) {
        break;
      }
      
      // 最後のリトライでなければ待機
      if (attempt < API_CONFIG.maxRetries - 1) {
        // 指数バックオフ（リトライごとに待機時間を増やす）
        const delay = API_CONFIG.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // すべてのリトライが失敗した場合
  throw lastError || new Error('Unknown error occurred during API request');
}

/**
 * キャッシュキーを生成する関数
 * @param params キャッシュキーを生成するためのパラメータ
 * @returns キャッシュキー
 */
function generateCacheKey(params: Record<string, any>): string {
  return Object.entries(params)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/**
 * 指定された境界ボックス内の全ての航空機の状態を取得します
 * @param lamin 最小緯度
 * @param lomin 最小経度
 * @param lamax 最大緯度
 * @param lomax 最大経度
 * @param useCache キャッシュを使用するかどうか
 * @returns 航空機の状態の配列
 */
export async function getAllAircraftStates(
  lamin: number,
  lomin: number,
  lamax: number,
  lomax: number,
  useCache: boolean = true
): Promise<AircraftState[]> {
  try {
    // キャッシュキーを生成
    const params = { lamin, lomin, lamax, lomax };
    const cacheKey = generateCacheKey(params);
    
    // キャッシュをチェック
    const now = Date.now();
    if (useCache && cache[cacheKey] && (now - cache[cacheKey].timestamp < API_CONFIG.cacheDuration)) {
      console.log('Using cached aircraft data');
      return cache[cacheKey].data;
    }
    
    const url = `${BASE_URL}/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
    const data = await fetchWithRetry(url);
    const parsedData = OpenSkyResponseSchema.parse(data);
    
    if (!parsedData.states) {
      return [];
    }
    
    const aircraftStates = parsedData.states.map((state: StateArray) => ({
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
    
    // 結果をキャッシュに保存
    if (useCache) {
      cache[cacheKey] = {
        timestamp: now,
        data: aircraftStates
      };
    }
    
    return aircraftStates;
  } catch (error) {
    console.error('Error fetching aircraft states:', error);
    throw error;
  }
}

/**
 * 特定の航空機の状態を取得します
 * @param icao24 航空機のICAO 24-bit アドレス（16進数文字列）
 * @param useCache キャッシュを使用するかどうか
 * @returns 航空機の状態
 */
export async function getAircraftState(
  icao24: string,
  useCache: boolean = true
): Promise<AircraftState | null> {
  try {
    // キャッシュキーを生成
    const params = { icao24: icao24.toLowerCase() };
    const cacheKey = generateCacheKey(params);
    
    // キャッシュをチェック
    const now = Date.now();
    if (useCache && cache[cacheKey] && (now - cache[cacheKey].timestamp < API_CONFIG.cacheDuration)) {
      console.log('Using cached aircraft data');
      if (cache[cacheKey].data.length > 0) {
        return cache[cacheKey].data[0];
      }
      return null;
    }
    
    const url = `${BASE_URL}/states/all?icao24=${icao24.toLowerCase()}`;
    const data = await fetchWithRetry(url);
    const parsedData = OpenSkyResponseSchema.parse(data);
    
    if (!parsedData.states || parsedData.states.length === 0) {
      // 空の結果もキャッシュ
      if (useCache) {
        cache[cacheKey] = {
          timestamp: now,
          data: []
        };
      }
      return null;
    }
    
    const state = parsedData.states[0] as StateArray;
    const aircraftState = {
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
    };
    
    // 結果をキャッシュに保存
    if (useCache) {
      cache[cacheKey] = {
        timestamp: now,
        data: [aircraftState]
      };
    }
    
    return aircraftState;
  } catch (error) {
    console.error('Error fetching aircraft state:', error);
    throw error;
  }
} 