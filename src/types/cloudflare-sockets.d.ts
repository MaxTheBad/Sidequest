declare module "cloudflare:sockets" {
  type SecureTransport = "off" | "on" | "starttls";

  interface Socket {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<{ localAddress: string | null; remoteAddress: string | null }>;
    closed: Promise<void>;
    close(): Promise<void>;
    startTls(): Socket;
  }

  export function connect(
    address: { hostname: string; port: number } | string,
    options?: { secureTransport?: SecureTransport; allowHalfOpen?: boolean },
  ): Socket;
}
