const jwt = require('jsonwebtoken');
const { Table } = require('../models');

const verifyCustomerTableSession = async (req, res, next) => {
    try {
        const token = req.header('x-table-session');
        if (!token) return res.status(401).json({ message: 'Scan the table QR code before ordering.' });
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.type !== 'customer-table' || !payload.tableId) {
            return res.status(401).json({ message: 'Invalid table session.' });
        }
        const table = await Table.findByPk(payload.tableId);
        if (!table || !table.qrSessionActive || Number(table.qrSessionVersion) !== Number(payload.version)) {
            return res.status(401).json({ message: 'This table session is no longer active.' });
        }
        const requestedTableId = req.body?.tableId || req.params?.tableId || payload.tableId;
        if (String(requestedTableId) !== String(payload.tableId)) {
            return res.status(403).json({ message: 'This QR session belongs to a different table.' });
        }
        req.customerTable = table;
        req.customerTableSession = payload;
        next();
    } catch (error) {
        return res.status(401).json({ message: error?.name === 'TokenExpiredError' ? 'Table session expired. Scan the QR code again.' : 'Invalid table session.' });
    }
};

module.exports = verifyCustomerTableSession;
