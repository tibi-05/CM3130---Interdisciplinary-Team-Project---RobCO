# RGU Robotics Lab: equipment status and booking (prototype)

RobCo team project for James Philp, RGU. Prototype with demo data. Not a production system.

## Run it

```bash
npm install
cp .env.example .env
npm run db:setup   # creates dev.db and seeds demo data
npm run demo:reset 
npm run dev        # http://localhost:3000
npm test           # clash and status rules
```

Run `npm run db:reset` shortly before a demo so every status (free, booked, in use, overdue, out of service) shows on screen.

## Where things live

| What | File |
| --- | --- |
| Lab rules (hours, slot size, max length) | `src/lib/config.ts` |
| Clash check, status and validation (pure, tested) | `src/lib/booking.ts`, `src/lib/booking.test.ts` |
| Who can do what | `src/lib/permissions.ts` |
| Pretend login (role switcher); swap for real sign-in here | `src/lib/session.ts` |
| All writes | `src/app/actions.ts` |
| RGU theme (colours from rgu.ac.uk, Outfit in place of Zona Pro) | `src/app/globals.css` |

Times are stored in UTC and shown in Europe/London.

## Hosting later

The SQLite file does not survive on Vercel. For a shareable link, set `provider = "postgresql"` in `prisma/schema.prisma`, point `DATABASE_URL` at a free Neon database, and run a fresh migration.
