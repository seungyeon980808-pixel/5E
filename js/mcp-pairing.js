export const MCP_BRIDGE_PORTS = Object.freeze([8579, 8580, 8581, 8582, 8583]);

export function parseMcpPairingRecord(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    const port = Number(parsed.port);
    const capability = decodeURIComponent(parsed.hash.slice(1));
    if (parsed.protocol !== "mcp-5e:" || parsed.hostname !== "127.0.0.1"
      || parsed.pathname !== "/" || parsed.search || parsed.username || parsed.password
      || !MCP_BRIDGE_PORTS.includes(port) || !/^[A-Za-z0-9_-]{43}$/.test(capability)) return null;
    return { port, capability };
  } catch {
    return null;
  }
}
