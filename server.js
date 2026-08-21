const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const initSqlJs = require('sql.js');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'social.db');
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
let db;

app.use(express.json());
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'codealpha-project-tool-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

function saveDb() {
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}
function rows(sql, params = {}) {
  const result = db.exec(sql, params);
  if (!result.length) return [];
  return result[0].values.map((values) => Object.fromEntries(values.map((value, index) => [result[0].columns[index], value])));
}
function one(sql, params = {}) { return rows(sql, params)[0] || null; }
function run(sql, params = {}) { db.run(sql, params); saveDb(); }
function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function fail(res, status, message) { return res.status(status).json({ error: message }); }
function auth(req, res, next) { return req.session.userId ? next() : fail(res, 401, 'Please log in to continue.'); }
function userPublic(user) { return user && { id: user.id, username: user.username, email: user.email }; }
function projectFor(id, userId) {
  return one(`SELECT p.*, u.username AS owner_name,
    CASE WHEN p.owner_id = $userId THEN 1 ELSE 0 END AS is_owner
    FROM projects p JOIN users u ON u.id = p.owner_id
    WHERE p.id = $id AND (p.owner_id = $userId OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $userId))`, { $id: id, $userId: userId });
}
function canAccessProject(projectId, userId) { return !!projectFor(projectId, userId); }
function canChangeTask(task, userId) { return task && (task.owner_id === userId || task.assigned_to === userId || canAccessProject(task.project_id, userId)); }
function broadcastProject(projectId, event, payload) { io.to(`project:${projectId}`).emit(event, payload); }

async function start() {
  const SQL = await initSqlJs({ locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file) });
  db = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', owner_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS project_members (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(project_id, user_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT DEFAULT '', assigned_to INTEGER, priority TEXT NOT NULL DEFAULT 'MEDIUM', status TEXT NOT NULL DEFAULT 'TODO', due_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);`);
  saveDb();
  registerRoutes();
  io.use((socket, next) => { const userId = socket.request.session?.userId; return userId ? next() : next(new Error('Authentication required.')); });
  io.on('connection', (socket) => {
    socket.on('project:join', (projectId) => { if (canAccessProject(Number(projectId), socket.request.session.userId)) socket.join(`project:${Number(projectId)}`); });
    socket.on('project:leave', (projectId) => socket.leave(`project:${Number(projectId)}`));
  });
  httpServer.listen(PORT, () => console.log(`Project tool running at http://localhost:${PORT}`));
}

function registerRoutes() {
  app.post('/api/register', async (req, res) => {
    const username = clean(req.body.username), email = clean(req.body.email).toLowerCase(), password = req.body.password || '';
    if (!username || !email || !password) return fail(res, 400, 'Username, email, and password are required.');
    if (password.length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Enter a valid email address.');
    if (one('SELECT id FROM users WHERE email = $email OR username = $username', { $email: email, $username: username })) return fail(res, 409, 'That username or email is already in use.');
    run('INSERT INTO users (username, email, password) VALUES ($username, $email, $password)', { $username: username, $email: email, $password: await bcrypt.hash(password, 10) });
    const user = one('SELECT id, username, email FROM users WHERE email = $email', { $email: email });
    req.session.userId = user.id;
    res.status(201).json({ user });
  });
  app.post('/api/login', async (req, res) => {
    const email = clean(req.body.email).toLowerCase(), password = req.body.password || '';
    const user = one('SELECT * FROM users WHERE email = $email', { $email: email });
    if (!user || !(await bcrypt.compare(password, user.password))) return fail(res, 401, 'Invalid email or password.');
    req.session.userId = user.id;
    res.json({ user: userPublic(user) });
  });
  app.post('/api/logout', auth, (req, res) => req.session.destroy(() => res.json({ ok: true })));
  app.get('/api/me', (req, res) => res.json({ user: req.session.userId ? userPublic(one('SELECT * FROM users WHERE id = $id', { $id: req.session.userId })) : null }));
  app.get('/api/users', auth, (req, res) => res.json({ users: rows('SELECT id, username, email FROM users WHERE id != $id ORDER BY username', { $id: req.session.userId }) }));
  app.get('/api/users/:id', auth, (req, res) => { const user = one('SELECT id, username, email, created_at FROM users WHERE id = $id', { $id: req.params.id }); return user ? res.json({ user }) : fail(res, 404, 'User not found.'); });

  app.get('/api/projects', auth, (req, res) => {
    const projects = rows(`SELECT p.*, u.username AS owner_name, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'DONE') AS completed_count
      FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.owner_id = $id OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $id) ORDER BY p.created_at DESC`, { $id: req.session.userId });
    res.json({ projects });
  });
  app.post('/api/projects', auth, (req, res) => {
    const name = clean(req.body.name), description = clean(req.body.description);
    if (!name) return fail(res, 400, 'Project name is required.');
    run('INSERT INTO projects (name, description, owner_id) VALUES ($name, $description, $owner)', { $name: name, $description: description, $owner: req.session.userId });
    const project = one('SELECT * FROM projects ORDER BY id DESC LIMIT 1');
    run('INSERT INTO project_members (project_id, user_id) VALUES ($project, $user)', { $project: project.id, $user: req.session.userId });
    res.status(201).json({ project });
  });
  app.get('/api/projects/:id', auth, (req, res) => { const project = projectFor(req.params.id, req.session.userId); return project ? res.json({ project }) : fail(res, 404, 'Project not found or access denied.'); });
  app.put('/api/projects/:id', auth, (req, res) => {
    const project = projectFor(req.params.id, req.session.userId); if (!project) return fail(res, 404, 'Project not found.'); if (!project.is_owner) return fail(res, 403, 'Only the project owner can edit it.');
    const name = clean(req.body.name), description = clean(req.body.description); if (!name) return fail(res, 400, 'Project name is required.');
    run('UPDATE projects SET name = $name, description = $description WHERE id = $id', { $name: name, $description: description, $id: req.params.id }); res.json({ project: one('SELECT * FROM projects WHERE id = $id', { $id: req.params.id }) });
  });
  app.delete('/api/projects/:id', auth, (req, res) => { const project = projectFor(req.params.id, req.session.userId); if (!project) return fail(res, 404, 'Project not found.'); if (!project.is_owner) return fail(res, 403, 'Only the project owner can delete it.'); run('DELETE FROM projects WHERE id = $id', { $id: req.params.id }); res.json({ ok: true }); });
  app.get('/api/projects/:id/members', auth, (req, res) => { if (!canAccessProject(req.params.id, req.session.userId)) return fail(res, 404, 'Project not found.'); res.json({ members: rows(`SELECT u.id, u.username, u.email, pm.created_at, CASE WHEN p.owner_id = u.id THEN 1 ELSE 0 END AS is_owner FROM project_members pm JOIN users u ON u.id = pm.user_id JOIN projects p ON p.id = pm.project_id WHERE pm.project_id = $id ORDER BY is_owner DESC, u.username`, { $id: req.params.id }) }); });
  app.post('/api/projects/:id/members', auth, (req, res) => { const project = projectFor(req.params.id, req.session.userId); if (!project) return fail(res, 404, 'Project not found.'); if (!project.is_owner) return fail(res, 403, 'Only the project owner can add members.'); const userId = Number(req.body.userId); if (!one('SELECT id FROM users WHERE id = $id', { $id: userId })) return fail(res, 404, 'User not found.'); try { run('INSERT INTO project_members (project_id, user_id) VALUES ($project, $user)', { $project: req.params.id, $user: userId }); } catch { return fail(res, 409, 'That user is already a project member.'); } res.status(201).json({ ok: true }); });
  app.delete('/api/projects/:id/members/:userId', auth, (req, res) => { const project = projectFor(req.params.id, req.session.userId); if (!project || !project.is_owner) return fail(res, 403, 'Only the project owner can remove members.'); run('DELETE FROM project_members WHERE project_id = $project AND user_id = $user', { $project: req.params.id, $user: req.params.userId }); res.json({ ok: true }); });

  app.get('/api/projects/:projectId/tasks', auth, (req, res) => { if (!canAccessProject(req.params.projectId, req.session.userId)) return fail(res, 404, 'Project not found.'); res.json({ tasks: rows(`SELECT t.*, u.username AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to WHERE t.project_id = $project ORDER BY CASE t.status WHEN 'TODO' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END, t.created_at DESC`, { $project: req.params.projectId }) }); });
  app.post('/api/projects/:projectId/tasks', auth, (req, res) => { if (!canAccessProject(req.params.projectId, req.session.userId)) return fail(res, 404, 'Project not found.'); const title = clean(req.body.title), description = clean(req.body.description), priority = clean(req.body.priority || 'MEDIUM').toUpperCase(), status = clean(req.body.status || 'TODO').toUpperCase(), assignedTo = req.body.assignedTo ? Number(req.body.assignedTo) : null; if (!title) return fail(res, 400, 'Task title is required.'); if (!['LOW','MEDIUM','HIGH'].includes(priority) || !['TODO','IN_PROGRESS','DONE'].includes(status)) return fail(res, 400, 'Invalid task priority or status.'); if (assignedTo && !one('SELECT id FROM users WHERE id = $id', { $id: assignedTo })) return fail(res, 400, 'Assigned user not found.'); run('INSERT INTO tasks (project_id, title, description, assigned_to, priority, status, due_date) VALUES ($project, $title, $description, $assigned, $priority, $status, $due)', { $project: req.params.projectId, $title: title, $description: description, $assigned: assignedTo, $priority: priority, $status: status, $due: clean(req.body.dueDate) || null }); const task = one('SELECT * FROM tasks ORDER BY id DESC LIMIT 1'); broadcastProject(req.params.projectId, 'task:changed', { action: 'created', task }); res.status(201).json({ task }); });
  app.put('/api/tasks/:id', auth, (req, res) => { const task = one('SELECT t.*, p.owner_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $id', { $id: req.params.id }); if (!task) return fail(res, 404, 'Task not found.'); if (!canChangeTask(task, req.session.userId)) return fail(res, 403, 'You cannot modify this task.'); const title = clean(req.body.title), priority = clean(req.body.priority).toUpperCase(), status = clean(req.body.status).toUpperCase(), assignedTo = req.body.assignedTo ? Number(req.body.assignedTo) : null; if (!title) return fail(res, 400, 'Task title is required.'); if (!['LOW','MEDIUM','HIGH'].includes(priority) || !['TODO','IN_PROGRESS','DONE'].includes(status)) return fail(res, 400, 'Invalid task priority or status.'); run('UPDATE tasks SET title=$title, description=$description, assigned_to=$assigned, priority=$priority, status=$status, due_date=$due WHERE id=$id', { $title:title, $description:clean(req.body.description), $assigned:assignedTo, $priority:priority, $status:status, $due:clean(req.body.dueDate) || null, $id:req.params.id }); const updatedTask = one('SELECT * FROM tasks WHERE id = $id', { $id:req.params.id }); broadcastProject(task.project_id, 'task:changed', { action: 'updated', task: updatedTask }); res.json({ task: updatedTask }); });
  app.delete('/api/tasks/:id', auth, (req, res) => { const task = one('SELECT t.*, p.owner_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $id', { $id:req.params.id }); if (!task) return fail(res, 404, 'Task not found.'); if (!canChangeTask(task, req.session.userId)) return fail(res, 403, 'You cannot delete this task.'); run('DELETE FROM tasks WHERE id=$id', { $id:req.params.id }); broadcastProject(task.project_id, 'task:changed', { action: 'deleted', taskId: task.id }); res.json({ ok:true }); });
  app.get('/api/tasks/:id/comments', auth, (req, res) => { const task = one('SELECT * FROM tasks WHERE id=$id', { $id:req.params.id }); if (!task || !canAccessProject(task.project_id, req.session.userId)) return fail(res, 404, 'Task not found.'); res.json({ comments: rows('SELECT c.*, u.username FROM comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=$id ORDER BY c.created_at ASC', { $id:req.params.id }) }); });
  app.post('/api/tasks/:id/comments', auth, (req, res) => { const task = one('SELECT * FROM tasks WHERE id=$id', { $id:req.params.id }); const content = clean(req.body.content); if (!task || !canAccessProject(task.project_id, req.session.userId)) return fail(res, 404, 'Task not found.'); if (!content) return fail(res, 400, 'Comment cannot be empty.'); run('INSERT INTO comments (task_id, user_id, content) VALUES ($task, $user, $content)', { $task:req.params.id, $user:req.session.userId, $content:content }); const comment = one('SELECT c.*, u.username FROM comments c JOIN users u ON u.id=c.user_id ORDER BY c.id DESC LIMIT 1'); broadcastProject(task.project_id, 'comment:added', { taskId: task.id, comment }); res.status(201).json({ comment }); });
  app.delete('/api/comments/:id', auth, (req, res) => { const comment = one('SELECT * FROM comments WHERE id=$id', { $id:req.params.id }); if (!comment || comment.user_id !== req.session.userId) return fail(res, 403, 'You can only delete your own comments.'); run('DELETE FROM comments WHERE id=$id', { $id:req.params.id }); res.json({ok:true}); });
  app.use('/api', (err, req, res, next) => { console.error(err); fail(res, 500, 'Something went wrong on the server.'); });
}

start().catch((error) => { console.error(error); process.exit(1); });
