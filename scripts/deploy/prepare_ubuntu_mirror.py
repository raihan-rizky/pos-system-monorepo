"""Use Ubuntu's public archive when a runner has the Azure mirror configured."""

from pathlib import Path
import re


AZURE_ARCHIVE = re.compile(
    r"(?P<scheme>https?://)azure\.archive\.ubuntu\.com(?=/ubuntu(?:/|\s|$))"
)
DEFAULT_SOURCES = (
    Path("/etc/apt/apt-mirrors.txt"),
    Path("/etc/apt/sources.list.d/ubuntu.sources"),
    Path("/etc/apt/sources.list"),
)


def rewrite_mirrors(paths):
    for path in paths:
        path = Path(path)
        if not path.exists():
            continue
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Unsupported Ubuntu source file: {path}")
        original = path.read_text(encoding="utf-8")
        updated = AZURE_ARCHIVE.sub(r"\g<scheme>archive.ubuntu.com", original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")


if __name__ == "__main__":
    rewrite_mirrors(DEFAULT_SOURCES)
