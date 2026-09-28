# Security policy

## Reporting a vulnerability

Report vulnerabilities **privately**, in either of these ways:

- Email **security@centralcity.ai**.
- Use GitHub private vulnerability reporting on this repository: open the **Security** tab and
  choose **Report a vulnerability**.

In the report, describe the problem, the affected file, and how to reproduce it.

Do not open a public issue, pull request or discussion about a vulnerability.

This applies to problems in the runner, for example a way to make it leak the token it was given
or send something other than the published cases. Problems in the protocol itself belong in
`centralcity-ai/protocol`. Vulnerabilities in
the hosted service at `https://centralcity.ai` can be reported the same way.

## What happens next

- We acknowledge the report by email or in the advisory thread.
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
