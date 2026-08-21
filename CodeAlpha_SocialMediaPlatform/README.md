# CodeAlpha Task 2 - Social Media Platform

A complete, beginner-friendly social media platform built for the CodeAlpha Full Stack Development Internship. Socially lets users create accounts, share notes, discover people, and have conversations in a responsive web interface.

## Features

- Session-based registration, login, and logout
- Bcrypt password hashing and input validation
- User profiles with avatars, bio, post, follower, and following counts
- Create and browse newest-first posts
- Like/unlike posts with duplicate protection
- Comment on posts
- Search users and follow/unfollow them
- Foreign-key SQLite database persisted as `social.db`
- Responsive desktop, tablet, and mobile UI

## Technology Stack

- Frontend: HTML5, CSS3, vanilla JavaScript, Fetch API
- Backend: Node.js and Express.js
- Database: SQLite-compatible `sql.js`
- Security: `bcryptjs` and `express-session`

## Project Structure

```text
public/index.html  Frontend markup
public/style.css   Responsive visual design
public/app.js      Frontend interactions and API calls
server.js          Express server, database setup, and REST API
package.json       Dependencies and npm scripts
```

## Installation

Requirements: Node.js 18 or newer.

```bash
npm install
```

## How to Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). The first run creates `social.db`, which is ignored by Git. Sessions are held in memory and expire after seven days.

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/register` | Register and start a session |
| POST | `/api/login` | Authenticate a user |
| POST | `/api/logout` | Destroy the current session |
| GET | `/api/me` | Get the authenticated profile |
| GET | `/api/posts` | List posts with likes and comments |
| POST | `/api/posts` | Create a post |
| POST | `/api/posts/:id/like` | Toggle a like |
| POST | `/api/posts/:id/comments` | Add a comment |
| GET | `/api/users/:id` | Get a user profile |
| POST | `/api/users/:id/follow` | Toggle following |
| GET | `/api/search?q=username` | Search users |

## Database

The application creates `users`, `posts`, `comments`, `likes`, and `follows` tables at startup. Foreign keys protect related records, and unique constraints prevent duplicate likes and follows.

## Screenshots

Run the app locally and capture screenshots of the login page and dashboard here.

## Future Improvements

- Image uploads and post attachments
- Pagination and feed ranking
- Email verification and password reset
- Notifications and direct messages

## GitHub Preparation

Do not upload `node_modules/`, `social.db`, or `.env`.

```bash
git init
git add .
git commit -m "Add Task 2 Social Media Platform"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```
