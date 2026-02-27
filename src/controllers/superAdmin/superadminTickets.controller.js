// controllers/superAdmin/superadminTickets.controller.js
import {
  listTicketUsers,
  listUserTickets,
  getTicketThread,
} from "../../services/superAdmin/superadminTickets.service.js";

export const superAdminListTicketUsers = async (req, res) => {
  try {
    const { q, page, pageSize } = req.query;
    const data = await listTicketUsers({ q, page, pageSize });
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const superAdminListUserTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, q, page, pageSize } = req.query;

    const data = await listUserTickets({
      userId,
      status,
      q,
      page,
      pageSize,
    });

    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const superAdminGetTicketThread = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const data = await getTicketThread({ ticketId });
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
