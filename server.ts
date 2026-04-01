import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

// --- Game Logic Types ---

type CompanyId = 'tech' | 'pharma' | 'fmcg' | 'auto' | 'banking' | 'energy';

interface Card {
  id: string;
  type: 'standard' | 'special';
  companyId?: CompanyId;
  value?: number; // for standard
  effect?: 'market_crash' | 'bull_run' | 'audit'; // for special
  description: string;
}

interface Player {
  id: string;
  name: string;
  cash: number;
  portfolio: Record<CompanyId, number>;
  cards: Card[];
  turnsTaken: number;
  isHost: boolean;
}

interface GameState {
  roomId: string;
  players: Player[];
  companies: Record<CompanyId, number>;
  marketPool: Card[];
  currentRound: number;
  currentPlayerIndex: number;
  status: 'lobby' | 'playing' | 'finished';
}

// --- Constants ---

const COMPANIES: CompanyId[] = ['tech', 'pharma', 'fmcg', 'auto', 'banking', 'energy'];
const STARTING_PRICES: Record<CompanyId, number> = {
  tech: 150,
  pharma: 120,
  fmcg: 100,
  auto: 80,
  banking: 60,
  energy: 40
};
const VALID_BATCH_SIZES = [100, 250, 500, 1000];
const STARTING_CASH = 1000000;
const MAX_ROUNDS = 4;
const TURNS_PER_ROUND = 3;
const CARDS_PER_PLAYER = 7;

// --- Server Setup ---

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    allowEIO3: true // Compatibility for older clients if needed
  });

  const games: Record<string, GameState> = {};

  // --- Helper Functions ---

  function generateCards(): Card[] {
    const cards: Card[] = [];
    // Standard cards
    COMPANIES.forEach(company => {
      for (let i = 0; i < 5; i++) {
        const val = (Math.floor(Math.random() * 10) + 5) * (Math.random() > 0.5 ? 1 : -1);
        cards.push({
          id: Math.random().toString(36).substr(2, 9),
          type: 'standard',
          companyId: company,
          value: val,
          description: `${company.toUpperCase()}: ${val > 0 ? '+' : ''}₹${val}`
        });
      }
    });
    // Special cards
    for (let i = 0; i < 5; i++) {
      cards.push({
        id: Math.random().toString(36).substr(2, 9),
        type: 'special',
        effect: 'bull_run',
        description: "Bull Run: All stocks up 10%"
      });
      const auditCompany = COMPANIES[Math.floor(Math.random() * COMPANIES.length)];
      cards.push({
        id: Math.random().toString(36).substr(2, 9),
        type: 'special',
        effect: 'audit',
        companyId: auditCompany,
        description: `Audit: Cancel ${auditCompany.toUpperCase()}'s movement`
      });
    }
    return cards.sort(() => Math.random() - 0.5);
  }

  function dealCards(game: GameState) {
    const deck = generateCards();
    game.players.forEach(player => {
      player.cards = deck.splice(0, CARDS_PER_PLAYER);
    });
  }

  function applyMarketPhase(game: GameState) {
    const changes: Record<CompanyId, number> = {
      tech: 0, pharma: 0, fmcg: 0, auto: 0, banking: 0, energy: 0
    };
    const audits: Set<CompanyId> = new Set();
    let globalMultiplier = 1;

    game.marketPool.forEach(card => {
      if (card.type === 'standard' && card.companyId && card.value) {
        changes[card.companyId] += card.value;
      } else if (card.type === 'special') {
        if (card.effect === 'bull_run') globalMultiplier *= 1.1;
        if (card.effect === 'audit' && card.companyId) audits.add(card.companyId);
      }
    });

    COMPANIES.forEach(id => {
      if (!audits.has(id)) {
        let newPrice = (game.companies[id] + changes[id]) * globalMultiplier;
        game.companies[id] = Math.max(10, Math.round(newPrice)); // Min price 10
      }
    });

    game.marketPool = [];
  }

  function handlePlayerLeave(socketId: string) {
    for (const roomId in games) {
      const game = games[roomId];
      const playerIndex = game.players.findIndex(p => p.id === socketId);
      
      if (playerIndex !== -1) {
        const player = game.players[playerIndex];
        
        // 1. Liquidate portfolio
        COMPANIES.forEach(cid => {
          player.cash += player.portfolio[cid] * game.companies[cid];
          player.portfolio[cid] = 0;
        });

        // 2. Discard cards
        player.cards = [];

        // 3. Remove from game
        if (game.status === 'lobby') {
          game.players.splice(playerIndex, 1);
          if (game.players.length === 0) {
            delete games[roomId];
          } else if (player.isHost) {
            game.players[0].isHost = true;
          }
        } else if (game.status === 'playing') {
          // If it's their turn, move to next player before removing
          if (game.currentPlayerIndex === playerIndex) {
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
          } else if (game.currentPlayerIndex > playerIndex) {
            game.currentPlayerIndex -= 1;
          }
          
          game.players.splice(playerIndex, 1);
          
          if (game.players.length === 0) {
            delete games[roomId];
          }
        }

        if (games[roomId]) {
          io.to(roomId).emit("game_updated", game);
        }
      }
    }
  }

  // --- Socket Events ---

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("create_room", ({ name }) => {
      const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
      const game: GameState = {
        roomId,
        players: [{
          id: socket.id,
          name,
          cash: STARTING_CASH,
          portfolio: { tech: 0, pharma: 0, fmcg: 0, auto: 0, banking: 0, energy: 0 },
          cards: [],
          turnsTaken: 0,
          isHost: true
        }],
        companies: { ...STARTING_PRICES },
        marketPool: [],
        currentRound: 1,
        currentPlayerIndex: 0,
        status: 'lobby'
      };
      games[roomId] = game;
      socket.join(roomId);
      socket.emit("game_updated", game);
    });

    socket.on("join_room", ({ roomId, name }) => {
      const game = games[roomId];
      if (!game) return socket.emit("error", "Room not found");
      if (game.status !== 'lobby') return socket.emit("error", "Game already started");
      
      game.players.push({
        id: socket.id,
        name,
        cash: STARTING_CASH,
        portfolio: { tech: 0, pharma: 0, fmcg: 0, auto: 0, banking: 0, energy: 0 },
        cards: [],
        turnsTaken: 0,
        isHost: false
      });
      socket.join(roomId);
      io.to(roomId).emit("game_updated", game);
    });

    socket.on("start_game", ({ roomId }) => {
      const game = games[roomId];
      if (!game || game.players[0].id !== socket.id) return;
      
      game.status = 'playing';
      dealCards(game);
      io.to(roomId).emit("game_updated", game);
    });

    socket.on("buy_stock", ({ roomId, companyId, quantity }) => {
      const game = games[roomId];
      if (!game || game.status !== 'playing') return;
      if (!VALID_BATCH_SIZES.includes(quantity)) return socket.emit("error", "Invalid trade quantity");
      
      const player = game.players.find(p => p.id === socket.id);
      if (!player || game.players[game.currentPlayerIndex].id !== socket.id) return;

      const cost = game.companies[companyId as CompanyId] * quantity;
      if (player.cash >= cost) {
        player.cash -= cost;
        player.portfolio[companyId as CompanyId] += quantity;
        io.to(roomId).emit("game_updated", game);
      }
    });

    socket.on("sell_stock", ({ roomId, companyId, quantity }) => {
      const game = games[roomId];
      if (!game || game.status !== 'playing') return;
      if (!VALID_BATCH_SIZES.includes(quantity)) return socket.emit("error", "Invalid trade quantity");

      const player = game.players.find(p => p.id === socket.id);
      if (!player || game.players[game.currentPlayerIndex].id !== socket.id) return;

      if (player.portfolio[companyId as CompanyId] >= quantity) {
        const gain = game.companies[companyId as CompanyId] * quantity;
        player.cash += gain;
        player.portfolio[companyId as CompanyId] -= quantity;
        io.to(roomId).emit("game_updated", game);
      }
    });

    socket.on("play_card", ({ roomId, cardId }) => {
      const game = games[roomId];
      if (!game || game.status !== 'playing') return;
      const player = game.players.find(p => p.id === socket.id);
      if (!player || game.players[game.currentPlayerIndex].id !== socket.id) return;

      const cardIndex = player.cards.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        const [card] = player.cards.splice(cardIndex, 1);
        game.marketPool.push(card);
        io.to(roomId).emit("game_updated", game);
      }
    });

    socket.on("end_turn", ({ roomId }) => {
      const game = games[roomId];
      if (!game || game.status !== 'playing') return;
      if (game.players[game.currentPlayerIndex].id !== socket.id) return;

      const player = game.players[game.currentPlayerIndex];
      player.turnsTaken += 1;

      // Move to next player
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;

      // Check if round is over (all players finished their turns)
      const allFinished = game.players.every(p => p.turnsTaken >= TURNS_PER_ROUND);
      if (allFinished) {
        applyMarketPhase(game);
        if (game.currentRound >= MAX_ROUNDS) {
          // End game: Liquidate all
          game.players.forEach(p => {
            COMPANIES.forEach(cid => {
              p.cash += p.portfolio[cid] * game.companies[cid];
              p.portfolio[cid] = 0;
            });
          });
          game.status = 'finished';
        } else {
          game.currentRound += 1;
          game.players.forEach(p => p.turnsTaken = 0);
          dealCards(game);
        }
      }

      io.to(roomId).emit("game_updated", game);
    });

    socket.on("leave_game", () => {
      handlePlayerLeave(socket.id);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      handlePlayerLeave(socket.id);
    });
  });

  // --- Vite / Static Files ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(3000, "0.0.0.0", () => {
    console.log("Server running on http://localhost:3000");
  });
}

startServer();
