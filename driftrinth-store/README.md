# Stripes Mod Store

A mod store for [Driftrinth](https://github.com/stripesvr), hosted free on GitHub Pages.

## Publish it

1. Create a public GitHub repository named `driftrinth-store` on the `stripesvr` account.
2. Upload everything in this folder to it.
3. In the repository, open **Settings > Pages**, set the source to **Deploy from a branch**, and choose `main` and `/ (root)`.
4. After a minute or two, this address works: `https://stripesvr.github.io/driftrinth-store/manifest.json`
5. In Driftrinth, open **Settings > Mod store**, enter `https://stripesvr.github.io/driftrinth-store/`, and press **Save and load**.

## Add a mod

Only add mods you made or have the creator's permission to share. The repository is public, so anyone can download them.

```
python add_mod.py "C:\path\to\MyMod" --name "My Mod" --creator stripesvr --version 1.0.0 --summary "What it does" --tags visuals,fun
```

The folder needs a matching `.utoc`, `.ucas` and `.pak`. Run the command again with the same name to update a mod, then push the changes.
