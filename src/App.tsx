import React, { useState, useEffect, useMemo } from 'react';
import { 
  Flame, 
  Wind, 
  Thermometer, 
  AlertTriangle, 
  Activity, 
  ShieldAlert, 
  Clock,
  LayoutDashboard,
  Bell,
  Settings,
  Menu,
  X,
  Play,
  Pause,
  Moon,
  Sun,
  Zap
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Priority, SensorData, UpdatePayload } from './types';

const PRIORITY_COLORS = {
  HIGH: 'text-red-500 bg-red-500/10 border-red-500/20',
  MEDIUM: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  LOW: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
};

const PRIORITY_GLOW = {
  HIGH: 'shadow-[0_0_20px_rgba(239,68,68,0.3)]',
  MEDIUM: 'shadow-[0_0_20px_rgba(249,115,22,0.3)]',
  LOW: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]',
};

export default function App() {
  const [data, setData] = useState<UpdatePayload | null>(null);
  const [history, setHistory] = useState<UpdatePayload[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [externalApiUrl, setExternalApiUrl] = useState('');
  const [isPolling, setIsPolling] = useState(false);

  // Audio Context Ref to reuse
  const audioContextRef = React.useRef<AudioContext | null>(null);

  // Audio Beep function
  const playBeep = () => {
    if (isMuted) return;
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.1);
    } catch (err) {
      console.error('Audio playback failed:', err);
    }
  };

  // Continuous Alert Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const hasHighPriority = data?.sensors.some(s => s.priority === 'HIGH');

    if (hasHighPriority && !isMuted) {
      // Play initial beep immediately
      playBeep();
      // Then repeat every 800ms for a "continuous" feel
      interval = setInterval(playBeep, 800);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [data?.sensors, isMuted]);

  // Polling Effect (Step 5 Integration)
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchSensorData = async () => {
      if (!externalApiUrl) return;
      try {
        const response = await fetch(externalApiUrl);
        const polledData = await response.json();
        
        // Map external data to our format if necessary
        // Assuming the external API returns our UpdatePayload format
        // Or a simple { gas, temp, flame } object as per user request
        if (polledData.sensors) {
          setData(polledData);
          setHistory(prev => [...prev.slice(-19), polledData]);
        } else if (polledData.gas !== undefined) {
          // Handle the simple format from user's Step 5 request
          const timestamp = new Date().toISOString();
          const mappedData: UpdatePayload = {
            timestamp,
            sensors: [
              { name: 'Flame Sensor', type: 'flame', value: polledData.flame, threshold: 1, priority: polledData.flame === 1 ? 'HIGH' : 'LOW' },
              { name: 'Gas Sensor', type: 'gas', value: polledData.gas, threshold: 350, priority: polledData.gas > 350 ? 'HIGH' : polledData.gas > 200 ? 'MEDIUM' : 'LOW' },
              { name: 'Temperature Sensor', type: 'temp', value: polledData.temp, threshold: 60, priority: polledData.temp > 60 ? 'HIGH' : polledData.temp > 40 ? 'MEDIUM' : 'LOW' },
            ]
          };
          setData(mappedData);
          setHistory(prev => [...prev.slice(-19), mappedData]);
        }
      } catch (err) {
        console.error('Failed to fetch from external API:', err);
      }
    };

    if (isPolling && externalApiUrl) {
      fetchSensorData();
      interval = setInterval(fetchSensorData, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPolling, externalApiUrl]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    let socket: WebSocket;

    const connect = () => {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setIsConnected(true);
        console.log('Connected to WebSocket');
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'SENSOR_UPDATE') {
          const newData = message.data as UpdatePayload;
          setData(newData);
          setHistory(prev => [...prev.slice(-19), newData]);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        setTimeout(connect, 3000);
      };
    };

    connect();
    
    // Initial history fetch
    fetch('/api/history')
      .then(res => res.json())
      .then(setHistory);

    fetch('/api/simulation/status')
      .then(res => res.json())
      .then(data => setIsSimulating(data.running));

    return () => socket?.close();
  }, []);

  const toggleSimulation = async () => {
    const newState = !isSimulating;
    try {
      await fetch('/api/simulation/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ running: newState })
      });
      setIsSimulating(newState);
    } catch (err) {
      console.error('Failed to toggle simulation', err);
    }
  };

  const handleManualOverride = async (type: string, value: number) => {
    try {
      await fetch('/api/sensor-data/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [type]: value })
      });
    } catch (err) {
      console.error('Failed to send override', err);
    }
  };

  const sortedSensors = useMemo(() => {
    if (!data) return [];
    return [...data.sensors].sort((a, b) => {
      const priorityMap = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityMap[a.priority] - priorityMap[b.priority];
    });
  }, [data]);

  const chartData = useMemo(() => {
    return history.map(h => ({
      time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      gas: h.sensors.find(s => s.type === 'gas')?.value || 0,
      temp: h.sensors.find(s => s.type === 'temp')?.value || 0,
    }));
  }, [history]);

  const highPriorityAlerts = data?.sensors.filter(s => s.priority === 'HIGH') || [];

  const getAlertMessage = (sensor: SensorData) => {
    if (sensor.type === 'flame') return '🔥 FIRE DETECTED';
    if (sensor.type === 'gas') return '💨 GAS LEVEL CRITICAL';
    if (sensor.type === 'temp') return '🌡 TEMPERATURE CRITICAL';
    return 'CRITICAL EVENT DETECTED';
  };

  const themeClasses = isDarkMode 
    ? 'bg-[#0A0A0B] text-slate-200 border-white/5 bg-white/5' 
    : 'bg-slate-50 text-slate-900 border-slate-200 bg-white';

  return (
    <div className={`min-h-screen transition-colors duration-500 ${isDarkMode ? 'bg-[#0A0A0B] text-slate-200' : 'bg-slate-50 text-slate-900'} font-sans selection:bg-indigo-500/30`}>
      {/* Top Navigation */}
      <header className={`h-16 border-b ${isDarkMode ? 'border-white/5 bg-[#0A0A0B]/80' : 'border-slate-200 bg-white/80'} backdrop-blur-md sticky top-0 z-50 px-6 flex items-center justify-between`}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight hidden sm:block">
              IIoT Traffic Slicing <span className={`${isDarkMode ? 'text-slate-500' : 'text-slate-500'} font-normal`}>Control Center</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-200'}`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs font-medium uppercase tracking-wider opacity-70">
              {isConnected ? 'System Live' : 'Offline'}
            </span>
          </div>
          
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`p-2 rounded-lg transition-colors relative ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100'} ${highPriorityAlerts.length > 0 && !isMuted ? 'text-red-500 animate-pulse' : ''}`}
            title={isMuted ? "Unmute Alarm" : "Mute Alarm"}
          >
            {isMuted ? <Zap className="w-5 h-5 opacity-40" /> : <Bell className="w-5 h-5" />}
            {highPriorityAlerts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-50 rounded-full" />
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-col">
        {/* Main Content */}
        <main className="flex-1 p-6 space-y-8 overflow-x-hidden max-w-7xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Controls Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className={`lg:col-span-1 p-6 rounded-2xl border ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'} space-y-6`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`text-sm font-bold uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>Simulation Control</h3>
                      <button 
                        onClick={toggleSimulation}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                          isSimulating 
                            ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                            : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        }`}
                      >
                        {isSimulating ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        {isSimulating ? 'Stop Simulation' : 'Start Simulation'}
                      </button>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold uppercase tracking-wider opacity-60">Gas Level (ppm)</label>
                          <span className="text-xs font-mono font-bold">{data?.sensors.find(s => s.type === 'gas')?.value || 0}</span>
                        </div>
                        <input 
                          type="range" min="50" max="500" 
                          disabled={!isSimulating}
                          value={data?.sensors.find(s => s.type === 'gas')?.value || 150}
                          onChange={(e) => handleManualOverride('gas', parseInt(e.target.value))}
                          className={`w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500 ${!isSimulating ? 'opacity-30 cursor-not-allowed' : ''}`}
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold uppercase tracking-wider opacity-60">Temperature (°C)</label>
                          <span className="text-xs font-mono font-bold">{data?.sensors.find(s => s.type === 'temp')?.value || 0}</span>
                        </div>
                        <input 
                          type="range" min="20" max="80" 
                          disabled={!isSimulating}
                          value={data?.sensors.find(s => s.type === 'temp')?.value || 25}
                          onChange={(e) => handleManualOverride('temp', parseInt(e.target.value))}
                          className={`w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500 ${!isSimulating ? 'opacity-30 cursor-not-allowed' : ''}`}
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-xl bg-black/5 border border-white/5">
                        <div className="flex items-center gap-3">
                          <Flame className={`w-5 h-5 ${data?.sensors.find(s => s.type === 'flame')?.value === 1 ? 'text-red-500' : 'opacity-30'}`} />
                          <span className="text-xs font-bold uppercase tracking-wider">Flame Detection</span>
                        </div>
                        <button 
                          disabled={!isSimulating}
                          onClick={() => handleManualOverride('flame', data?.sensors.find(s => s.type === 'flame')?.value === 1 ? 0 : 1)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            data?.sensors.find(s => s.type === 'flame')?.value === 1 
                              ? 'bg-red-500 text-white' 
                              : 'bg-slate-500/10 text-slate-500'
                          } ${!isSimulating ? 'opacity-30 cursor-not-allowed' : ''}`}
                        >
                          {data?.sensors.find(s => s.type === 'flame')?.value === 1 ? 'Disable Fire' : 'Trigger Fire'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-1 p-6 rounded-2xl border ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'} space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className={`text-sm font-bold uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>Hardware Integration</h3>
                      <div className={`w-2 h-2 rounded-full ${isPolling ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">External API URL (Step 5)</label>
                        <input 
                          type="text"
                          placeholder="https://script.google.com/..."
                          value={externalApiUrl}
                          onChange={(e) => setExternalApiUrl(e.target.value)}
                          className={`w-full px-3 py-2 rounded-lg border text-xs font-mono ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                        />
                      </div>

                      <button 
                        onClick={() => setIsPolling(!isPolling)}
                        className={`w-full py-2 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                          isPolling 
                            ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                            : 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20'
                        }`}
                      >
                        {isPolling ? 'Stop Polling' : 'Start Polling'}
                      </button>

                      <p className={`text-[10px] leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Use this to fetch data from an external source like Google Apps Script. 
                        Alternatively, use the <b>send_to_dashboard.py</b> script to push data directly to this dashboard.
                      </p>
                    </div>
                  </div>

                  <div className="lg:col-span-1 space-y-6">
                    {/* Real-time Alerts Banner */}
                    <AnimatePresence>
                      {highPriorityAlerts.length > 0 && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center shrink-0 animate-pulse">
                              <AlertTriangle className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                              <h2 className="text-red-500 font-bold text-lg uppercase tracking-tight">Critical Event Detected</h2>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {highPriorityAlerts.map(sensor => (
                                  <span key={sensor.type} className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-black rounded uppercase tracking-widest">
                                    {getAlertMessage(sensor)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Traffic Priority Queue */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className={`text-sm font-semibold uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>Traffic Priority Queue</h3>
                        <span className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full uppercase">SDN Controller</span>
                      </div>
                      <div className={`border rounded-2xl p-4 overflow-hidden space-y-6 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        {(['HIGH', 'MEDIUM', 'LOW'] as Priority[]).map((p) => {
                          const sensorsInPriority = data?.sensors.filter(s => s.priority === p) || [];
                          if (sensorsInPriority.length === 0) return null;
                          
                          return (
                            <div key={p} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-1 h-3 rounded-full ${p === 'HIGH' ? 'bg-red-500' : p === 'MEDIUM' ? 'bg-orange-500' : 'bg-emerald-500'}`} />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${p === 'HIGH' ? 'text-red-500' : p === 'MEDIUM' ? 'text-orange-500' : 'text-emerald-500'}`}>
                                  {p} Priority Slice
                                </span>
                              </div>
                              <div className="space-y-2">
                                {sensorsInPriority.map((sensor) => (
                                  <motion.div
                                    layout
                                    key={sensor.type}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-500 ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center">
                                        {sensor.type === 'flame' && <Flame className="w-4 h-4 text-red-400" />}
                                        {sensor.type === 'gas' && <Wind className="w-4 h-4 text-orange-400" />}
                                        {sensor.type === 'temp' && <Thermometer className="w-4 h-4 text-emerald-400" />}
                                      </div>
                                      <div>
                                        <div className="text-xs font-bold">{sensor.name}</div>
                                        <div className="text-[10px] opacity-40 uppercase tracking-wider">ID: {sensor.type.toUpperCase()}</div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-[10px] font-mono opacity-60">{sensor.value}{sensor.type === 'temp' ? '°C' : sensor.type === 'gas' ? 'ppm' : ''}</div>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {!data && (
                          <div className="p-8 text-center text-slate-500 text-sm italic">Waiting for sensor data...</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sensor Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {data?.sensors.map((sensor: SensorData) => (
                    <SensorCard key={sensor.type} sensor={sensor} isDarkMode={isDarkMode} />
                  ))}
                  {!data && [1, 2, 3].map(i => (
                    <div key={i} className={`h-48 rounded-2xl animate-pulse ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-white border border-slate-200'}`} />
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-8">
                  {/* Live Data Charts */}
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <ChartContainer title="Gas Level History (ppm)" color="#F97316" isDarkMode={isDarkMode}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="colorGas" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#F97316" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#F97316" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#ffffff05" : "#00000005"} vertical={false} />
                            <XAxis dataKey="time" stroke={isDarkMode ? "#ffffff20" : "#00000020"} fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke={isDarkMode ? "#ffffff20" : "#00000020"} fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: isDarkMode ? '#1A1A1C' : '#FFFFFF', border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '12px' }}
                              itemStyle={{ color: '#F97316' }}
                            />
                            <Area type="monotone" dataKey="gas" stroke="#F97316" strokeWidth={2} fillOpacity={1} fill="url(#colorGas)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </ChartContainer>

                      <ChartContainer title="Temperature History (°C)" color="#EF4444" isDarkMode={isDarkMode}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#ffffff05" : "#00000005"} vertical={false} />
                            <XAxis dataKey="time" stroke={isDarkMode ? "#ffffff20" : "#00000020"} fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke={isDarkMode ? "#ffffff20" : "#00000020"} fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: isDarkMode ? '#1A1A1C' : '#FFFFFF', border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '12px' }}
                              itemStyle={{ color: '#EF4444' }}
                            />
                            <Area type="monotone" dataKey="temp" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#colorTemp)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            </main>
          </div>
        </div>
      );
    }

const SensorCard: React.FC<{ sensor: SensorData, isDarkMode: boolean }> = ({ sensor, isDarkMode }) => {
  const Icon = sensor.type === 'flame' ? Flame : sensor.type === 'gas' ? Wind : Thermometer;
  const unit = sensor.type === 'flame' ? '' : sensor.type === 'gas' ? ' ppm' : '°C';
  
  return (
    <motion.div 
      layout
      className={`border rounded-2xl p-6 relative overflow-hidden transition-all duration-500 ${
        isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'
      } ${
        sensor.priority === 'HIGH' ? 'ring-2 ring-red-500 ring-inset shadow-[0_0_30px_rgba(239,68,68,0.2)]' : ''
      }`}
    >
      {sensor.priority === 'HIGH' && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.2, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 bg-red-500 pointer-events-none" 
        />
      )}
      
      <div className="flex items-start justify-between mb-6">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${PRIORITY_COLORS[sensor.priority]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className={`text-[10px] font-black px-2 py-1 rounded-md border uppercase tracking-widest ${PRIORITY_COLORS[sensor.priority]}`}>
          {sensor.priority}
        </div>
      </div>

      <div className="space-y-1">
        <h4 className={`${isDarkMode ? 'text-slate-500' : 'text-slate-600'} text-xs font-semibold uppercase tracking-wider`}>{sensor.name}</h4>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tighter">
            {sensor.type === 'flame' ? (sensor.value === 1 ? 'DETECTED' : 'CLEAR') : sensor.value}
          </span>
          <span className={`${isDarkMode ? 'text-slate-500' : 'text-slate-600'} text-sm font-medium`}>{unit}</span>
        </div>
      </div>

      <div className={`mt-6 pt-6 border-t ${isDarkMode ? 'border-white/5' : 'border-slate-100'} flex items-center justify-between`}>
        <div className="space-y-1">
          <div className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-600'} uppercase font-bold tracking-widest`}>Threshold</div>
          <div className="text-xs font-mono">{sensor.threshold}{unit}</div>
        </div>
        <div className="text-right space-y-1">
          <div className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-600'} uppercase font-bold tracking-widest`}>Status</div>
          <div className={`text-xs font-bold ${sensor.priority === 'HIGH' ? 'text-red-500' : sensor.priority === 'MEDIUM' ? 'text-orange-500' : 'text-emerald-500'}`}>
            {sensor.priority === 'HIGH' ? 'CRITICAL EVENT DETECTED' : sensor.priority === 'MEDIUM' ? 'WARNING' : 'NOMINAL'}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ChartContainer({ title, children, color, isDarkMode }: { title: string, children: React.ReactNode, color: string, isDarkMode: boolean }) {
  return (
    <div className={`border rounded-2xl p-6 space-y-4 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
      <div className="flex items-center justify-between">
        <h3 className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>{title}</h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className={`text-[10px] uppercase font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>Real-time</span>
        </div>
      </div>
      <div className="h-64 w-full">
        {children}
      </div>
    </div>
  );
}
