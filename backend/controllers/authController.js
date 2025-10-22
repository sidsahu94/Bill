const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const usersFile = './data/users.json';

const getUsers = () => JSON.parse(fs.existsSync(usersFile) ? fs.readFileSync(usersFile) : '[]');
const saveUsers = (users) => fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

exports.registerUser = (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  if(users.find(u => u.username === username)) return res.status(400).json({message:'User exists'});
  const hashed = bcrypt.hashSync(password, 10);
  users.push({id:Date.now(), username, password:hashed});
  saveUsers(users);
  res.json({message:'User registered'});
};

exports.loginUser = (req,res) => {
  const { username, password } = req.body;
  const users = getUsers();
  const user = users.find(u=>u.username===username);
  if(!user) return res.status(400).json({message:'Invalid credentials'});
  const match = bcrypt.compareSync(password, user.password);
  if(!match) return res.status(400).json({message:'Invalid credentials'});
  const token = jwt.sign({id:user.id, username:user.username}, process.env.JWT_SECRET || 'secret', {expiresIn:'1d'});
  res.json({token});
};

