import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ComposedChart, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  LabelList, ReferenceLine
} from 'recharts';
import { 
  Settings as SettingsIcon, 
  RefreshCcw, 
  TrendingUp, 
  Clock, 
  LayoutGrid,
  Zap,
  Pause,
  Play,
  Save,
  Info,
  BarChart3,
  Copy
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { I18N, CSV_URL } from './constants.ts';
import { TruckData, DashboardSettings, FilterState, Language, EfficiencyMode } from './types.ts';

// --- IST Time Utilities ---
const UNIFIED_ANIM_SPEED = 1200; 

/**
 * Gets the current date/time specifically in India Standard Time
 * Returns a Date object where the local components (hours, minutes) match IST.
 */
function getISTNow(): Date {
  const now = new Date();
  const indiaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  return new Date(indiaTimeStr);
}

/**
 * Formats a Date object to YYYY-MM-DD using its local components.
 * This avoids timezone conversions shifting the day.
 */
function formatDateToISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Logic: If the time (in Factory Time/IST) is before 07:00, the "Shift Date" is yesterday.
 */
function getShiftDateString(date: Date): string {
  const h = date.getHours();
  // Create a copy to manipulate
  const d = new Date(date);
  if (h < 7) {
    d.setDate(d.getDate() - 1);
  }
  return formatDateToISO(d);
}

function robustParseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let col = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') { col += '"'; i++; }
      else if (char === '"') inQuotes = false;
      else col += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ',') { row.push(col); col = ""; }
      else if (char === '\n' || char === '\r') {
        row.push(col);
        if (row.length > 0) result.push(row);
        row = []; col = "";
        if (char === '\r' && nextChar === '\n') i++;
      } else col += char;
    }
  }
  if (col || row.length > 0) { row.push(col); result.push(row); }
  return result;
}

function findColIdx(headers: string[], keywords: string[]): number {
  return headers.findIndex(h => keywords.some(k => h.toLowerCase().includes(k.toLowerCase())));
}

/**
 * Parses date strings from CSV. 
 * Supports DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD.
 * Returns a Date object representing the "Factory Wall Time".
 */
function smartParseDate(str: string) {
  if (!str) return null;
  const cleanStr = str.trim().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00a0/g, ' ');
  
  // Extract time part if exists
  const parts = cleanStr.split(/\s+/);
  const datePart = parts[0];
  const timePart = parts.length > 1 ? parts[1] : "00:00";
  const [hh, mm] = timePart.split(':').map(Number);

  // Try YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = datePart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]), hh || 0, mm || 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = datePart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    // dmyMatch[1] = Day, dmyMatch[2] = Month, dmyMatch[3] = Year
    const d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]), hh || 0, mm || 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback
  const d = new Date(cleanStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Safe number parsing that handles commas (e.g. "1,894")
 */
function parseNumberSafe(str: string): number {
  if (!str) return 0;
  // Remove commas before parsing
  return parseFloat(str.replace(/,/g, '')) || 0;
}

// --- Sub-components ---

const StatBox = ({ label, value, colorClass = "text-indigo-600", formula }: any) => {
  return (
    <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center shadow-sm relative group transition-all hover:bg-white hover:shadow-md h-full min-h-[100px]">
      <span className="text-xs sm:text-sm uppercase tracking-wider text-slate-500 font-black mb-1.5 flex items-center gap-1">
        {label} {formula && <Info className="w-3.5 h-3.5 opacity-50" />}
      </span>
      <div className={`font-black ${colorClass} flex flex-col leading-tight`}>
        {Array.isArray(value) ? (
          value.map((v, i) => <span key={i} className="text-xs sm:text-sm">{v}</span>)
        ) : (
          <span className="text-lg sm:text-2xl">{value}</span>
        )}
      </div>
      {formula && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-slate-800 text-white text-[10px] p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl leading-relaxed text-center">
          {formula}
        </div>
      )}
    </div>
  );
};

const DashboardTimer = ({ rate, isPaused, onTrigger, onTogglePause }: { rate: number, isPaused: boolean, onTrigger: () => void, onTogglePause: () => void }) => {
  const [countdown, setCountdown] = useState(rate);
  useEffect(() => setCountdown(rate), [rate]);
  
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { 
          onTrigger(); 
          return rate; 
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPaused, rate, onTrigger]);

  return (
    <div className="bg-slate-900 text-white px-6 py-2 rounded-b-2xl text-xl font-black font-mono shadow-xl flex items-center gap-4 border-x border-b border-indigo-500/30 pointer-events-auto transition-all">
      <RefreshCcw className="w-5 h-5 text-indigo-400" />
      <span className="min-w-[50px] text-center tabular-nums">{countdown}s</span>
      <button onClick={onTogglePause} className="hover:scale-110 active:scale-95 transition-transform">
        {isPaused ? <Play className="w-5 h-5 fill-amber-500 text-amber-500" /> : <Pause className="w-5 h-5 fill-slate-500 text-slate-500" />}
      </button>
    </div>
  );
};

const DynamicChart = React.memo(({ type, data, keys, colors, axisKeys, yDomain, benchmark, settings, dataVersion = 0 }: any) => {
  const [showLabels, setShowLabels] = useState(false);
  
  useEffect(() => {
    setShowLabels(false);
    const delay = settings.animationEnabled ? UNIFIED_ANIM_SPEED + 150 : 50;
    const timer = setTimeout(() => setShowLabels(true), delay);
    return () => clearTimeout(timer);
  }, [dataVersion, type, settings.animationEnabled]);

  if (!data || !Array.isArray(data) || data.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-slate-300 font-bold italic">No data available for the selected range</div>;
  }

  const animationProps = { 
    isAnimationActive: settings.animationEnabled, 
    animationDuration: UNIFIED_ANIM_SPEED,
    animationBegin: 0
  };

  const renderChart = () => {
    if (type === 'radar') {
      return (
        <RadarChart outerRadius="75%" data={data}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey={axisKeys.x} fontSize={10} fontWeight="black" stroke="#475569" />
          <Radar name={keys[0]} dataKey={keys[0]} stroke={colors[0]} strokeWidth={3} fill={colors[0]} fillOpacity={0.5} {...animationProps} />
          <Tooltip />
        </RadarChart>
      );
    }
    
    const ChartComp: any = type === 'composed' ? ComposedChart : (type === 'bar' ? BarChart : (type === 'area' ? AreaChart : LineChart));
    
    // Explicitly use 0 (number) for default axis, ensuring connection between Axis and Series.
    const primaryYAxisId = type === 'composed' ? "left" : 0;

    return (
      <ChartComp data={data} margin={{ top: 30, right: 30, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
        <XAxis 
          dataKey={axisKeys.x} 
          fontSize={9} 
          fontWeight="bold" 
          stroke="#64748b" 
          angle={-45} 
          textAnchor="end" 
          interval={0}
          height={70}
          padding={{ left: 20, right: 20 }} 
        />
        <YAxis 
          yAxisId={primaryYAxisId} 
          stroke="#64748b" 
          fontSize={10} 
          fontWeight="bold" 
          width={45} 
          domain={yDomain || [0, 'auto']} 
        />
        {type === 'composed' && <YAxis yAxisId="right" orientation="right" stroke={colors[1]} fontSize={9} width={45} domain={[0, 100]} />}
        <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px' }} />
        {type === 'composed' ? (
          <>
            <Bar yAxisId="left" dataKey={keys[0]} fill={colors[0]} radius={[4, 4, 0, 0]} barSize={30} {...animationProps}>
              {showLabels && <LabelList dataKey={keys[0]} position="top" style={{ fontSize: '10px', fontWeight: '900', fill: colors[0] }} />}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey={keys[1]} stroke={colors[1]} strokeWidth={3} dot={{ r: 3 }} {...animationProps}>
              {showLabels && <LabelList dataKey={keys[1]} position="top" formatter={(v: any) => `${v}%`} style={{ fontSize: '10px', fontWeight: '900', fill: colors[1] }} />}
            </Line>
          </>
        ) : type === 'bar' ? (
          <Bar yAxisId={primaryYAxisId} dataKey={keys[0]} fill={colors[0]} radius={[4, 4, 0, 0]} {...animationProps}>
            {showLabels && <LabelList dataKey={keys[0]} position="top" style={{ fontSize: '10px', fontWeight: '900', fill: colors[0] }} />}
          </Bar>
        ) : type === 'area' ? (
          <Area yAxisId={primaryYAxisId} type="monotone" dataKey={keys[0]} stroke={colors[0]} fill={colors[0]} fillOpacity={0.2} strokeWidth={3} {...animationProps}>
            {showLabels && <LabelList dataKey={keys[0]} position="top" offset={10} style={{ fontSize: '10px', fontWeight: '900', fill: colors[0] }} />}
          </Area>
        ) : (
          <Line yAxisId={primaryYAxisId} type={type === 'stepAfter' ? 'stepAfter' : 'monotone'} dataKey={keys[0]} stroke={colors[0]} strokeWidth={3} dot={{ r: 3 }} {...animationProps}>
            {showLabels && <LabelList dataKey={keys[0]} position="top" offset={10} style={{ fontSize: '10px', fontWeight: '900', fill: colors[0] }} />}
          </Line>
        )}
        {benchmark && <ReferenceLine yAxisId={primaryYAxisId} y={benchmark} stroke="#ef4444" strokeDasharray="5 5" />}
      </ChartComp>
    );
  };

  // Removed overflow-hidden to allow axis labels to be fully visible even if margin is tight
  return (
    <div className="w-full h-full relative" style={{ minHeight: '300px' }} key={`${type}-${dataVersion}`}>
      <ResponsiveContainer width="100%" height="100%">{renderChart()}</ResponsiveContainer>
    </div>
  );
});

// --- Main App ---

export const App: React.FC = () => {
  const [rawData, setRawData] = useState<TruckData[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [animationTick, setAnimationTick] = useState(0);
  const [lang, setLang] = useState<Language>('zh');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const [monitorDate, setMonitorDate] = useState<string>(() => getShiftDateString(getISTNow()));
  const [effMode, setEffMode] = useState<EfficiencyMode>('avg');

  const [settings, setSettings] = useState<DashboardSettings>(() => {
    const saved = localStorage.getItem('logistics_v14_config');
    if (saved) return JSON.parse(saved);
    return {
      refreshRate: 600,
      benchmarkTime: 60,
      warnThreshold: 95, 
      warnColor: '#ef4444',
      animationEnabled: false,
      animationDuration: 30, 
      targetHours: 10,
      chartTypes: {
        pareto: 'composed',
        tonnage: 'area',
        frequency: 'bar',
        efficiency: 'stepAfter',
        flow: 'radar'
      }
    };
  });

  const [filters, setFilters] = useState<FilterState>(() => {
    const istNow = getISTNow();
    const ago = new Date(istNow);
    ago.setDate(istNow.getDate() - 30);
    return { startDate: formatDateToISO(ago), endDate: formatDateToISO(istNow), material: '' };
  });

  const t = I18N[lang];

  useEffect(() => {
    let intervalId: number;
    if (settings.animationEnabled) {
      intervalId = window.setInterval(() => setAnimationTick(prev => prev + 1), settings.animationDuration * 1000);
    }
    return () => clearInterval(intervalId);
  }, [settings.animationEnabled, settings.animationDuration]);

  const combinedVersion = useMemo(() => dataVersion + animationTick, [dataVersion, animationTick]);

  const fetchCSV = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${CSV_URL}&cb=${Date.now()}`);
      const text = await res.text();
      const allRows = robustParseCSV(text);
      if (allRows.length <= 1) return;
      const headers = allRows[0].map(h => h.trim());
      const idx = {
        truck: findColIdx(headers, ["車號", "車牌", "Truck"]),
        mat: findColIdx(headers, ["原材料", "品名", "Material"]),
        arrival: findColIdx(headers, ["進場", "Arrival"]),
        end: findColIdx(headers, ["結束", "作業完成", "End"]),
        totalTime: findColIdx(headers, ["作業總時間", "總時間", "Duration", "Total Time"]),
        weight: findColIdx(headers, ["重量", "Weight", "(t)"])
      };
      const parsed = allRows.slice(1).map(c => ({
        truckNo: c[idx.truck] || "N/A",
        matName: c[idx.mat] || "N/A",
        arrivalTime: c[idx.arrival] || "",
        endTime: c[idx.end] || "",
        // Fix: Remove commas to ensure large numbers (e.g., 1,894) are parsed correctly
        totalTime: parseNumberSafe(c[idx.totalTime]),
        weight: parseNumberSafe(c[idx.weight]),
        mxStock: 0, whStock: 0
      })).filter(x => !!x.matName);
      setRawData(parsed);
      setDataVersion(v => v + 1);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchCSV(); }, [fetchCSV]);

  const materialList = useMemo(() => {
    const mats = new Set(rawData.map(r => r.matName));
    return Array.from(mats).sort();
  }, [rawData]);

  const filteredData = useMemo(() => {
    const s = smartParseDate(filters.startDate);
    const e = smartParseDate(filters.endDate);
    if (!s || !e) return [];
    
    const sB = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 7, 0);
    const eB = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1, 7, 0);
    
    return rawData.filter(r => {
      const d = smartParseDate(r.arrivalTime);
      return d && d >= sB && d < eB && (!filters.material || r.matName.toLowerCase().includes(filters.material.toLowerCase()));
    });
  }, [rawData, filters]);

  const timelineData = useMemo(() => {
    const map: Record<string, any> = {};
    filteredData.forEach(r => {
      const d = smartParseDate(r.arrivalTime);
      if (d) {
        const k = getShiftDateString(d);
        if (!map[k]) map[k] = { date: k, tons: 0, counts: 0, time: 0 };
        map[k].tons += r.weight / 1000;
        map[k].counts++;
        map[k].time += r.totalTime;
      }
    });
    return Object.values(map).map((v: any) => ({ 
      ...v, tons: parseFloat(v.tons.toFixed(1)), avgTime: Math.round(v.time / v.counts) 
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData]);

  const rangeSummary = useMemo(() => {
    const totalTons = timelineData.reduce((a, b) => a + b.tons, 0);
    const totalCounts = timelineData.reduce((a, b) => a + b.counts, 0);
    const totalTime = timelineData.reduce((a, b) => a + b.time, 0);
    const days = timelineData.length || 1;
    const avgTotalWorkTimePerDay = totalTime / days;
    
    return {
      totalTons: parseFloat(totalTons.toFixed(1)),
      totalCounts,
      totalTime,
      avgTonsPerDay: parseFloat((totalTons / days).toFixed(1)),
      avgCountsPerDay: parseFloat((totalCounts / days).toFixed(1)),
      avgTotalWorkTimePerDay: Math.round(avgTotalWorkTimePerDay),
      avgEff: totalCounts > 0 ? Math.round(totalTime / totalCounts) : 0,
      days
    };
  }, [timelineData]);

  const paretoData = useMemo(() => {
    const stats: Record<string, number> = {};
    filteredData.forEach(r => stats[r.matName] = (stats[r.matName] || 0) + (r.weight / 1000));
    const sorted = Object.entries(stats).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([n, t]) => ({ name: n, tons: parseFloat(t.toFixed(1)) }));
    const top10Total = sorted.reduce((a,b) => a+b.tons, 0);
    let acc = 0;
    const items = sorted.map(i => { acc += i.tons; return { ...i, percentage: top10Total > 0 ? Math.round((acc/top10Total)*100) : 0 }; });
    return { items, top10Total };
  }, [filteredData]);

  const flowData = useMemo(() => {
    const hrs = Array.from({length:24}, (_,i) => ({ hour: `${i}h`, count: 0 }));
    filteredData.forEach(r => {
      const d = smartParseDate(r.arrivalTime);
      if (d) {
        hrs[d.getHours()].count++;
      }
    });
    const amActive = hrs.slice(0, 12).filter(h => h.count > 0).map(h => parseInt(h.hour));
    const pmActive = hrs.slice(12, 24).filter(h => h.count > 0).map(h => parseInt(h.hour));
    const amStr = amActive.length > 0 ? `AM: ${Math.min(...amActive)}h~${Math.max(...amActive)}h` : "AM: --";
    const pmStr = pmActive.length > 0 ? `PM: ${Math.min(...pmActive)}h~${Math.max(...pmActive)}h` : "PM: --";
    return { hrs, amStr, pmStr };
  }, [filteredData]);

  const todayMonitor = useMemo(() => {
    const base = smartParseDate(monitorDate);
    if (!base) return { items: [], avgRate: 0 };
    const s = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 7, 0);
    const e = new Date(s); e.setDate(e.getDate() + 1);
    const items = rawData.filter(r => {
      const d = smartParseDate(r.arrivalTime);
      return d && d >= s && d < e;
    }).sort((a, b) => (smartParseDate(b.arrivalTime)?.getTime() || 0) - (smartParseDate(a.arrivalTime)?.getTime() || 0));
    
    if (items.length === 0) return { items: [], avgRate: 0 };
    const itemsWithRate = items.map(item => {
      let rate = 100;
      if (item.totalTime > 0) {
        rate = Math.min(100, Math.round((settings.benchmarkTime / item.totalTime) * 100));
      }
      return { ...item, rate };
    });
    const avgRateValue = itemsWithRate.length > 0 ? Math.round(itemsWithRate.reduce((acc, cur) => acc + (cur.rate || 0), 0) / items.length) : 0;
    return { items: itemsWithRate, avgRate: avgRateValue };
  }, [rawData, monitorDate, settings.benchmarkTime]);

  const handleApplySettings = () => {
    localStorage.setItem('logistics_v14_config', JSON.stringify(settings));
    setIsSettingsOpen(false);
    setDataVersion(v => v + 1);
    setAnimationTick(0);
  };

  const copyToClipboard = async (elementId: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    try {
      const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2 });
      canvas.toBlob(async (blob) => {
        if (blob) {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          alert('Captured and copied to clipboard!');
        }
      });
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  };

  const syncBenchmarkToAverage = () => {
    setSettings(s => ({ ...s, benchmarkTime: rangeSummary.avgEff }));
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-20 font-sans">
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <DashboardTimer 
          rate={settings.refreshRate} 
          isPaused={isPaused || isLoading} 
          onTrigger={fetchCSV} 
          onTogglePause={() => setIsPaused(!isPaused)}
        />
      </div>

      <header className="bg-white border-b sticky top-0 z-40 px-6 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <BarChart3 className="text-indigo-600 w-6 h-6" />
          <h1 className="text-lg font-black text-slate-800 tracking-tight">{t.title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <select value={lang} onChange={e => setLang(e.target.value as Language)} className="text-sm font-bold border rounded-xl p-2 outline-none cursor-pointer bg-slate-50">
            <option value="zh">繁體中文</option>
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 bg-slate-50 border rounded-xl hover:bg-slate-100 transition-all shadow-sm"><SettingsIcon className="w-6 h-6 text-slate-600" /></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        <section className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-10 border-b border-slate-800 pb-8">
            <div className="space-y-2">
              <h2 className="text-3xl font-black flex items-center gap-4">
                <Clock className="text-indigo-400 w-8 h-8" /> {t.liveStatus} <span className="text-xs font-black text-indigo-400/60 ml-2">(IST)</span>
              </h2>
              <input type="date" value={monitorDate} onChange={e => setMonitorDate(e.target.value)} className="bg-slate-800 text-slate-200 font-bold px-5 py-3 rounded-2xl outline-none border border-slate-700 focus:border-indigo-500 cursor-pointer" />
            </div>
            <div className="flex gap-12 items-center bg-slate-800/40 p-8 rounded-3xl border border-slate-700/50">
              <div className="text-center"><div className="text-4xl font-black text-indigo-400">{todayMonitor.items.length}</div><div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{t.totalUnits}</div></div>
              <div className="w-px h-12 bg-slate-700"></div>
              <div className="text-center"><div className={`text-4xl font-black ${todayMonitor.avgRate < settings.warnThreshold ? 'text-rose-400' : 'text-emerald-400'}`}>{todayMonitor.avgRate}%</div><div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{t.avgRate}</div></div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
            {todayMonitor.items.length > 0 ? todayMonitor.items.map((item, idx) => {
              const isAlert = item.rate < settings.warnThreshold;
              return (
                <div key={idx} className={`bg-slate-800/50 p-6 rounded-3xl border ${isAlert ? 'border-rose-500/50 bg-rose-900/10' : 'border-slate-700/40'} hover:bg-slate-800 transition-all group`}>
                  <div className="flex justify-between items-center mb-4">
                    <span className={`text-xs px-4 py-1.5 rounded-xl font-black border ${isAlert ? 'bg-rose-600/30 text-rose-300 border-rose-500/20' : 'bg-indigo-600/30 text-indigo-300 border-indigo-500/20'}`}>{item.truckNo}</span>
                    <span className={`text-sm font-black ${isAlert ? 'text-rose-400' : 'text-emerald-400'}`}>{item.endTime ? '✅' : '⏳'} {item.rate}%</span>
                  </div>
                  <div className="text-base font-bold text-slate-100 truncate mb-4">{item.matName}</div>
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono mb-4 bg-slate-900/40 p-3 rounded-xl">
                      <span>{t.arrival}: {item.arrivalTime.split(/\s+/)[1] || item.arrivalTime}</span>
                      <span>{t.departure}: {item.endTime ? (item.endTime.split(/\s+/)[1] || item.endTime) : '--:--'}</span>
                  </div>
                  <div className="h-3 w-full bg-slate-700 rounded-full overflow-hidden shadow-inner">
                    <div className={`h-full ${isAlert ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, (item.totalTime/settings.benchmarkTime)*100)}%` }} />
                  </div>
                </div>
              );
            }) : (
              <div className="md:col-span-2 py-10 text-center text-slate-500 font-black italic border-2 border-dashed border-slate-700 rounded-3xl">
                No entry records for the selected date.
              </div>
            )}
          </div>
        </section>

        <section className="bg-white p-8 rounded-[2rem] border shadow-sm grid grid-cols-1 md:grid-cols-4 gap-8 items-end">
          <div className="md:col-span-2 space-y-3">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{t.selectDate}</label>
            <div className="flex gap-4">
              <input type="date" value={filters.startDate} onChange={e => setFilters(f => ({...f, startDate: e.target.value}))} className="w-full bg-slate-50 border rounded-2xl px-5 py-3.5 font-bold cursor-pointer" />
              <input type="date" value={filters.endDate} onChange={e => setFilters(f => ({...f, endDate: e.target.value}))} className="w-full bg-slate-50 border rounded-2xl px-5 py-3.5 font-bold cursor-pointer" />
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Material</label>
            <input type="text" list="mat-search" placeholder="Select or type..." value={filters.material} onChange={e => setFilters(f => ({...f, material: e.target.value}))} className="w-full bg-slate-50 border rounded-2xl px-5 py-3.5 font-bold" />
            <datalist id="mat-search">
              {materialList.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>
          <button onClick={fetchCSV} className="bg-indigo-600 text-white rounded-2xl py-4 font-black shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 active:scale-95">
            <RefreshCcw className="w-6 h-6" /> {t.update}
          </button>
        </section>

        <div className="grid grid-cols-1 gap-12">
          {[
            { id: 'chart-pareto', title: t.pareto, icon: <LayoutGrid className="text-indigo-600" />, type: settings.chartTypes.pareto, data: paretoData.items, keys: ['tons', 'percentage'], colors: ['#6366f1', '#ef4444'], axisX: 'name', footer: [
              { label: t.statTop10, value: `${paretoData.top10Total}t` },
              { label: t.statRangeTotal, value: `${rangeSummary.totalTons}t` },
              { label: t.statRatio, value: `${rangeSummary.totalTons > 0 ? (paretoData.top10Total/rangeSummary.totalTons*100).toFixed(1) : 0}%`, color: 'text-rose-500' },
              { label: t.statFetchDays, value: rangeSummary.days }
            ]},
            { id: 'chart-tonnage', title: t.tonnage, icon: <TrendingUp className="text-indigo-600" />, type: settings.chartTypes.tonnage, data: timelineData, keys: ['tons'], colors: ['#8b5cf6'], axisX: 'date', footer: [
              { label: t.statRangeTotal, value: `${rangeSummary.totalTons}t` },
              { label: t.statAvgDayWeight, value: `${rangeSummary.avgTonsPerDay}t` },
              { label: t.statTotalEntryUnits, value: rangeSummary.totalCounts },
              { label: t.effTotal, value: `${rangeSummary.avgTotalWorkTimePerDay}m`, color: 'text-amber-600' },
              { label: t.statFetchDays, value: rangeSummary.days }
            ]},
            { id: 'chart-frequency', title: t.frequency, icon: <LayoutGrid className="text-indigo-600" />, type: settings.chartTypes.frequency, data: timelineData, keys: ['counts'], colors: ['#10b981'], axisX: 'date', footer: [
              { label: t.statRangeTotal, value: `${rangeSummary.totalTons}t` },
              { label: t.statAvgDayUnits, value: rangeSummary.avgCountsPerDay },
              { label: t.statTotalEntryUnits, value: rangeSummary.totalCounts },
              { label: t.effTotal, value: `${rangeSummary.avgTotalWorkTimePerDay}m`, color: 'text-amber-600' },
              { label: t.statFetchDays, value: rangeSummary.days }
            ]},
            { id: 'chart-efficiency', title: t.efficiency, icon: <Clock className="text-indigo-600" />, type: settings.chartTypes.efficiency, data: timelineData, keys: [effMode === 'avg' ? 'avgTime' : 'time'], colors: ['#f59e0b'], axisX: 'date', benchmark: effMode === 'avg' ? settings.benchmarkTime : undefined, footer: [
              { label: t.statRangeTotal, value: `${rangeSummary.totalTons}t` },
              { label: t.statAvgWorkTime, value: `${rangeSummary.avgEff}m`, color: 'text-amber-700' },
              { label: t.statTotalEntryUnits, value: rangeSummary.totalCounts },
              { label: t.effTotal, value: `${rangeSummary.avgTotalWorkTimePerDay}m` },
              { label: t.statFetchDays, value: rangeSummary.days }
            ], extra: (
              <select value={effMode} onChange={e => setEffMode(e.target.value as any)} className="text-xs font-bold border rounded-xl p-2 bg-slate-50 outline-none">
                <option value="avg">{t.effAvg}</option><option value="total">{t.effTotal}</option>
              </select>
            )},
            { id: 'chart-flow', title: t.flow, icon: <Zap className="text-indigo-600" />, type: settings.chartTypes.flow, data: flowData.hrs, keys: ['count'], colors: ['#ec4899'], axisX: 'hour', footer: [
              { label: t.statAvgWorkTime, value: `${rangeSummary.avgEff}m`, color: 'text-indigo-700' },
              { label: t.statTimeDist, value: [flowData.amStr, flowData.pmStr] },
              { label: t.statTotalEntryUnits, value: rangeSummary.totalCounts },
              { label: t.effTotal, value: `${rangeSummary.avgTotalWorkTimePerDay}m` },
              { label: t.statFetchDays, value: rangeSummary.days }
            ]}
          ].map((chart) => (
            <div 
              key={chart.id} 
              id={chart.id}
              className="bg-white p-10 rounded-[3rem] border shadow-sm flex flex-col hover:shadow-xl transition-all duration-500 cursor-pointer select-none group/card"
              onDoubleClick={() => copyToClipboard(chart.id)}
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">{chart.icon} {chart.title}</h3>
                <div className="flex items-center gap-4">
                  {chart.extra}
                  <div className="opacity-0 group-hover/card:opacity-100 transition-opacity bg-slate-100 p-2 rounded-lg" title="Double click to copy">
                    <Copy className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              </div>
              <div className="flex-1 w-full" style={{ minHeight: '450px' }}>
                <DynamicChart 
                  type={chart.type} 
                  data={chart.data} 
                  keys={chart.keys} 
                  colors={chart.colors} 
                  axisKeys={{ x: chart.axisX }} 
                  benchmark={chart.benchmark}
                  settings={settings} 
                  dataVersion={combinedVersion} 
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mt-8 pt-8 border-t border-slate-50 bg-slate-50/30 rounded-b-[2rem] px-4 pb-6">
                {chart.footer.map((stat: any, idx) => (
                  <StatBox key={idx} label={stat.label} value={stat.value} colorClass={stat.color} formula={stat.formula} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white w-full max-w-lg rounded-3xl p-10 space-y-8 shadow-2xl relative">
            <div className="flex justify-between items-center border-b pb-4">
              <h3 className="text-xl font-black flex items-center gap-3"><SettingsIcon className="text-indigo-600" /> {t.settings}</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-3xl hover:text-rose-500 transition-colors">&times;</button>
            </div>
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase">自動刷新頻率 (秒)</label><input type="number" value={settings.refreshRate} onChange={e => setSettings(s => ({...s, refreshRate: parseInt(e.target.value)}))} className="w-full bg-slate-50 border rounded-xl p-3 font-bold" /></div>
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <label className="text-xs font-black text-slate-400 uppercase">{t.benchmark}</label>
                    <button onClick={syncBenchmarkToAverage} className="text-[9px] text-indigo-600 font-black flex items-center gap-1 hover:underline">
                      <RefreshCcw className="w-2.5 h-2.5" /> 同步當前平均
                    </button>
                  </div>
                  <input type="number" value={settings.benchmarkTime} onChange={e => setSettings(s => ({...s, benchmarkTime: parseInt(e.target.value)}))} className="w-full bg-slate-50 border rounded-xl p-3 font-bold" />
                  <div className="text-[10px] text-indigo-500 font-bold mt-1">目前區間平均: {rangeSummary.avgEff} m</div>
                </div>
                <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase">動畫循環間隔 (秒)</label><input type="number" value={settings.animationDuration} onChange={e => setSettings(s => ({...s, animationDuration: parseInt(e.target.value)}))} className="w-full bg-slate-50 border rounded-xl p-3 font-bold" /></div>
                <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase">{t.targetHoursLabel}</label><input type="number" value={settings.targetHours} onChange={e => setSettings(s => ({...s, targetHours: parseFloat(e.target.value)}))} className="w-full bg-slate-50 border rounded-xl p-3 font-bold" /></div>
                <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase">{t.threshold}</label><input type="number" value={settings.warnThreshold} onChange={e => setSettings(s => ({...s, warnThreshold: parseInt(e.target.value)}))} className="w-full bg-slate-50 border rounded-xl p-3 font-bold" /></div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">圖表預設類型設定</h4>
                <div className="grid grid-cols-2 gap-4">
                  {(Object.keys(settings.chartTypes) as Array<keyof typeof settings.chartTypes>).map((key) => (
                    <div key={key} className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase">{key}</label>
                      <select 
                        value={settings.chartTypes[key]} 
                        onChange={e => setSettings(s => ({...s, chartTypes: {...s.chartTypes, [key]: e.target.value as any}}))}
                        className="w-full bg-slate-50 border rounded-xl p-2 text-xs font-bold outline-none"
                      >
                        <option value="bar">Bar (長條)</option>
                        <option value="line">Line (折線)</option>
                        <option value="area">Area (面積)</option>
                        <option value="stepAfter">Step (階梯)</option>
                        <option value="radar">Radar (雷達)</option>
                        <option value="composed">Composed (複合)</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border">
                <div className="space-y-0.5"><label className="text-sm font-black">{t.chartAnimation}</label><p className="text-[10px] text-slate-400 font-bold">開啟循環播放與進場特效</p></div>
                <button onClick={() => setSettings(s => ({...s, animationEnabled: !s.animationEnabled}))} className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${settings.animationEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.animationEnabled ? 'translate-x-6' : ''}`} /></button>
              </div>
            </div>
            <button onClick={handleApplySettings} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3">
              <Save className="w-6 h-6" /> {t.save}
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-8">
            <RefreshCcw className="w-20 h-20 text-indigo-600 animate-spin" strokeWidth={3} />
            <span className="text-2xl font-black text-slate-800 animate-pulse tracking-tight">System Syncing...</span>
          </div>
        </div>
      )}
    </div>
  );
};