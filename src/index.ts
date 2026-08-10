import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { nanoid } from "nanoid";

export class App extends DurableObject {
  private app = new Hono();

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.initializeDatabase();
    this.setupRoutes();
  }

  private initializeDatabase() {
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT, description TEXT, price TEXT, image_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    const hasSettings = this.ctx.storage.sql.exec("SELECT count(*) as count FROM settings").one().count as number;
    if (hasSettings === 0) {
      const defaults = [
        ['store_name', 'Essence Perfumaria'],
        ['store_whatsapp', '5531996831731'],
        ['store_address', 'Belo Horizonte, MG'],
        ['hero_title', 'A essência da sua personalidade'],
        ['hero_subtitle', 'Fragrâncias exclusivas para você.'],
        ['admin_password', 'admin123']
      ];
      for (const [key, value] of defaults) {
        this.ctx.storage.sql.exec("INSERT INTO settings (key, value) VALUES (?, ?)", key, value);
      }
    }
  }

  private setupRoutes() {
    this.app.get("/api/settings", (c) => {
      const rows = this.ctx.storage.sql.exec("SELECT key, value FROM settings").toArray();
      return c.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
    });

    this.app.get("/api/products", (c) => {
      return c.json(this.ctx.storage.sql.exec("SELECT * FROM products ORDER BY created_at DESC").toArray());
    });

    this.app.post("/api/admin/login", async (c) => {
      const { password } = await c.req.json();
      const stored = this.ctx.storage.sql.exec("SELECT value FROM settings WHERE key = 'admin_password'").one().value;
      return password === stored ? c.json({ ok: true, token: nanoid() }) : c.json({ ok: false }, 401);
    });

    this.app.post("/api/admin/settings", async (c) => {
      const updates = await c.req.json();
      for (const [key, value] of Object.entries(updates)) {
        this.ctx.storage.sql.exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value);
      }
      return c.json({ ok: true });
    });

    this.app.post("/api/admin/products", async (c) => {
      const p = await c.req.json();
      const id = p.id || nanoid();
      this.ctx.storage.sql.exec("INSERT OR REPLACE INTO products (id, name, description, price, image_url) VALUES (?, ?, ?, ?, ?)", id, p.name, p.description, p.price, p.image_url);
      return c.json({ ok: true, id });
    });

    this.app.delete("/api/admin/products/:id", (c) => {
      this.ctx.storage.sql.exec("DELETE FROM products WHERE id = ?", c.req.param("id"));
      return c.json({ ok: true });
    });
  }

  async fetch(request: Request) { return this.app.fetch(request); }
}

export default {
  async fetch(request: Request, env: any) {
    const id = env.APP.idFromName("global");
    return env.APP.get(id).fetch(request);
  }
};
