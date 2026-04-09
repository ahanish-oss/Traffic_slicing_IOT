import serial
import requests
import json
import time

# ==========================================
# STEP 4: Run Python Serial Bridge (Laptop)
# ==========================================
# 1. Install libraries: pip install pyserial requests
# 2. Update PORT to match your Arduino/ESP32 port (e.g., "COM3" or "/dev/ttyUSB0")
# 3. Run: python send_to_dashboard.py

# Change COM port to match your device
PORT = "COM3"   # Windows example
# PORT = "/dev/ttyUSB0"  # Linux/Mac example

BAUD = 9600

# This is your AI Studio Dashboard API URL
# Data sent here will update the dashboard in real-time via WebSockets
DASHBOARD_URL = "https://ais-dev-qsymkzcxtrinlnavce7inx-209738211311.asia-east1.run.app/api/sensor-data"

print(f"Initializing Serial Bridge on {PORT}...")

try:
    ser = serial.Serial(PORT, BAUD, timeout=1)
    print(f"Successfully connected to {PORT}")
except Exception as e:
    print(f"ERROR: Could not open serial port {PORT}. Check your connection and port name.")
    print(f"Details: {e}")
    exit()

print("Reading Arduino data... Press Ctrl+C to stop.")

while True:
    try:
        # Read a line from serial
        line = ser.readline().decode("utf-8").strip()

        # Check if it looks like JSON
        if line.startswith("{") and line.endswith("}"):
            try:
                data = json.loads(line)
                print(f"Sending to Dashboard: {data}")

                # Send data to the dashboard API
                response = requests.post(DASHBOARD_URL, json=data, timeout=5)
                
                if response.status_code == 200:
                    print(f"Success! Dashboard updated. Response: {response.text}")
                else:
                    print(f"Warning: Dashboard returned status {response.status_code}")

            except json.JSONDecodeError:
                print(f"Skipping invalid JSON: {line}")
            except requests.exceptions.RequestException as e:
                print(f"Network Error: Could not reach dashboard. {e}")
        
        time.sleep(0.1) # Small delay to prevent CPU hogging
        
    except KeyboardInterrupt:
        print("\nStopping Serial Bridge...")
        ser.close()
        break
    except Exception as e:
        print(f"Unexpected error: {e}")
        time.sleep(1)
