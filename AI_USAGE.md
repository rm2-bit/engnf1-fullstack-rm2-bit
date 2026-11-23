# AI_USAGE.md

## Tools used during the 2-day window

- **Claude (Anthropic):** Used for initial project scaffolding, generating first drafts of the frontend, backend, SQL schema, seed scripts, helper scripts, and documentation.
- **ChatGPT (OpenAI):** Used for understanding code, analyzing errors, debugging assistance, reviewing implementation approaches, Git guidance, and deployment troubleshooting.
- **Code Editor:** [Mention your editor, such as VS Code.]

## What AI was used for

- Generating the initial project structure and code drafts.
- Understanding and analyzing application logic and code implementation.
- Getting suggestions for fixing bugs and resolving errors.
- Reviewing backend API logic, database queries, and frontend-backend communication.
- Understanding deployment configuration and environment variables.
- Getting assistance with documentation and Git workflows.

## Verification and overrides

During backend deployment on Render, the application initially failed with a `Cannot find module` error.

Instead of blindly accepting the suggested configuration, I inspected the repository structure and identified that the backend code was inside the `backend/` directory. I corrected the Render Root Directory to `backend` and configured the start command as `node src/server.js`.

After redeployment, I tested the `/api/health` endpoint and confirmed that the backend was responding successfully.

I also analyzed code suggestions, checked their logic against the actual application requirements, and made corrections where necessary rather than accepting every AI-generated suggestion.

## My own work

- Analyzed the generated code and understood the purpose and flow of the frontend and backend components.
- Wrote and modified code to implement and improve application functionality.
- Debugged errors by examining terminal output, error messages, and application behavior.
- Reviewed and corrected implementation logic instead of blindly copying AI-generated code.
- Worked with the database setup, SQL schema, and seed process.
- Tested application functionality during local development.
- Configured the Neon PostgreSQL database and connected it to the backend.
- Set up backend deployment on Render and frontend deployment on Vercel.
- Configured environment variables, CORS, and frontend-backend communication.
- Created and maintained the GitHub repository and pushed the project.
- Verified the deployed backend health endpoint and checked the live application.

AI tools were used as development assistants, not as replacements for my own work. I took responsibility for understanding, modifying, debugging, testing, and deploying the application.
