# RGU Robotics Lab: equipment status and booking (prototype)

RobCo team project for James Philp, RGU. Prototype with demo data. Not a production system.

## First time on a new computer

Run these inside the project folder:

```bash
npm install
cp .env.example .env
npm run db:setup   # creates dev.db and seeds demo data
npm run dev        # then open http://localhost:3000
```

Open **http://localhost:3000**, not the "Network" address `npm run dev` also prints. The network address triggers "Blocked cross-origin request" warnings.

## Getting the latest version (every time someone pushes)

Stop `npm run dev` first (Ctrl+C), then:

```bash
git checkout -- package-lock.json   # drop npm's own edit to this file, or git pull refuses
git pull
npm install                         # needed: new versions can change packages (e.g. the Next.js security fix)
npm run db:update                   # applies database changes, rebuilds the database client, reloads demo data
npm run dev
```

Skipping `npm install` leaves you on old packages even though the code is new. Skipping `npm run db:update` gives database errors on pages that use new fields.

`npm run db:update` and `npm run demo:reset` replace the demo data. Bookings you made locally are lost; that is expected in this prototype.

## Other commands

```bash
npm test             # clash, status, date and inventory rules
npm run demo:reset   # fresh demo data relative to "now": run shortly before a demo so every status shows
```

## If something goes wrong

| What you see | Fix |
| --- | --- |
| `@prisma/client did not initialize yet` | Run `npm run db:update` (or `npm run db:setup` on a first install) |
| A page error mentioning a missing column, e.g. `assetId` | Run `npm run db:update` |
| `git pull` says local changes to `package-lock.json` would be overwritten | Run `git checkout -- package-lock.json`, then `git pull` again |
| "Blocked cross-origin request" in the terminal | Use http://localhost:3000 instead of the network address |
| The site shows old equipment (robot arms A/B, 3D printer) | Run `npm run db:update` to load the real inventory |

## Where things live

| What | File |
| --- | --- |
| The lab's inventory (from James's spreadsheet; one unit per robot) | `prisma/inventory.ts` |
| Lab rules (hours, slot size, max length) | `src/lib/config.ts` |
| Clash check, status and validation (pure, tested) | `src/lib/booking.ts`, `src/lib/booking.test.ts` |
| Who can do what | `src/lib/permissions.ts` |
| Pretend login (role switcher); swap for real sign-in here | `src/lib/session.ts` |
| All writes | `src/app/actions.ts` |
| RGU theme (colours from rgu.ac.uk, Outfit in place of Zona Pro) | `src/app/globals.css` |

Times are stored in UTC and shown in Europe/London.

## Hosting later

The SQLite file does not survive on Vercel. For a shareable link, set `provider = "postgresql"` in `prisma/schema.prisma`, point `DATABASE_URL` at a free Neon database, and run a fresh migration. The clash check relies on SQLite running one write at a time; on Postgres, add a lock or a database constraint so two simultaneous bookings cannot both pass.
