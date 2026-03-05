import { type FastifyRequest, type FastifyReply } from 'fastify';
import { type DB } from '../db/index.js';

export interface Context {
  req: FastifyRequest;
  res: FastifyReply;
  db: DB;
}

export function createContext(db: DB) {
  return async (req: FastifyRequest, res: FastifyReply): Promise<Context> => ({
    req,
    res,
    db,
  });
}
