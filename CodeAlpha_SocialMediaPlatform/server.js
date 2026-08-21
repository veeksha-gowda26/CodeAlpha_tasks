const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const databasePath = path.join(__dirname, 'social.db');
let db;

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'codealpha-social-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function persistDatabase() {
  fs.writeFileSync(databasePath, Buffer.from(db.export()));
}

function query(sql, params = {}) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

function run(sql, params = {}) {
  db.run(sql, params);
  persistDatabase();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, bio: user.bio || '' };
}

function profileFor(userId, viewerId = userId) {
  const users = query(`SELECT id, username, email, bio, created_at FROM users WHERE id = $id`, { $id: userId });
  if (!users.length) return null;
  const user = users[0];
  const stats = query(`SELECT
    (SELECT COUNT(*) FROM posts WHERE user_id = $id) AS posts,
    (SELECT COUNT(*) FROM follows WHERE following_id = $id) AS followers,
    (SELECT COUNT(*) FROM follows WHERE follower_id = $id) AS following,
    EXISTS(SELECT 1 FROM follows WHERE follower_id = $viewer AND following_id = $id) AS isFollowing`, { $id: userId, $viewer: viewerId })[0];
  return { ...publicUser(user), createdAt: user.created_at, ...stats, isFollowing: Boolean(stats.isFollowing) };
}

function postFor(post, viewerId) {
  const comments = query(`SELECT c.id, c.content, c.created_at AS createdAt, u.id AS userId, u.username
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = $post ORDER BY c.created_at ASC`, { $post: post.id });
  const likes = query(`SELECT COUNT(*) AS count, EXISTS(SELECT 1 FROM likes WHERE post_id = $post AND user_id = $user) AS liked FROM likes`, { $post: post.id, $user: viewerId })[0];
  return { id: post.id, userId: post.user_id, username: post.username, content: post.content, createdAt: post.created_at, likes: Number(likes.count), liked: Boolean(likes.liked), comments };
}

app.post('/api/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Username must be 3-24 letters, numbers, or underscores.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (query('SELECT id FROM users WHERE username = $username OR email = $email', { $username: username, $email: email }).length) return res.status(409).json({ error: 'That username or email is already registered.' });
  run('INSERT INTO users (username, email, password, bio, created_at) VALUES ($username, $email, $password, $bio, datetime(\'now\'))', { $username: username, $email: email, $password: bcrypt.hashSync(password, 12), $bio: 'New to the community.' });
  const user = query('SELECT id, username, email, bio FROM users WHERE email = $email', { $email: email })[0];
  req.session.userId = user.id;
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const users = query('SELECT * FROM users WHERE email = $email', { $email: email });
  if (!users.length || !bcrypt.compareSync(password, users[0].password)) return res.status(401).json({ error: 'Invalid email or password.' });
  req.session.userId = users[0].id;
  res.json({ user: publicUser(users[0]) });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ message: 'Logged out successfully.' })));
app.get('/api/me', requireAuth, (req, res) => res.json({ user: profileFor(req.session.userId) }));

app.get('/api/posts', requireAuth, (req, res) => {
  const posts = query(`SELECT p.*, u.username FROM posts p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC, p.id DESC`);
  res.json({ posts: posts.map((post) => postFor(post, req.session.userId)) });
});

app.post('/api/posts', requireAuth, (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Posts cannot be empty.' });
  if (content.length > 500) return res.status(400).json({ error: 'Posts must be 500 characters or fewer.' });
  run('INSERT INTO posts (user_id, content, created_at) VALUES ($user, $content, datetime(\'now\'))', { $user: req.session.userId, $content: content });
  const post = query(`SELECT p.*, u.username FROM posts p JOIN users u ON u.id = p.user_id WHERE p.user_id = $user ORDER BY p.id DESC LIMIT 1`, { $user: req.session.userId })[0];
  res.status(201).json({ post: postFor(post, req.session.userId) });
});

app.post('/api/posts/:id/like', requireAuth, (req, res) => {
  const postId = Number(req.params.id);
  if (!query('SELECT id FROM posts WHERE id = $id', { $id: postId }).length) return res.status(404).json({ error: 'Post not found.' });
  const existing = query('SELECT id FROM likes WHERE user_id = $user AND post_id = $post', { $user: req.session.userId, $post: postId });
  if (existing.length) run('DELETE FROM likes WHERE id = $id', { $id: existing[0].id });
  else run('INSERT INTO likes (user_id, post_id) VALUES ($user, $post)', { $user: req.session.userId, $post: postId });
  const state = query('SELECT COUNT(*) AS likes FROM likes WHERE post_id = $post', { $post: postId })[0];
  res.json({ liked: !existing.length, likes: Number(state.likes) });
});

app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const postId = Number(req.params.id);
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Comments cannot be empty.' });
  if (content.length > 280) return res.status(400).json({ error: 'Comments must be 280 characters or fewer.' });
  if (!query('SELECT id FROM posts WHERE id = $id', { $id: postId }).length) return res.status(404).json({ error: 'Post not found.' });
  run('INSERT INTO comments (post_id, user_id, content, created_at) VALUES ($post, $user, $content, datetime(\'now\'))', { $post: postId, $user: req.session.userId, $content: content });
  const comment = query(`SELECT c.id, c.content, c.created_at AS createdAt, u.id AS userId, u.username FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = $post AND c.user_id = $user ORDER BY c.id DESC LIMIT 1`, { $post: postId, $user: req.session.userId })[0];
  res.status(201).json({ comment });
});

app.get('/api/users/:id', requireAuth, (req, res) => {
  const profile = profileFor(Number(req.params.id), req.session.userId);
  if (!profile) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: profile });
});

app.post('/api/users/:id/follow', requireAuth, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.session.userId) return res.status(400).json({ error: 'You cannot follow yourself.' });
  if (!profileFor(targetId)) return res.status(404).json({ error: 'User not found.' });
  const existing = query('SELECT id FROM follows WHERE follower_id = $follower AND following_id = $following', { $follower: req.session.userId, $following: targetId });
  if (existing.length) run('DELETE FROM follows WHERE id = $id', { $id: existing[0].id });
  else run('INSERT INTO follows (follower_id, following_id) VALUES ($follower, $following)', { $follower: req.session.userId, $following: targetId });
  const user = profileFor(targetId, req.session.userId);
  res.json({ following: user.isFollowing, followers: Number(user.followers) });
});

app.get('/api/search', requireAuth, (req, res) => {
  const search = `%${String(req.query.q || '').trim()}%`;
  if (search === '%%') return res.json({ users: [] });
  res.json({ users: query(`SELECT id, username, bio,
    EXISTS(SELECT 1 FROM follows WHERE follower_id = $current AND following_id = users.id) AS isFollowing
    FROM users WHERE username LIKE $search AND id != $current ORDER BY username LIMIT 20`, { $search: search, $current: req.session.userId }).map((user) => ({ ...user, isFollowing: Boolean(user.isFollowing) })) });
});

async function start() {
  const SQL = await initSqlJs({ locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file) });
  db = fs.existsSync(databasePath) ? new SQL.Database(fs.readFileSync(databasePath)) : new SQL.Database();
  db.run(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, bio TEXT DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS likes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, UNIQUE(user_id, post_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS follows (id INTEGER PRIMARY KEY AUTOINCREMENT, follower_id INTEGER NOT NULL, following_id INTEGER NOT NULL, UNIQUE(follower_id, following_id), FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE);`);
  persistDatabase();
  app.listen(PORT, () => console.log(`Socially running at http://localhost:${PORT}`));
}

start().catch((error) => { console.error('Unable to start server:', error); process.exit(1); });
