const express = require('express');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Security Middleware
app.use(helmet()); // Secure HTTP headers
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100 // max 100 requests per minute
});
app.use(limiter);

// In-memory tracking
let waitingUser = null;
let users = new Map();
let reportCounts = {};
let bannedIPs = new Set();

// Clean and limit nickname input
function cleanNickname(nick) {
  return String(nick || '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .substring(0, 20);
}

io.on('connection', (socket) => {
  const ip = socket.handshake.address;

  // Block banned users
  if (bannedIPs.has(ip)) {
    socket.disconnect();
    return;
  }

  // Handle new user joining
  socket.on('join', ({ nickname }) => {
    nickname = cleanNickname(nickname);
    users.set(socket.id, { nickname, ip });

    if (waitingUser && waitingUser !== socket.id && !bannedIPs.has(users.get(waitingUser).ip)) {
      const partnerId = waitingUser;
      waitingUser = null;

      io.to(socket.id).emit('partner-found', {
        partner: partnerId,
        nickname: users.get(partnerId).nickname
      });

      io.to(partnerId).emit('partner-found', {
        partner: socket.id,
        nickname
      });
    } else {
      waitingUser = socket.id;
    }
  });

  // Forward WebRTC signaling data
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // Handle reports
  socket.on('report', () => {
    if (!reportCounts[ip]) reportCounts[ip] = 0;
    reportCounts[ip]++;

    if (reportCounts[ip] >= 3) {
      bannedIPs.add(ip);
      console.log(`🚫 IP ${ip} has been banned after 3 reports.`);
    }
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    if (waitingUser === socket.id) {
      waitingUser = null;
    }
    users.delete(socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
