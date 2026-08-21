# CodeAlpha Task 3 - Project Management Tool

Orbit is a beginner-friendly full-stack project management tool inspired by Trello and Asana. Teams can create project spaces, invite members, manage task cards across a board, and communicate in task comments.

## Features

- Session-based registration, login, logout, and protected REST APIs
- Hashed passwords with bcryptjs
- SQLite-compatible persistence through sql.js
- Project creation, editing, deletion, ownership, and membership
- TODO, IN PROGRESS, and DONE board columns
- Task assignment, descriptions, priorities, due dates, status editing, and deletion
- Overdue date indicators
- Task comments with author-only deletion
- Socket.IO notifications and live task updates for connected project members
- Dashboard statistics and responsive mobile layout

## Technology Stack

- HTML5, CSS3, vanilla JavaScript, Fetch API
- Node.js and Express.js
- express-session, bcryptjs, sql.js, Socket.IO

## Project Structure

```text
public/index.html   Application shell
public/style.css    Responsive UI styles
public/app.js       Frontend views and API calls
server.js           Express server, auth, database, and REST API
social.db           Generated local database (ignored by git)
```

## Database

The server creates `users`, `projects`, `project_members`, `tasks`, and `comments` tables on first start. Foreign keys cascade project deletion to tasks, comments, and memberships. The local database is exported to `social.db` after writes.

## API Endpoints

| Area | Routes |
| --- | --- |
| Auth | `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/me` |
| Projects | `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id` |
| Members | `GET/POST /api/projects/:id/members`, `DELETE /api/projects/:id/members/:userId` |
| Tasks | `GET/POST /api/projects/:projectId/tasks`, `PUT/DELETE /api/tasks/:id` |
| Comments | `GET/POST /api/tasks/:id/comments`, `DELETE /api/comments/:id` |
| Users | `GET /api/users`, `GET /api/users/:id` |

All application APIs require an authenticated session except `POST /api/register`, `POST /api/login`, and `GET /api/me`.

## Installation and Running

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). To use a different port, set `PORT` before starting. For production, set a strong `SESSION_SECRET` environment variable.

## Testing Checklist

Register two users, create a project, add the second user as a member, create and assign tasks, move tasks between columns, edit and delete a task, add and delete comments, and delete the project. Opening API routes without a session should return `401`.

## Future Improvements

Drag-and-drop task movement, file attachments, activity history, and a production database adapter would be natural next steps.
