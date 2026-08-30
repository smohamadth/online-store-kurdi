"""
Find admin WRITE operations whose failure is invisible to the user.

Pattern that caused the worst bugs in this project: a POST/PUT/DELETE wrapped
in try/catch where the catch only console.logs, or where a non-ok response is
never checked. The admin sees no error and assumes the change was saved.
"""
import sys
import glob
import re

files = sorted(glob.glob('apps/web/app/admin/**/*.tsx', recursive=True))
problems = []

for f in files:
    src = open(f).read()
    lines = src.split('\n')

    for i, line in enumerate(lines):
        is_write = (
            re.search(r"method:\s*'(POST|PUT|DELETE|PATCH)'", line)
            or re.search(r"authHttp\.(post|put|delete|patch)\(", line)
        )
        if not is_write:
            continue

        # look ahead for how the result is handled. "Surfaces" means the
        # error reaches the user: a dialog/notification, a re-throw, or a
        # state setter whose name says message/error and which the page
        # renders (the admin pages use setMsg/setMessage/setLoadError/...
        # and display the state as a banner, so match that whole family
        # rather than an ever-growing list of individual names).
        window = '\n'.join(lines[i:i + 30])
        surfaces = bool(
            re.search(
                r"alert\(|notify\(|throw |set[A-Za-z]*(Message|Msg|Error|Errors|Alert)\(",
                window,
            )
        )
        checks_ok = bool(re.search(r"res\.ok|response\.ok|!res\.ok|!response\.ok", window))
        uses_client = 'authHttp.' in line

        # authHttp throws on failure, so it's safe *if* something surfaces it
        if uses_client and surfaces:
            continue
        if checks_ok and surfaces:
            continue

        problems.append((f, i + 1, line.strip()[:80], surfaces, checks_ok))

print(f"admin write operations scanned in {len(files)} files")
print(f"potentially silent failures: {len(problems)}\n")
for f, ln, snippet, surfaces, checks in problems:
    page = f.split('/admin/')[1]
    print(f"  {page}:{ln}")
    print(f"     {snippet}")
    print(f"     surfaces_error={surfaces} checks_response={checks}")

# Fail the build when problems are found.
#
# This previously always exited 0, so a CI job running it would go green even
# while reporting silent write failures - the exact bug class this script
# exists to catch.
sys.exit(1 if problems else 0)
