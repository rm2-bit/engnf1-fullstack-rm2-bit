import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getTicketStats } from '../services/statsService.js';
import {
  getTicketWithEvents,
  importTickets,
  listTickets,
  patchTicket,
  validateImportItem,
} from '../services/ticketService.js';
import { asyncHandler, validationError } from '../utils/errors.js';

export const ticketsRouter = Router();
export const statsRouter = Router();

ticketsRouter.use(authenticate);
statsRouter.use(authenticate);

const MAX_IMPORT = 2000;

ticketsRouter.post(
  '/import',
  asyncHandler(async (req, res) => {
    const list = req.body?.tickets;
    if (!Array.isArray(list)) throw validationError('tickets must be an array');
    if (list.length > MAX_IMPORT) throw validationError(`At most ${MAX_IMPORT} tickets per import`);
    const items = list.map(validateImportItem);
    res.json(await importTickets(items));
  }),
);

ticketsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listTickets(req.query));
  }),
);

ticketsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getTicketWithEvents(req.params.id));
  }),
);

ticketsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const header = req.get('X-Agent');
    const actor = header && header.trim() ? header.trim().slice(0, 100) : req.user.email;
    res.json(await patchTicket(req.params.id, req.body, actor));
  }),
);

statsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getTicketStats());
  }),
);
