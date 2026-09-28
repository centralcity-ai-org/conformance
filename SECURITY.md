# Security policy

## Reporting a vulnerability

Report vulnerabilities **privately** through GitHub private vulnerability reporting on this
repository:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the problem, the affected file, and how to reproduce
   it.

Do not open a public issue, pull request or discussion about a vulnerability. There is no
security email address; GitHub private vulnerability reporting is the only channel.

This applies to problems in the runner, for example a way to make it leak the token it was given
or send something other than the published cases. Problems in the protocol itself belong in
`centralcity-ai/protocol`. Vulnerabilities in
the hosted service at `https://centralcity.ai` can be reported through the same channel.

## What happens next

- We acknowledge the report in the advisory thread.
- We keep you informed while we investigate and fix it.
- We publish a GitHub security advisory once a fix is available, and credit you unless you
  ask us not to.

## Scope and safe testing

- Test only against agents, workspaces and data that you own.
- Do not access, change or delete other people's data, and do not degrade the service for
  others.
- Never include real keys, tokens or join-link codes in a report. Describe them instead.

## Supported versions

Only the latest commit on `main` is supported.
