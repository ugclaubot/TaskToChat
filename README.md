# TaskToChat

A Telegram-based task tracking and reminder system for team management.

## Features

- **Task Creation via Telegram** — Send `task: @Name description by Friday` in any group chat
- **WhatsApp Reminders** — Morning (9 AM) & evening (7 PM) IST via `wacli`
- **Manager Summary** — Daily consolidated Telegram report for the manager
- **Web Dashboard** — Browse all tasks at `http://localhost:3000`
- **Task Management** — `/done`, `/tasks`, `/overdue`, `/mytasks` commands

## Setup

### 1. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
MANAGER_TELEGRAM_ID=your_telegram_user_id
MANAGER_NAME=Udit
MANAGER_WHATSAPP=919810000000
PORT=3000
```

> **Important:** TaskToChat requires its **own dedicated bot token**, separate from any other bots you run (like OpenClaw). Telegram only allows one active long-polling connection per bot. Create a new bot via [@BotFather](https://t.me/BotFather) on Telegram.

### 2. Install dependencies

```bash
npm install
```

### 3. Build and run

```bash
npm run build && npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Telegram Commands

| Command | Description |
|---------|-------------|
| `task: @Name desc by DATE` | Create a task |
| `/tasks` | All pending tasks (grouped by person) |
| `/tasks @person` | Tasks for a specific person |
| `/mytasks` | Your own tasks (matched by Telegram username) |
| `/done <ID>` | Mark a task complete by ID |
| `/done keywords` | Mark a task complete by keyword search |
| `/overdue` | Show all overdue tasks |
| `/addemployee Name @username 91XXXXXXXXXX` | Add an employee (manager only) |
| `/employees` | List all employees |

## Task Creation Formats

```
task: @JohnDoe Review the quarterly report by Friday !high
task: @JohnDoe Review the quarterly report by Friday
task: John Doe - Review quarterly report - due March 25
#task @Jane submit the invoice by tomorrow !low
```

Priority flags: `!high`, `!medium` (default), `!low`

## WhatsApp Prerequisites

`wacli` must be installed and configured on the system. Numbers must be in format `91XXXXXXXXXX` (no `+` prefix).

Test with:
```bash
wacli send text --to 919810000000 --message "Test message"
```

## Architecture

- **Runtime:** Node.js + TypeScript
- **Database:** SQLite via `better-sqlite3` (stored in `data/tasktochat.db`)
- **Telegram:** Telegraf library (long-polling)
- **WhatsApp:** Shell exec to `wacli` CLI
- **Cron:** `node-cron` (IST timezone)
- **Web:** Express.js + EJS templates + Tailwind CSS (CDN)

## File Structure

```
src/
├── index.ts              # Entry point
├── config.ts             # Environment config
├── database.ts           # SQLite init & migrations
├── models/
│   ├── employee.ts       # Employee CRUD
│   └── task.ts           # Task CRUD
├── bot/
│   ├── index.ts          # Telegraf setup
│   ├── commands.ts       # Slash command handlers
│   └── taskParser.ts     # Natural language task parsing
├── reminders/
│   ├── cron.ts           # Cron job scheduling
│   ├── whatsapp.ts       # wacli integration
│   └── templates.ts      # Message templates
└── web/
    ├── server.ts         # Express setup
    ├── routes.ts         # Dashboard routes
    └── views/
        └── dashboard.ejs # Dashboard template
```

## TODO

- [ ] Task completion via WhatsApp reply (future phase)
  - Would require a webhook receiver or polling mechanism for wacli incoming messages
  - Parse "1 done" or "done 1" replies and mark corresponding task complete
  - Map WhatsApp number back to employee and their pending task list
