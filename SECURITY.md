# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1 | Yes |

Only the current `main` implementation of Vislang 0.1 is supported.

## What this project does and does not do

Vislang 0.1 is a local, deterministic CLI and library. It:

- reads constitution JSON from the filesystem or stdin
- validates structure against a JSON Schema and spec rules
- optionally reads a referenced DTCG JSON file from the constitution directory
- classifies constitution changes

It does not make network requests, load plugins, evaluate constitution content as code, or execute shell commands as part of validation.

## Reporting a vulnerability

Do not file a public issue for a security problem.

Preferred path:

1. Use GitHub's private vulnerability reporting for this repository, if it is enabled (`Security` → `Advisories` / `Report a vulnerability`).
2. If that path is not available, contact the repository owner through GitHub without attaching exploit payloads in a public issue.

Please include:

- affected commit SHA or branch
- a short description of the issue
- steps to reproduce
- expected vs actual behavior
- whether the issue is triggered by a constitution file, a DTCG file, CLI flags, or path handling

## Disclosure

Please give the maintainer time to investigate and ship a fix before public discussion.

Reports that only affect postponed features (YAML, adapters, evidence/`check`, hosted services, browser inspection) are out of scope for 0.1 unless they can be triggered by the current tool.
