"""GitHub Actions annotation helpers for the browser regression scripts.

The raw Actions job log is not reliably retrievable through the API (the log
blob endpoint intermittently returns EOF), but check-run annotations always
are. So every failure these scripts detect must be emitted as an annotation,
otherwise a red build says nothing but "exit code 1".
"""
import os


def _on_ci() -> bool:
    return os.environ.get("GITHUB_ACTIONS") == "true"


def _flat(text: str, limit: int) -> str:
    return (text or "").replace("\r", " ").replace("\n", " ")[:limit]


def annotate_failure(script: str, name: str, detail: str = "") -> None:
    """Report one failed assertion."""
    if _on_ci():
        print(f"::error title={script}: {name}::{_flat(detail, 800)}")


def annotate_crash(script: str, exc: BaseException) -> None:
    """Report an unhandled exception (e.g. a Playwright locator timeout).

    These abort the script before any assertion runs, so without this the job
    reports no reason at all.
    """
    import traceback
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    print(tb)
    if _on_ci():
        # Keep the TAIL: the useful line (the actual error) is at the end.
        print(f"::error title={script} crashed::{_flat(tb, 10**9)[-900:]}")


def install(script: str) -> None:
    """Annotate any unhandled exception from this script.

    Uses sys.excepthook so scripts don't need a try/except wrapper around
    their whole body (which would mean reindenting them).
    """
    import sys
    previous = sys.excepthook

    def hook(kind, value, tb):
        annotate_crash(script, value)
        previous(kind, value, tb)

    sys.excepthook = hook


# The Appearance screen's homepage block editor lives behind an ARIA tab
# labelled "Homepage" (it used to be a button reading "Home page"). Kept here
# so the three suites that open it share one definition.
import re as _re

HOME_TAB = _re.compile(r"Home\s*page", _re.I)


def open_home_tab(page, settle_ms: int = 2500) -> None:
    """Open the Appearance > Homepage tab and wait for the blocks to render."""
    page.get_by_role("tab", name=HOME_TAB).click()
    page.wait_for_timeout(settle_ms)
