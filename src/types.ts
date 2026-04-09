export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SensorData {
  name: string;
  type: 'flame' | 'gas' | 'temp';
  value: number;
  threshold: number;
  priority: Priority;
}

export interface UpdatePayload {
  timestamp: string;
  sensors: SensorData[];
}
