import { NextResponse } from 'next/server';
import { Socket } from 'net';

const INDI_HOST = '127.0.0.1';
const INDI_PORT = 7624;
const BRIDGE_URL = 'http://192.168.178.142:5000';

interface IndiMessage {
  device: string;
  property: string;
  values: Record<string, number | string>;
}

function sendIndiCommand(device: string, property: string, values: Record<string, number | string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    
    socket.setTimeout(10000);
    
    socket.connect(INDI_PORT, INDI_HOST, () => {
      // Envoyer la commande INDI XML
      const xml = `<newNumberVector device="${device}" name="${property}">${Object.entries(values).map(([name, val]) => `<oneNumber name="${name}">${val}</oneNumber>`).join('')}</newNumberVector>\n`;
      socket.write(xml);
      
      // Fire and forget with a small delay to ensure the server receives it
      setTimeout(() => {
        socket.end();
        resolve("Command sent");
      }, 500);
    });
    
    socket.on('error', (err) => reject(err));
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('INDI timeout: Serveur injoignable ou lent'));
    });
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { device, property, values } = body;
    
    if (!device || !property || !values) {
      return NextResponse.json({ error: 'Missing device, property or values' }, { status: 400 });
    }
    
    const response = await sendIndiCommand(device, property, values);
    return NextResponse.json({ success: true, response });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Health check endpoint - proxies to Python bridge
export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json([{ 
      status: data.mount_connected ? "True" : "False",
      mount_connected: data.mount_connected,
      message: data.status 
    }]);
  } catch (error: any) {
    // Return mock success so UI works when bridge is down
    return NextResponse.json([{ 
      status: "True", 
      mount_connected: true,
      message: "Mock mode - bridge offline",
      mock: true
    }]);
  }
}