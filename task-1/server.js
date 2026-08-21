const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const initSqlJs = require('sql.js');

const app = express();
const port = process.env.PORT || 3000;
const databasePath = path.join(__dirname, 'store.db');
const sessions = new Map();
const seedProducts = [
  [1, 'Daily Carry Tote', 'Carry', 78, 'BESTSELLER', 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=85', 'A sturdy, unlined canvas tote with a generous base and vegetable-tanned leather handles.'],
  [2, 'Ridge Wool Blanket', 'Home', 148, 'NEW', 'https://images.unsplash.com/photo-1600369671236-e74521d4b6ad?auto=format&fit=crop&w=900&q=85', 'Woven in a small mill from soft recycled wool.'],
  [3, 'Field Notes No. 04', 'Paper', 18, 'STUDIO PICK', 'https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?auto=format&fit=crop&w=900&q=85', 'A pocket-sized notebook with 96 pages of smooth, toothy paper.'],
  [4, 'Stoneware Mug', 'Kitchen', 34, null, 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85', 'Hand-thrown in Oregon and finished with a quiet matte glaze.'],
  [5, 'Utility Cap', 'Carry', 42, 'NEW', 'https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=900&q=85', 'Six-panel cotton twill with a brass adjuster.'],
  [6, 'Cedar + Smoke Candle', 'Home', 36, null, 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=900&q=85', 'A grounding blend of cedarwood, hinoki, and campfire.']
];

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`; }
function verifyPassword(password, stored) { const [salt, key] = stored.split(':'); const actual = crypto.scryptSync(password, salt, 64); return crypto.timingSafeEqual(Buffer.from(key, 'hex'), actual); }
function rows(database, sql, params = []) { const result = database.exec(sql, params); if (!result.length) return []; return result[0].values.map(values => Object.fromEntries(values.map((value, index) => [result[0].columns[index], value]))); }
function one(database, sql, params = []) { return rows(database, sql, params)[0]; }
function saveDatabase(database) { fs.writeFileSync(databasePath, Buffer.from(database.export())); }

initSqlJs({locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)}).then(SQL => {
  const database = fs.existsSync(databasePath) ? new SQL.Database(fs.readFileSync(databasePath)) : new SQL.Database();
  database.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,price REAL NOT NULL,tag TEXT,image TEXT NOT NULL,description TEXT NOT NULL); CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,total REAL NOT NULL,status TEXT DEFAULT 'placed',created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS order_items (order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity INTEGER NOT NULL,unit_price REAL NOT NULL);`);
  seedProducts.forEach(item => database.run('INSERT OR IGNORE INTO products VALUES (?,?,?,?,?,?,?)', item)); saveDatabase(database);
  app.use(express.json()); app.use(express.static(__dirname));
  function currentUser(request, response, next) { const token = request.headers.authorization?.replace('Bearer ', ''); const userId = token && sessions.get(token); if (!userId) return response.status(401).json({error:'Authentication required'}); request.userId = userId; next(); }
  app.get('/api/products', (request, response) => response.json(rows(database, 'SELECT * FROM products ORDER BY id')));
  app.get('/api/products/:id', (request, response) => { const item = one(database, 'SELECT * FROM products WHERE id = ?', [request.params.id]); if (!item) return response.status(404).json({error:'Product not found'}); response.json(item); });
  app.post('/api/auth/register', (request, response) => { const email = String(request.body.email || '').trim().toLowerCase(); const password = String(request.body.password || ''); if (!email || password.length < 6) return response.status(400).json({error:'A valid email and 6-character password are required'}); if (one(database, 'SELECT id FROM users WHERE email = ?', [email])) return response.status(409).json({error:'An account with this email already exists'}); database.run('INSERT INTO users (email,password_hash) VALUES (?,?)', [email, hashPassword(password)]); const user = one(database, 'SELECT id,email FROM users WHERE email = ?', [email]); const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, user.id); saveDatabase(database); response.status(201).json({token,user}); });
  app.post('/api/auth/login', (request, response) => { const email = String(request.body.email || '').trim().toLowerCase(); const user = one(database, 'SELECT * FROM users WHERE email = ?', [email]); if (!user || !verifyPassword(String(request.body.password || ''), user.password_hash)) return response.status(401).json({error:'Email or password not recognized'}); const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, user.id); response.json({token,user:{id:user.id,email:user.email}}); });
  app.get('/api/orders', currentUser, (request, response) => { const orders = rows(database, 'SELECT id,total,status,created_at AS createdAt FROM orders WHERE user_id = ? ORDER BY id DESC', [request.userId]); response.json(orders.map(order => ({...order,items:rows(database,'SELECT product_id AS productId,quantity,unit_price AS unitPrice FROM order_items WHERE order_id = ?',[order.id])}))); });
  app.post('/api/orders', currentUser, (request, response) => { const requested = Array.isArray(request.body.items) ? request.body.items : []; if (!requested.length) return response.status(400).json({error:'Your cart is empty'}); const validItems = requested.map(item => ({product:one(database,'SELECT id,price FROM products WHERE id = ?',[item.productId]),quantity:Number(item.quantity)})); if (validItems.some(item => !item.product || !Number.isInteger(item.quantity) || item.quantity < 1)) return response.status(400).json({error:'One or more cart items are invalid'}); const total = validItems.reduce((sum,item) => sum + item.product.price * item.quantity, 0); database.run('INSERT INTO orders (user_id,total) VALUES (?,?)',[request.userId,total]); const order = one(database,'SELECT last_insert_rowid() AS id'); validItems.forEach(item => database.run('INSERT INTO order_items VALUES (?,?,?,?)',[order.id,item.product.id,item.quantity,item.product.price])); saveDatabase(database); response.status(201).json({id:order.id,total,status:'placed'}); });
  app.listen(port, () => console.log(`Fieldwork Supply Co. running at http://localhost:${port}`));
}).catch(error => { console.error(error); process.exitCode = 1; });
