# CodeAlpha Tasks

Full-stack projects completed for the CodeAlpha internship. Each project is
isolated in its own folder with its own dependencies and startup instructions.

## Projects

| Task | Project | Status | Documentation |
| --- | --- | --- | --- |
| 1 | E-commerce Store | Complete | [Open project](CodeAlpha_E-commerce_Store/) |
| 2 | Social Media Platform | Complete | [Open project](CodeAlpha_SocialMediaPlatform/) |
| 3 | Project Management Tool | Complete | [Open project](CodeAlpha_ProjectManagementTool/) |
| 4 | Real-Time Communication App | Planned | - |

## Run A Project

Open a project folder in a terminal, install its dependencies, and start its
server:

```powershell
cd CodeAlpha_ProjectManagementTool
npm install
npm start
```

Each application uses `http://localhost:3000` by default. Stop the server with
`Ctrl+C` before starting another project on the same port.

## Repository Standards

- Generated databases, `node_modules`, and environment files are excluded from Git.
- Every project includes a README with features, setup instructions, and API details.
- Dependencies are managed locally within each project folder.