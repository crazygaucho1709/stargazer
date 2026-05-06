#!/usr/bin/env python3
"""Diagnostic INDI pour Stargazer Backend"""

import socket
import sys
import time

INDI_HOST = "192.168.178.142"
INDI_PORT = 7624

def test_socket_connection():
    """Test 1: Connexion socket brute"""
    print(f"\n[TEST 1] Connexion à {INDI_HOST}:{INDI_PORT}...")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((INDI_HOST, INDI_PORT))
        print("✅ Socket connecté")
        
        # Envoyer getProperties
        sock.sendall(b'<getProperties version="1.7"/>\n')
        print("📤 Sent: <getProperties/>")
        
        # Recevoir réponse
        data = sock.recv(8192)
        if b'device=' in data:
            print(f"✅ Réponse INDI reçue ({len(data)} bytes)")
            # Chercher les devices
            import re
            devices = re.findall(rb'device="([^"]+)"', data)
            print(f"   Devices trouvés: {set(devices)}")
            return True
        else:
            print(f"⚠️ Réponse inattendue: {data[:200]}")
            return False
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return False
    finally:
        sock.close()

def test_mount_command():
    """Test 2: Envoyer commande mouvement"""
    print(f"\n[TEST 2] Test commande monture...")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((INDI_HOST, INDI_PORT))
        
        # S'assurer d'abord que CONNECT est ON
        sock.sendall(b'<newSwitchVector device="Celestron GPS" name="CONNECTION"><oneSwitch name="CONNECT">On</oneSwitch></newSwitchVector>\n')
        time.sleep(0.5)
        
        # Commande NORTH
        cmd = b'<newSwitchVector device="Celestron GPS" name="TELESCOPE_MOTION_NS"><oneSwitch name="MOTION_NORTH">On</oneSwitch></newSwitchVector>\n'
        sock.sendall(cmd)
        print("📤 Sent: MOTION_NORTH=On")
        
        time.sleep(1)  # Bouger pendant 1 seconde
        
        # Stop
        cmd_off = b'<newSwitchVector device="Celestron GPS" name="TELESCOPE_MOTION_NS"><oneSwitch name="MOTION_NORTH">Off</oneSwitch></newSwitchVector>\n'
        sock.sendall(cmd_off)
        print("📤 Sent: MOTION_NORTH=Off")
        
        # Vérifier réponse
        sock.settimeout(2)
        try:
            data = sock.recv(4096)
            print(f"✅ Réponse reçue: {len(data)} bytes")
        except socket.timeout:
            print("⚠️ Pas de réponse (timeout) - mais la commande a peut-être fonctionné")
        
        print("✅ Test terminé - la monture a dû bouger pendant 1 seconde")
        return True
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return False
    finally:
        sock.close()

def test_ccd_command():
    """Test 3: Commande capture Canon"""
    print(f"\n[TEST 3] Test commande Canon...")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((INDI_HOST, INDI_PORT))
        
        # Activer BLOB
        sock.sendall(b'<enableBLOB device="Canon DSLR EOS 600D">Also</enableBLOB>\n')
        time.sleep(0.5)
        
        # Upload mode
        sock.sendall(b'<newSwitchVector device="Canon DSLR EOS 600D" name="UPLOAD_MODE"><oneSwitch name="UPLOAD_CLIENT">On</oneSwitch></newSwitchVector>\n')
        time.sleep(0.5)
        
        # Capture 0.5s
        sock.sendall(b'<newNumberVector device="Canon DSLR EOS 600D" name="CCD_EXPOSURE"><oneNumber name="CCD_EXPOSURE_VALUE">0.5</oneNumber></newNumberVector>\n')
        print("📤 Sent: CCD_EXPOSURE=0.5s")
        
        # Attendre réponse
        sock.settimeout(10)
        start = time.time()
        while time.time() - start < 10:
            try:
                data = sock.recv(65536)
                if b"oneBLOB" in data:
                    print("✅ Image reçue! (BLOB détecté)")
                    return True
            except socket.timeout:
                break
        
        print("⚠️ Pas d'image reçue dans les 10s")
        return False
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return False
    finally:
        sock.close()

if __name__ == "__main__":
    print("="*60)
    print("DIAGNOSTIC INDI - Stargazer Backend")
    print("="*60)
    
    results = []
    results.append(("Socket Connection", test_socket_connection()))
    results.append(("Mount Command", test_mount_command()))
    results.append(("CCD Capture", test_ccd_command()))
    
    print("\n" + "="*60)
    print("RÉSULTATS:")
    for name, ok in results:
        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"  {name}: {status}")
    print("="*60)
