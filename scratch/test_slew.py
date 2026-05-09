
import requests
import json

def test_slew():
    url = "http://127.0.0.1:5005/mount/slew"
    data = {
        "ra": 180.0,
        "dec": 45.0,
        "device": "Celestron GPS"
    }
    response = requests.post(url, json=data)
    print(response.json())

if __name__ == "__main__":
    test_slew()
