import re

with open('server/main.py', 'r') as f:
    content = f.read()

# Fix \n to \r\n
content = content.replace('self.sock.sendall((xml + "\\n").encode())', 'self.sock.sendall((xml + "\\r\\n").encode())')

# Fix rate_name
content = content.replace('rate_name = f"SLEW_{rate_val}"', 'rate_name = f"{rate_val}x"')

# Fix mount_jog stop
jog_code_old = """    if req.state == "stop":
        logger.info(f"Jogging {device} -> STOP (ABORT)")
        indi.send(f'<newSwitchVector device="{device}" name="TELESCOPE_ABORT_MOTION"><oneSwitch name="ABORT">On</oneSwitch></newSwitchVector>')
        return {"success": True}

    if req.direction in ["up", "down"]:
        prop = "TELESCOPE_MOTION_NS"
        val_on = "MOTION_NORTH" if req.direction == "up" else "MOTION_SOUTH"
    else:
        prop = "TELESCOPE_MOTION_WE"
        val_on = "MOTION_WEST" if req.direction == "left" else "MOTION_EAST"
    
    xml = f'<newSwitchVector device="{device}" name="{prop}"><oneSwitch name="{val_on}">On</oneSwitch></newSwitchVector>'
    logger.info(f"Jogging {device} {req.direction} -> start")
    indi.send(xml)"""

jog_code_new = """    if req.direction in ["up", "down"]:
        prop = "TELESCOPE_MOTION_NS"
        val_on = "MOTION_NORTH" if req.direction == "up" else "MOTION_SOUTH"
    else:
        prop = "TELESCOPE_MOTION_WE"
        val_on = "MOTION_WEST" if req.direction == "left" else "MOTION_EAST"
    
    if req.state == "stop":
        logger.info(f"Jogging {device} {req.direction} -> STOP")
        indi.send(f'<newSwitchVector device="{device}" name="{prop}"><oneSwitch name="{val_on}">Off</oneSwitch></newSwitchVector>')
        return {"success": True}

    xml = f'<newSwitchVector device="{device}" name="{prop}"><oneSwitch name="{val_on}">On</oneSwitch></newSwitchVector>'
    logger.info(f"Jogging {device} {req.direction} -> start")
    indi.send(xml)"""

content = content.replace(jog_code_old, jog_code_new)

with open('server/main.py', 'w') as f:
    f.write(content)
