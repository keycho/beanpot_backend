import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents } from '../types';
import { getGameState, broadcastGameState } from '../game/engine';

export function setupSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join:game', (game_id: string) => {
      socket.join(game_id);
      console.log(`Client ${socket.id} joined game ${game_id}`);

      // Send current state
      const state = getGameState(game_id);
      if (state) {
        socket.emit('game:state', state);
      }
    });

    socket.on('leave:game', (game_id: string) => {
      socket.leave(game_id);
      console.log(`Client ${socket.id} left game ${game_id}`);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
