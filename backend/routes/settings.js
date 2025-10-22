// backend/routes/settings.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({dest:'uploads/'});
const fs = require('fs');
const path = require('path');
const { getData, saveData } = require('../utils/storage');

// GET settings
router.get('/', (req,res)=>{
  const data = getData('settings.json') || {};
  res.json(data);
});

// POST save settings
router.post('/', upload.single('logo'), (req,res)=>{
  const data = getData('settings.json') || {};
  data.name = req.body.name;
  data.gstin = req.body.gstin;
  data.address = req.body.address;
  data.theme = req.body.theme;
  data.multiUser = req.body.multiUser==='true'||req.body.multiUser===true;
  if(req.file) data.logo = req.file.filename;
  saveData('settings.json',data);
  res.json({success:true});
});

// Export database
router.get('/export',(req,res)=>{
  const dbFiles = ['products.json','customers.json','billing.json','settings.json'];
  const dbObj = {};
  dbFiles.forEach(f=>{
    dbObj[f] = getData(f);
  });
  res.setHeader('Content-Disposition','attachment; filename=database_backup.json');
  res.json(dbObj);
});

// Import database
router.post('/import',(req,res)=>{
  const dbObj = req.body;
  for(const file in dbObj){
    saveData(file,dbObj[file]);
  }
  res.json({success:true});
});

// Multi-user toggle
router.post('/multiuser',(req,res)=>{
  const data = getData('settings.json') || {};
  data.multiUser = req.body.multiUser;
  saveData('settings.json',data);
  res.json({success:true});
});

module.exports = router;
