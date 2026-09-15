# Vislang 0.1 CLI demo

From the repository root, with Node.js 22+:

```bash
npm install
node examples/demo/run-demo.mjs
```

The script creates a temporary directory, runs `init` and `validate`, adds an optional role to a copy of the constitution, runs `diff`, then deletes the temporary files.

It does not write `vislang.json` into this repository.
