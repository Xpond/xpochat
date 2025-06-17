import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import WebSocket, { WebSocketServer } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

// URL to reach the backend WebSocket – internal DNS in prod, localhost in dev
const BACKEND_WS_URL = process.env.BACKEND_INTERNAL_WS_URL || (dev ? 'ws://localhost:3001' : 'ws://backend.internal:8080');

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  // Shared WebSocket server instance we can accept upgrades with
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    try {
      const { pathname, search } = new URL(req.url || '', `http://${req.headers.host}`);

      // Only handle our proxied path
      if (pathname !== '/ws') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Establish WS connection with client first
      wss.handleUpgrade(req, socket, head, (clientWs) => {
        // Then connect to backend WS using same search params (token, etc.)
        const backendWs = new WebSocket(`${BACKEND_WS_URL}${search}`);

        // Pipe traffic: client → backend
        clientWs.on('message', (data) => {
          if (backendWs.readyState === WebSocket.OPEN) backendWs.send(data);
        });

        // Pipe traffic: backend → client
        backendWs.on('message', (data) => {
          if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
        });

        // Handle close / errors gracefully
        const cleanup = () => {
          try { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(); } catch {}
          try { if (backendWs.readyState === WebSocket.OPEN) backendWs.close(); } catch {}
        };

        clientWs.on('close', cleanup);
        clientWs.on('error', cleanup);
        backendWs.on('close', cleanup);
        backendWs.on('error', cleanup);
      });
    } catch (err) {
      console.error('WebSocket proxy error:', err);
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} [${dev ? 'dev' : 'prod'}]`);
    console.log(`> WS proxy → ${BACKEND_WS_URL}`);
  });
}); 