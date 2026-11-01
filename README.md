# Stripes Mod Store

A mod store for [Driftrinth](https://github.com/stripesvr), hosted free on GitHub Pages.

## Publish it

The store files (`manifest.json`, `add_mod.py`, this README, `.nojekyll` and the `mods/` folder) live at the root of the `stripesvr/riftrinth-store` repository.

1. In the repository, open **Settings > Pages**, set the source to **Deploy from a branch**, and choose `main` and `/ (root)`.
2. After a minute or two, this address works: `https://stripesvr.github.io/riftrinth-store/manifest.json`
3. In Driftrinth, open **Settings > Mod store**, enter `https://stripesvr.github.io/riftrinth-store/`, and press **Save and load**.

The store address is `https://stripesvr.github.io/riftrinth-store/`. If the repository is renamed to `driftrinth-store`, it changes to `https://stripesvr.github.io/driftrinth-store/`, so update it in Driftrinth too.

The empty `.nojekyll` file makes GitHub Pages serve every file as is. Keep it.

## Add a mod

Only add mods you made or have the creator's permission to share. The repository is public, so anyone can download them.

```
python add_mod.py "C:\path\to\MyMod" --name "My Mod" --creator stripesvr --version 1.0.0 --summary "What it does" --tags visuals,fun
```

The folder or `.zip` needs a matching `.utoc`, `.ucas` and `.pak`. Run it from your clone of this repository, since it writes `mods/` and `manifest.json` next to itself. Run the command again with the same name to update a mod, then push the changes.

## Publish from the browser

Open `upload.html` on the store site (for example `https://driftshop.stripes.lol/upload.html`), enter the upload password, drop the mod zip, fill in the details and press **Release**. The page repacks the zip and sends it to the upload Worker in `worker/`, which checks the password, works out the size and sha256, and commits the zip and manifest entry, just like `add_mod.py`.

The password and the GitHub token are Cloudflare Worker secrets. They are never in this repository or the page. `.github/workflows/deploy-worker.yml` deploys the Worker to `https://driftshop-upload.wannabeweirdguy.workers.dev` and needs these repository secrets (**Settings > Secrets and variables > Actions**):

- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, the same as Nonce-Gen uses
- `UPLOAD_PASSWORD`, the password people type on the page
- `STORE_GITHUB_TOKEN`, a [fine-grained token](https://github.com/settings/personal-access-tokens/new) limited to this repository with **Contents: Read and write**

To change the password, update `UPLOAD_PASSWORD` and re-run the workflow from the **Actions** tab.
