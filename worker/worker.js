// Upload API for the mod store. upload.html sends a repacked mod zip and its
// details here; if the password matches, this commits the zip and the
// manifest entry to the repository. The password and GitHub token are Worker
// secrets, so neither ever reaches the browser or the repository.

const LIMIT = 100 * 1024 * 1024; // GitHub rejects larger single files

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname;
    if (request.method !== "POST" || (path !== "/upload" && path !== "/login")) return reply(404, { error: "Not found" });

    let form;
    try { form = await request.formData(); } catch { return reply(400, { error: "Bad request." }); }
    if (!(await passwordOk(form.get("password"), env.UPLOAD_PASSWORD))) {
      await new Promise(r => setTimeout(r, 1500)); // slow down guessing
      return reply(401, { error: "Wrong password." });
    }
    if (path === "/login") return reply(200, { ok: true, mods: (await readStore(env)).manifest.mods });

    try {
      return reply(200, await release(form, env));
    } catch (e) {
      return reply(e.status || 500, { error: e.message });
    }
  },
};

// Compare digests so the check takes the same time whatever was typed.
async function passwordOk(given, expected) {
  if (typeof given !== "string" || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map(s => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const fail = (status, message) => Object.assign(new Error(message), { status });

async function gh(env, path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${env.STORE_GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "driftshop-upload",
    },
  });
  if (!r.ok) {
    const msg = (await r.json().catch(() => ({}))).message || "";
    throw fail(r.status === 422 || r.status === 409 ? 409 : 502, `GitHub ${opts.method || "GET"} ${path}: ${r.status} ${msg}`);
  }
  return r.json();
}

function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const b64utf8 = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), c => c.charCodeAt(0)));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const text = (form, key, max = 200) => String(form.get(key) || "").trim().slice(0, max);

async function readStore(env) {
  const ref = await gh(env, `/git/ref/heads/${env.BRANCH}`);
  const file = await gh(env, `/contents/manifest.json?ref=${ref.object.sha}`);
  return { head: ref.object.sha, manifest: JSON.parse(b64utf8(file.content)) };
}

async function release(form, env) {
  const name = text(form, "name", 80), creator = text(form, "creator", 80);
  const file = form.get("file");
  if (!name || !creator) throw fail(400, "Name and creator are required.");
  if (!file || typeof file === "string") throw fail(400, "Choose a zip first.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > LIMIT) throw fail(413, "The zip is over GitHub's 100 MB file limit.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw fail(400, "That file isn't a zip.");

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!/^[A-Za-z0-9][\w.\-]{0,79}$/.test(id)) throw fail(400, "That name can't be turned into an id. Use letters or numbers.");

  const { head, manifest } = await readStore(env);
  const commit = await gh(env, `/git/commits/${head}`);
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const summary = text(form, "summary", 300), about = text(form, "about", 5000);

  // Keep an existing entry's id (it may differ in case) so updates replace it.
  const prev = manifest.mods.find(m => m.id.toLowerCase() === id || m.name.toLowerCase() === name.toLowerCase());
  const modId = prev ? prev.id : id;
  const path = `mods/${modId}/${modId}.zip`;
  const entry = {
    id: modId, name, creator,
    version: text(form, "version", 40) || "1.0.0",
    summary, description: about || summary,
    tags: text(form, "tags", 300).split(",").map(t => t.trim()).filter(Boolean),
    updated: now,
    files: [{ name: `${modId}.zip`, url: path, bytes: bytes.length, sha256: hex(await crypto.subtle.digest("SHA-256", bytes)) }],
  };
  const mods = manifest.mods.filter(m => m !== prev);
  if (prev) mods.splice(manifest.mods.indexOf(prev), 0, entry); else mods.push(entry);

  const blob = content => gh(env, "/git/blobs", { method: "POST", body: JSON.stringify({ content, encoding: "base64" }) });
  const tree = [
    { path, mode: "100644", type: "blob", sha: (await blob(b64(bytes))).sha },
    { path: "manifest.json", mode: "100644", type: "blob", sha: (await blob(b64(new TextEncoder().encode(JSON.stringify({ ...manifest, updated: now, mods }, null, 2) + "\n")))).sha },
  ];
  // Drop the old zip if an earlier entry lived at a different path.
  const oldUrl = prev?.files?.[0]?.url;
  if (oldUrl && oldUrl !== path) tree.push({ path: oldUrl, mode: "100644", type: "blob", sha: null });

  const newTree = await gh(env, "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree }) });
  const newCommit = await gh(env, "/git/commits", { method: "POST", body: JSON.stringify({ message: `${prev ? "Update" : "Add"} ${name} ${entry.version}`, tree: newTree.sha, parents: [head] }) });
  await gh(env, `/git/refs/heads/${env.BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });

  return { ok: true, updated: !!prev, entry, mods };
}
