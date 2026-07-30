const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Tiempos de Cooldown en Minutos (Sincronizado con Python)
const COOLDOWNS = {
  "Borgar_1": 120, "Borgar_2": 120,
  "Vescrya": 420, "Muggron": 180, "Kharzul": 60,
  "Muggron_CW1": 180, "Muggron_CW2": 180,
  "Muggron_BK1": 180, "Muggron_BK2": 180
};

const SERVIDORES = ["Server 1", "Server 2", "Server 3", "Server 20"];

// Estructura de Bosses por Servidor
const BOSS_LIST = {
  "Server 1": ["Borgar_1", "Borgar_2", "Vescrya", "Muggron", "Kharzul"],
  "Server 2": ["Borgar_1", "Borgar_2", "Vescrya", "Muggron", "Kharzul"],
  "Server 3": ["Borgar_1", "Borgar_2", "Vescrya", "Muggron", "Kharzul"],
  "Server 20": ["Vescrya", "Kharzul", "Muggron_CW1", "Muggron_CW2", "Muggron_BK1", "Muggron_BK2"]
};

// Base de datos en memoria
let gameState = {};
let lastHeartbeats = {};

// Inicializar Estado
SERVIDORES.forEach(srv => {
  gameState[srv] = {};
  BOSS_LIST[srv].forEach(boss => {
    gameState[srv][boss] = {
      bossId: boss,
      server: srv,
      lastKillTime: null,
      respawnTime: null
    };
  });
});

// --- RUTA HTTP: Heartbeat del Bot ---
app.post('/api/bot/heartbeat', (req, res) => {
  const { server } = req.body;
  if (server) {
    lastHeartbeats[server] = Date.now();
    io.emit('heartbeat_update', { server, active: true });
  }
  res.status(200).json({ status: "ok" });
});

// --- RUTA HTTP: Registro de Muerte de Boss ---
app.post('/api/boss/kill', (req, res) => {
  const { boss_id, server } = req.body;

  if (!gameState[server] || !gameState[server][boss_id]) {
    return res.status(400).json({ error: "Servidor o Boss inválido" });
  }

  const now = new Date();
  const cdMinutes = COOLDOWNS[boss_id] || 60;
  const respawnTime = new Date(now.getTime() + cdMinutes * 60000);

  gameState[server][boss_id] = {
    bossId: boss_id,
    server: server,
    lastKillTime: now.toISOString(),
    respawnTime: respawnTime.toISOString()
  };

  // Notificar a todos los navegadores conectados en tiempo real
  io.emit('boss_killed', gameState[server][boss_id]);

  console.log(`[KILL] ${boss_id} en ${server} a las ${now.toLocaleTimeString()}`);
  res.status(200).json({ status: "success", data: gameState[server][boss_id] });
});

// --- RUTA HTTP: Obtener estado global ---
app.get('/api/timers', (req, res) => {
  res.json({
    gameState,
    heartbeats: getActiveHeartbeats()
  });
});

function getActiveHeartbeats() {
  const now = Date.now();
  const active = {};
  for (const srv in lastHeartbeats) {
    // Si recibió heartbeat en los últimos 25 segundos se considera activo
    active[srv] = (now - lastHeartbeats[srv]) < 25000;
  }
  return active;
}

// Websockets conexión inicial
io.on('connection', (socket) => {
  socket.emit('init_state', {
    gameState,
    heartbeats: getActiveHeartbeats()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});