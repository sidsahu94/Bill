// backend/routes/settings.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getData, saveData } = require('../utils/storage');

// STRICT FILE UPLOAD SECURITY
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    // Generate secure random filename to prevent path traversal
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB Limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('SECURITY BLOCKED: Only image files are allowed.'));
  }
});

router.get('/', (req,res)=>{
  const data = getData('settings.json') || {};
  res.json(data);
});

// Use error handling middleware specifically for multer
router.post('/', (req, res, next) => {
  upload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, (req,res)=>{
  try {
    const data = getData('settings.json') || {};
    data.name = req.body.name;
    data.gstin = req.body.gstin;
    data.address = req.body.address;
    data.theme = req.body.theme;
    data.multiUser = req.body.multiUser === 'true' || req.body.multiUser === true;
    
    if (req.file) data.logo = req.file.filename;
    
    saveData('settings.json', data);
    res.json({ success: true, message: 'Settings saved securely' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save settings' });
  }
});

router.get('/export', (req,res)=>{
  const dbFiles = ['products.json','customers.json','billing.json','settings.json'];
  const dbObj = {};
  dbFiles.forEach(f=>{ dbObj[f] = getData(f); });
  res.setHeader('Content-Disposition','attachment; filename=Bill_Backup.json');
  res.json(dbObj);
});

router.post('/import', (req,res)=>{
  const dbObj = req.body;
  if (!dbObj || typeof dbObj !== 'object') return res.status(400).json({ message: 'Invalid payload' });
  for(const file in dbObj){ saveData(file, dbObj[file]); }
  res.json({ success: true });
});

module.exports = router;