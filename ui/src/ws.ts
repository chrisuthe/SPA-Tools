type MessageHandler = (data: unknown) => void;

export class WS {
  private socket: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(path: string) {
    this.url = `ws://127.0.0.1:8384${path}`;
  }

  connect() {
    this.socket = new WebSocket(this.url);
    this.socket.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      this.handlers.forEach((h) => h(data));
    };
    this.socket.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  send(data: unknown) {
    this.socket?.send(JSON.stringify(data));
  }
}
