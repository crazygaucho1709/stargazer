import requests
import time

def test_stream():
    url = "http://localhost:5005"
    
    print("Starting stream...")
    r = requests.post(f"{url}/ccd/stream/start")
    print(f"Start response: {r.json()}")
    
    print("Waiting for frames...")
    for i in range(10):
        r = requests.get(f"{url}/debug/indi")
        data = r.json()
        print(f"[{i}] Latest frame size: {data.get('latest_frame_size', 0)}")
        time.sleep(1)
    
    print("Stopping stream...")
    requests.post(f"{url}/ccd/stream/stop")

if __name__ == "__main__":
    test_stream()
