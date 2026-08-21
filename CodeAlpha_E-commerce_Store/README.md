# Fieldwork Supply Co.

Basic e-commerce store built with HTML, CSS, JavaScript, Express, and SQLite.

## Run locally

```bash
npm install
npm start
```

With the server running, open [http://localhost:3000](http://localhost:3000) in your browser. This local link works only on the computer running the project.

The server creates `store.db` on first start and seeds the product catalog. API routes are available at `/api/products`, `/api/auth/register`, `/api/auth/login`, `/api/orders`, and `/api/orders` (`POST`). Passwords are hashed with Node's `scrypt`, and order totals are calculated from database prices rather than trusting client values.