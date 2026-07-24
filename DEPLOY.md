# Putting Retail Manager online (usable from anywhere)

Right now the app runs on your PC and is reachable on your own Wi-Fi. To make it
usable **from any device on any network** — like a normal web app — it needs to
live on a server that's always online (this is called "hosting" or "deploying").

**Read this first — it matters:**

1. **A login is now built in.** The first person to open the hosted app creates
   the owner account (username + password). After that, nobody can see or change
   your shop data without signing in. You can also add staff logins from inside
   the app (sidebar → "Add staff login"). **Do not share the address publicly and
   still expect privacy — the login is what protects you.** Use a strong password.
2. **This step is the one technical part.** If you're not comfortable with it, it's
   a ~30–60 minute job for any tech-savvy friend or a freelance developer — hand
   them this folder and this file.
3. **It usually costs a small monthly fee** (around US $7–8/month) if you want it
   always-on with your data safely saved. A free option exists too, but with real
   trade-offs (see Option B). Prices change — check the host's pricing page.

---

## Option A — Host it online (recommended: always-on, works even with your PC off)

This uses **Render** (render.com), a beginner-friendly host. The project already
includes a `Dockerfile`, so Render knows how to run it.

### Why it's not free for real use
Render's free web services go to sleep after 15 minutes of inactivity and — more
importantly — **do not keep your data safely** (their free storage is wiped on
restarts). For a real shop you want a small paid service plus a "persistent disk"
that safely stores your database file. That's roughly **$7/month** for the service
plus about **$0.25 per GB/month** for the disk (1 GB is plenty). Check
<https://render.com/pricing> for current numbers.

### Steps
1. **Put the project on GitHub.** Create a free account at <https://github.com>,
   make a new repository, and upload this whole `retail-manager` folder to it.
   (GitHub's website has an "upload files" button — no commands needed.)
2. **Create a Render account** at <https://render.com> and connect it to your
   GitHub.
3. **New → Web Service**, and pick your `retail-manager` repository. Render will
   detect the `Dockerfile` automatically.
4. **Choose a paid instance** (the "Starter" size is fine for a shop).
5. **Add a persistent disk** (in the creation form, click **Advanced**):
   - **Mount path:** `/data`
   - **Size:** 1 GB
   This is where your shop's database is safely stored.
6. **Add environment variables:**
   - `NODE_ENV` = `production`
   - `DB_PATH` = `/data/retail.db`
7. Click **Create**. After a few minutes Render gives you a public address like
   `https://your-shop.onrender.com`.
8. **Open that address on any device, anywhere.** The first time, it asks you to
   create your owner account. Done — your shop is now online and private.

### Backups
Render automatically snapshots the disk daily. For your own peace of mind, you can
also periodically make a sale-free export (ask a developer to copy
`/data/retail.db` off the server, or add an export button — I can build one).

---

## Option B — Free, but your PC must stay on (a "tunnel")

If you'd rather not pay, you can keep running the app on your PC (double-click
`Start Retail Manager.bat` as usual) and use a free **Cloudflare Tunnel** to give
it a public web address. Trade-offs: **your PC must be switched on and running the
app** for it to work, and setting up the tunnel is a one-time technical task.

The short version (for whoever sets it up):
1. Install `cloudflared` on the PC.
2. Run `cloudflared tunnel --url http://localhost:4000`.
3. It prints a public `https://…trycloudflare.com` address that works from any
   network. (For a permanent address, set up a named tunnel with a Cloudflare
   account and your own domain.)

The login still protects your data here, exactly the same way.

---

## Which should you choose?

- **Want it to "just work" from anywhere, even with your PC off, and don't mind
  ~$7/month?** → Option A (Render).
- **Want $0 and don't mind leaving your PC on and running the app?** → Option B
  (tunnel).

Either way, the app itself is ready — the login and the online-storage settings
are already built in. Nothing more to change in the code.
