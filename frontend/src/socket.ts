import { io } from "socket.io-client";

const configuredUrl = import.meta.env.VITE_SERVER_URL?.trim();
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const SERVER_URL = configuredUrl || (isLocal ? "http://localhost:5000" : window.location.origin);

export const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"],
});
