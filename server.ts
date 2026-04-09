import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import path from 'path';

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Thresholds based on system requirements
  const THRESHOLDS = {
    flame: 1, // 1 = fire detected (HIGH)
    gas: {
      high: 350,
      medium: 200
    },
    temp: {
      high: 60,
      medium: 40
    }
  };

  // Store latest data
  let sensorHistory: any[] = [];
  let isSimulationRunning = false;
  let currentSensorValues = {
    flame: 0,
    gas: 150,
    temp: 25
  };

  const calculatePriority = (type: string, value: number) => {
    if (type === 'flame') {
      return value >= THRESHOLDS.flame ? 'HIGH' : 'LOW';
    }
    if (type === 'gas') {
      if (value > THRESHOLDS.gas.high) return 'HIGH';
      if (value >= THRESHOLDS.gas.medium) return 'MEDIUM';
      return 'LOW';
    }
    if (type === 'temp') {
      if (value > THRESHOLDS.temp.high) return 'HIGH';
      if (value >= THRESHOLDS.temp.medium) return 'MEDIUM';
      return 'LOW';
    }
    return 'LOW';
  };

  const getThresholdValue = (type: string) => {
    if (type === 'flame') return THRESHOLDS.flame;
    if (type === 'gas') return THRESHOLDS.gas.high;
    if (type === 'temp') return THRESHOLDS.temp.high;
    return 0;
  };

  const broadcastData = (flame: number, gas: number, temp: number) => {
    const timestamp = new Date().toISOString();
    const data = {
      timestamp,
      sensors: [
        { name: 'Flame Sensor', type: 'flame', value: flame, threshold: getThresholdValue('flame'), priority: calculatePriority('flame', flame) },
        { name: 'Gas Sensor', type: 'gas', value: gas, threshold: getThresholdValue('gas'), priority: calculatePriority('gas', gas) },
        { name: 'Temperature Sensor', type: 'temp', value: temp, threshold: getThresholdValue('temp'), priority: calculatePriority('temp', temp) },
      ]
    };

    sensorHistory.push(data);
    if (sensorHistory.length > 50) sensorHistory.shift();

    // Broadcast to all WS clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'SENSOR_UPDATE', data }));
      }
    });

    return data;
  };

  // Simulation Layer
  setInterval(() => {
    if (!isSimulationRunning) return;

    // Randomly fluctuate values
    currentSensorValues.gas += Math.floor(Math.random() * 40) - 15;
    currentSensorValues.temp += (Math.random() * 2) - 0.8;
    
    // Occasionally trigger high priority for testing
    if (Math.random() > 0.98) {
      currentSensorValues.flame = currentSensorValues.flame === 0 ? 1 : 0;
    }
    
    // Keep values in reasonable range
    currentSensorValues.gas = Math.max(50, Math.min(500, currentSensorValues.gas));
    currentSensorValues.temp = Math.max(20, Math.min(80, currentSensorValues.temp));

    broadcastData(currentSensorValues.flame, Math.round(currentSensorValues.gas), parseFloat(currentSensorValues.temp.toFixed(1)));
  }, 2000);

  // API Route to toggle simulation
  app.post('/api/simulation/toggle', (req, res) => {
    const { running } = req.body;
    isSimulationRunning = running;
    
    // Reset to normal values when stopped
    if (!running) {
      currentSensorValues = {
        flame: 0,
        gas: 150,
        temp: 25
      };
      broadcastData(currentSensorValues.flame, currentSensorValues.gas, currentSensorValues.temp);
    }
    
    res.json({ status: 'success', isSimulationRunning });
  });

  app.get('/api/simulation/status', (req, res) => {
    res.json({ running: isSimulationRunning });
  });

  // API Route for manual override
  app.post('/api/sensor-data/override', (req, res) => {
    const { flame, gas, temp } = req.body;
    
    if (flame !== undefined) currentSensorValues.flame = flame;
    if (gas !== undefined) currentSensorValues.gas = gas;
    if (temp !== undefined) currentSensorValues.temp = temp;

    const data = broadcastData(currentSensorValues.flame, currentSensorValues.gas, currentSensorValues.temp);
    res.json({ status: 'success', data });
  });

  // API Route to get latest sensor data (for polling)
  app.get('/api/sensor-data', (req, res) => {
    const data = {
      timestamp: new Date().toISOString(),
      sensors: [
        { name: 'Flame Sensor', type: 'flame', value: currentSensorValues.flame, threshold: getThresholdValue('flame'), priority: calculatePriority('flame', currentSensorValues.flame) },
        { name: 'Gas Sensor', type: 'gas', value: currentSensorValues.gas, threshold: getThresholdValue('gas'), priority: calculatePriority('gas', currentSensorValues.gas) },
        { name: 'Temperature Sensor', type: 'temp', value: currentSensorValues.temp, threshold: getThresholdValue('temp'), priority: calculatePriority('temp', currentSensorValues.temp) },
      ]
    };
    res.json(data);
  });

  // API Route for ESP32 to send data
  app.post('/api/sensor-data', (req, res) => {
    const { flame, gas, temp } = req.body;
    
    if (flame !== undefined) currentSensorValues.flame = flame;
    if (gas !== undefined) currentSensorValues.gas = gas;
    if (temp !== undefined) currentSensorValues.temp = temp;

    const data = broadcastData(currentSensorValues.flame, currentSensorValues.gas, currentSensorValues.temp);

    res.status(200).json({ status: 'success', priority: data.sensors.map(s => s.priority) });
  });

  app.get('/api/history', (req, res) => {
    res.json(sensorHistory);
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
