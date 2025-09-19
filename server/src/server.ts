import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import app from "./app.js";
import { socketAuthMiddleware, handleSocketConnection, setSocketIOInstance } from "./services/socketService.js";

// Load environment variables
dotenv.config();

const server = http.createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

const io = new Server(server, {
  cors: { 
    origin: "*", 
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 50 * 1024 * 1024, 
});

// Socket authentication middleware
io.use(socketAuthMiddleware(JWT_SECRET));

// Set the Socket.IO instance for use in controllers
setSocketIOInstance(io);

// Initialize socket connection handler
io.on("connection", (socket) => {
  handleSocketConnection(io, socket);
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});
