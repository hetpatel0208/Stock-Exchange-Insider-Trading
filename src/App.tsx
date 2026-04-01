/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Play, 
  Wallet, 
  Briefcase, 
  ArrowRight, 
  Info,
  Trophy,
  RefreshCw
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

type CompanyId = 'tech' | 'pharma' | 'fmcg' | 'auto' | 'banking' | 'energy';

interface Card {
  id: string;
  type: 'standard' | 'special';
  companyId?: CompanyId;
  value?: number;
  effect?: 'bull_run' | 'audit';
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

const COMPANY_NAMES: Record<CompanyId, string> = {
  tech: 'Tech',
  pharma: 'Pharma',
  fmcg: 'FMCG',
  auto: 'Auto',
  banking: 'Banking',
  energy: 'Energy'
};

const COMPANY_COLORS: Record<CompanyId, string> = {
  tech: 'bg-blue-500',
  pharma: 'bg-green-500',
  fmcg: 'bg-red-600',
  auto: 'bg-indigo-600',
  banking: 'bg-orange-500',
  energy: 'bg-yellow-500'
};

const BATCH_SIZES = [100, 250, 500, 1000];

// --- App Component ---

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [name, setName] = useState('');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(100);

  useEffect(() => {
    // Use the backend URL from environment variables, fallback to current origin for local dev
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    const newSocket = io(backendUrl, {
      transports: ['polling', 'websocket'], // Start with polling for better compatibility
      withCredentials: true
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to backend:', newSocket.id);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      setError(`Connection failed: ${err.message}`);
    });

    newSocket.on('game_updated', (state: GameState) => {
      setGameState(state);
      setError(null);
    });

    newSocket.on('error', (msg: string) => {
      setError(msg);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const me = useMemo(() => {
    return gameState?.players.find(p => p.id === socket?.id);
  }, [gameState, socket]);

  const isMyTurn = useMemo(() => {
    if (!gameState || !socket) return false;
    return gameState.players[gameState.currentPlayerIndex].id === socket.id;
  }, [gameState, socket]);

  const handleCreateRoom = () => {
    if (!name) return setError("Please enter your name");
    socket?.emit('create_room', { name });
  };

  const handleJoinRoom = () => {
    if (!name || !roomIdInput) return setError("Please enter name and room ID");
    socket?.emit('join_room', { roomId: roomIdInput.toUpperCase(), name });
  };

  const handleStartGame = () => {
    socket?.emit('start_game', { roomId: gameState?.roomId });
  };

  const handleBuy = (companyId: CompanyId) => {
    socket?.emit('buy_stock', { roomId: gameState?.roomId, companyId, quantity: selectedQuantity });
  };

  const handleSell = (companyId: CompanyId) => {
    socket?.emit('sell_stock', { roomId: gameState?.roomId, companyId, quantity: selectedQuantity });
  };

  const handleLeaveGame = () => {
    socket?.emit('leave_game');
    setGameState(null);
  };

  const handlePlayCard = (cardId: string) => {
    socket?.emit('play_card', { roomId: gameState?.roomId, cardId });
  };

  const handleEndTurn = () => {
    socket?.emit('end_turn', { roomId: gameState?.roomId });
  };

  if (!gameState) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white border border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <h1 className="text-4xl font-black uppercase tracking-tighter mb-8 border-b-4 border-black pb-4 italic">
            Stock Exchange
          </h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-2">Player Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border-2 border-black p-3 font-mono focus:outline-none focus:bg-black focus:text-white transition-colors"
                placeholder="ENTER NAME..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={handleCreateRoom}
                className="bg-black text-white p-4 font-bold uppercase hover:bg-white hover:text-black border-2 border-black transition-all flex items-center justify-center gap-2"
              >
                <Play size={18} /> Create
              </button>
              <div className="flex flex-col gap-2">
                <input 
                  type="text" 
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value)}
                  className="w-full border-2 border-black p-3 font-mono text-center uppercase"
                  placeholder="ROOM ID"
                />
                <button 
                  onClick={handleJoinRoom}
                  className="bg-white text-black p-2 font-bold uppercase border-2 border-black hover:bg-black hover:text-white transition-all"
                >
                  Join
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-100 border-2 border-red-600 p-3 text-red-600 font-bold text-sm uppercase">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (gameState.status === 'lobby') {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white border border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black uppercase italic">Lobby</h2>
            <div className="bg-black text-white px-3 py-1 font-mono text-xl">{gameState.roomId}</div>
          </div>

          <div className="space-y-4 mb-8">
            <label className="block text-xs font-bold uppercase tracking-widest opacity-50">Players Joined</label>
            {gameState.players.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 p-3 border-2 border-black font-bold">
                <div className="w-8 h-8 bg-black text-white flex items-center justify-center text-xs">0{i+1}</div>
                {p.name} {p.isHost && <span className="text-[10px] bg-black text-white px-1 ml-auto">HOST</span>}
              </div>
            ))}
          </div>

          {me?.isHost ? (
            <button 
              onClick={handleStartGame}
              disabled={gameState.players.length < 1}
              className="w-full bg-black text-white p-4 font-bold uppercase hover:bg-white hover:text-black border-2 border-black transition-all disabled:opacity-50"
            >
              Start Game
            </button>
          ) : (
            <div className="text-center font-mono text-sm animate-pulse">WAITING FOR HOST TO START...</div>
          )}
        </div>
      </div>
    );
  }

  if (gameState.status === 'finished') {
    const sortedPlayers = [...gameState.players].sort((a, b) => b.cash - a.cash);
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-2xl bg-white border border-black p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
          <h1 className="text-5xl font-black uppercase italic mb-8 text-center">Market Closed</h1>
          
          <div className="space-y-4 mb-8">
            {sortedPlayers.map((p, i) => (
              <div key={p.id} className={cn(
                "flex items-center justify-between p-6 border-4 border-black",
                i === 0 ? "bg-yellow-400" : "bg-white"
              )}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-black">#{i+1}</span>
                  <div>
                    <div className="font-black text-2xl uppercase">{p.name}</div>
                    <div className="font-mono">Final Net Worth</div>
                  </div>
                </div>
                <div className="text-3xl font-black">₹{p.cash.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-black text-white p-4 font-bold uppercase hover:bg-white hover:text-black border-2 border-black transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw size={20} /> Play Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E4E3E0] font-sans text-[#141414]">
      {/* Header */}
      <header className="bg-white border-b-4 border-black p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-black uppercase italic tracking-tighter">Stock Exchange</h1>
            <div className="flex gap-4 font-mono text-xs font-bold">
              <div className="bg-black text-white px-2 py-1">ROUND {gameState.currentRound}/4</div>
              <div className="border-2 border-black px-2 py-1">ROOM: {gameState.roomId}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={handleLeaveGame}
              className="text-[10px] font-bold uppercase border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-all"
            >
              Leave Game
            </button>
            {gameState.players.map((p, i) => (
              <div key={p.id} className={cn(
                "flex items-center gap-2 px-3 py-1 border-2 border-black transition-all",
                gameState.currentPlayerIndex === i ? "bg-black text-white scale-110" : "bg-white"
              )}>
                <Users size={14} />
                <span className="text-xs font-bold uppercase">{p.name}</span>
                {gameState.currentPlayerIndex === i && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-12 gap-6">
        {/* Market Prices */}
        <section className="col-span-12 lg:col-span-8 space-y-6">
          <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h2 className="text-3xl font-black uppercase italic">Live Market</h2>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Batch Size:</span>
                <div className="flex border-2 border-black">
                  {BATCH_SIZES.map(size => (
                    <button
                      key={size}
                      onClick={() => setSelectedQuantity(size)}
                      className={cn(
                        "px-3 py-1 text-xs font-bold border-r-2 last:border-r-0 border-black transition-colors",
                        selectedQuantity === size ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {(Object.entries(gameState.companies) as [CompanyId, number][]).map(([id, price]) => (
                <div key={id} className="border-2 border-black p-4 group hover:bg-black hover:text-white transition-all cursor-default">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-50 group-hover:text-white/50">{id}</span>
                    {price >= 100 ? <TrendingUp size={16} className="text-green-500" /> : <TrendingDown size={16} className="text-red-500" />}
                  </div>
                  <div className="font-black text-xl uppercase mb-1">{COMPANY_NAMES[id]}</div>
                  <div className="font-mono text-2xl">₹{price}</div>
                  
                  {isMyTurn && (
                    <div className="mt-4 grid grid-cols-2 gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleBuy(id)}
                        className="bg-white text-black text-[10px] font-bold uppercase py-1 border border-black hover:bg-green-500 hover:text-white"
                      >
                        Buy {selectedQuantity}
                      </button>
                      <button 
                        onClick={() => handleSell(id)}
                        className="bg-white text-black text-[10px] font-bold uppercase py-1 border border-black hover:bg-red-500 hover:text-white"
                      >
                        Sell {selectedQuantity}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* My Portfolio */}
          <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black uppercase italic flex items-center gap-2">
                <Briefcase size={24} /> My Portfolio
              </h2>
              <div className="flex items-center gap-2 bg-black text-white px-4 py-2 font-mono text-xl">
                <Wallet size={20} /> ₹{me?.cash.toLocaleString()}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full font-mono text-sm">
                <thead>
                  <tr className="border-b-2 border-black text-left">
                    <th className="pb-2 uppercase">Company</th>
                    <th className="pb-2 uppercase">Shares</th>
                    <th className="pb-2 uppercase">Current Value</th>
                  </tr>
                </thead>
                <tbody>
                  {me && (Object.entries(me.portfolio) as [CompanyId, number][]).map(([id, count]) => (
                    <tr key={id} className="border-b border-black/10">
                      <td className="py-3 font-bold uppercase">{COMPANY_NAMES[id]}</td>
                      <td className="py-3">{count}</td>
                      <td className="py-3">₹{(count * gameState.companies[id]).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Sidebar: Cards & Actions */}
        <aside className="col-span-12 lg:col-span-4 space-y-6">
          {/* Turn Info */}
          <div className={cn(
            "border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors",
            isMyTurn ? "bg-yellow-400" : "bg-white"
          )}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-black uppercase italic text-xl">
                {isMyTurn ? "Your Turn" : `${gameState.players[gameState.currentPlayerIndex].name}'s Turn`}
              </h3>
              <div className="bg-black text-white px-2 py-1 text-[10px] font-bold">
                TURN {me?.turnsTaken || 0}/3
              </div>
            </div>
            
            {isMyTurn ? (
              <div className="space-y-4">
                <p className="text-xs font-bold leading-tight">
                  You can buy/sell stocks as many times as you want. 
                  Playing a card or ending turn will consume 1 turn action.
                </p>
                <button 
                  onClick={handleEndTurn}
                  className="w-full bg-black text-white p-3 font-bold uppercase flex items-center justify-center gap-2 hover:bg-white hover:text-black border-2 border-black transition-all"
                >
                  End Turn <ArrowRight size={18} />
                </button>
              </div>
            ) : (
              <p className="text-xs font-mono italic opacity-50">Waiting for other players to move...</p>
            )}
          </div>

          {/* Insider Cards */}
          <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="font-black uppercase italic text-xl mb-4 flex items-center gap-2">
              <Info size={20} /> Insider Info
            </h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {me?.cards.map((card) => (
                <div key={card.id} className="border-2 border-black p-3 bg-gray-50 group">
                  <div className="text-[10px] font-bold uppercase opacity-50 mb-1">{card.type}</div>
                  <div className="font-bold text-sm leading-tight mb-2">{card.description}</div>
                  {isMyTurn && (
                    <button 
                      onClick={() => handlePlayCard(card.id)}
                      className="w-full bg-white border border-black text-[10px] font-bold uppercase py-1 hover:bg-black hover:text-white transition-all"
                    >
                      Play into Market Pool
                    </button>
                  )}
                </div>
              ))}
              {me?.cards.length === 0 && (
                <div className="text-center py-8 font-mono text-xs opacity-50 italic">No cards left this round</div>
              )}
            </div>
          </div>

          {/* Market Pool Status */}
          <div className="bg-black text-white p-4 border-4 border-black shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-widest">Market Pool</span>
              <span className="font-mono text-xl">{gameState.marketPool.length} CARDS</span>
            </div>
            <p className="text-[10px] mt-2 opacity-70 italic">
              These cards will be revealed at the end of the round to change prices.
            </p>
          </div>
        </aside>
      </main>

      {/* Footer / Stats */}
      <footer className="max-w-7xl mx-auto p-6 mt-12 border-t-2 border-black/10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-4">Game Rules</h4>
            <ul className="text-xs font-bold space-y-2 uppercase">
              <li>4 Rounds Total</li>
              <li>3 Turns Per Round</li>
              <li>Cards influence price</li>
              <li>Highest net worth wins</li>
            </ul>
          </div>
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-4">Stock Tips</h4>
            <p className="text-[10px] leading-relaxed font-mono italic">
              Watch the market pool. If many cards are being played, expect high volatility. 
              Use your insider info to buy low before the round ends.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
