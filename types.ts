
export interface TruckData {
  truckNo: string;
  matName: string;
  arrivalTime: string;
  endTime: string;
  totalTime: number;
  weight: number;
  mxStock: number;
  whStock: number;
}

export type ChartTypeOption = 'bar' | 'area' | 'line' | 'stepAfter' | 'radar' | 'composed';

export interface DashboardSettings {
  refreshRate: number;
  benchmarkTime: number;
  warnThreshold: number;
  warnColor: string;
  animationEnabled: boolean;
  animationDuration: number;
  targetHours: number;
  chartTypes: {
    pareto: ChartTypeOption;
    tonnage: ChartTypeOption;
    frequency: ChartTypeOption;
    efficiency: ChartTypeOption;
    flow: ChartTypeOption;
  };
}

export interface FilterState {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  material: string;
}

export type Language = 'zh' | 'en' | 'hi';
export type EfficiencyMode = 'avg' | 'total';

export interface TranslationSet {
  title: string;
  liveStatus: string;
  totalUnits: string;
  avgRate: string;
  pareto: string;
  frequency: string;
  tonnage: string;
  efficiency: string;
  flow: string;
  settings: string;
  save: string;
  update: string;
  benchmark: string;
  threshold: string;
  targetHoursLabel: string;
  aiInsights: string;
  askAi: string;
  analyzing: string;
  arrival: string;
  departure: string;
  rate: string;
  effAvg: string;
  effTotal: string;
  selectDate: string;
  analysisTitle: string;
  statTop10: string;
  statRangeTotal: string;
  statRatio: string;
  statAvgDayWeight: string;
  statTotalUnits: string;
  statTotalWorkTime: string;
  statAvgDayUnits: string;
  statTotalEntryUnits: string;
  statAvgWorkTime: string;
  statTimeDist: string;
  statOperationRate: string;
  operationRateFormula: string;
  chartAnimation: string;
  animationStatus: string;
  animationDurationLabel: string;
  on: string;
  off: string;
  loginRequired: string;
  loginAction: string;
  logoutAction: string;
  statFetchDays: string;
}