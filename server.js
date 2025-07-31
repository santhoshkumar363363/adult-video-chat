const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let waitingUser = null;
let users = new Map();

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  socket.on('join', ({ nickname }) => {
    nickname = String(nickname || '').replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 20);
    users.set(socket.id, { nickname });

    if (waitingUser) {
      const partnerId = waitingUser;
      waitingUser = null;
      io.to(socket.id).emit('partner-found', { partner: partnerId, nickname: users.get(partnerId).nickname });
      io.to(partnerId).emit('partner-found', { partner: socket.id, nickname });
    } else {
      waitingUser = socket.id;
      socket.emit('waiting');
    }
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('report', () => {
    console.log(`User ${socket.id} reported someone.`);
  });

  socket.on('disconnect', () => {
    if (waitingUser === socket.id) waitingUser = null;
    users.delete(socket.id);
    socket.broadcast.emit('partner-disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
