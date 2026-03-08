import { RegionId } from './coordinates.js';
import {
  PlayerId,
  RealPieceId,
  PieceState,
  PieceInfo,
  HistoricalPieceInfo,
  SpacetimeCoord,
} from './entities.js';

export interface TurnTransaction {
  savepoint(name: string): void;
  rollbackTo(name: string): void;
  commit(): void;
  rollback(): void;
}

export interface BranchCreationParams {
  originTimeline:     string;
  originTurn:         number;
  newTimelineId:      string;
  travelerId:         RealPieceId;
  travelerDestRegion: RegionId;
}

export interface PieceStore {
  // Board queries
  getPiecesOnBoard(gameId: string, timeline: string, turn: number): PieceInfo[];
  getHistoricalPieces(gameId: string, timeline: string, turn: number): HistoricalPieceInfo[];
  getPieceLocation(gameId: string, realPieceId: RealPieceId): SpacetimeCoord | undefined;
  getPieceState(gameId: string, realPieceId: RealPieceId): PieceState | undefined;

  // Mutations (call within a TurnTransaction)
  movePiece(gameId: string, realPieceId: RealPieceId, newCoord: Partial<SpacetimeCoord>): void;
  updatePieceData(gameId: string, realPieceId: RealPieceId, data: Record<string, unknown>): void;
  removePiece(gameId: string, realPieceId: RealPieceId): void;
  addPiece(gameId: string, state: PieceState, coord: SpacetimeCoord): void;

  // Turn lifecycle
  advanceAllTimelines(gameId: string, timelines: { timeline: string; fromTurn: number }[]): void;
  createBranch(gameId: string, params: BranchCreationParams): void;

  // Transaction management
  beginTurn(gameId: string): TurnTransaction;
  initGame(gameId: string, initialPieces: { state: PieceState; coord: SpacetimeCoord }[]): void;
  deleteGame(gameId: string): void;
}

