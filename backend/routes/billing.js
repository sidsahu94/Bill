// backend/routes/billing.js
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const controller = require('../controllers/billingController');

router.post('/create', auth, controller.createBill);
router.get('/', auth, controller.getBills);
router.get('/:id', auth, controller.getBillById);
router.delete('/:id', auth, controller.deleteBill);

module.exports = router;
