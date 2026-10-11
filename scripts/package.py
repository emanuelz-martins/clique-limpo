"""Build manual-install and store-upload archives without third-party packages."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
EXTENSION = ROOT / "clique-limpo"
OUTPUT = ROOT / "dist"


def archive(destination, files):
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for source, name in sorted(files, key=lambda item: item[1]):
            info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, source.read_bytes(), compresslevel=9)


def main():
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    OUTPUT.mkdir(exist_ok=True)
    extension_files = []
    for source in EXTENSION.rglob("*"):
        if not source.is_file():
            continue
        relative = source.relative_to(EXTENSION)
        if source.is_symlink() or any(part.startswith(".") for part in relative.parts) or source.suffix in {".pem", ".crx", ".log"}:
            raise ValueError("Unexpected extension file: {}".format(relative))
        extension_files.append((source, relative.as_posix()))
    manual_files = [(source, "clique-limpo/" + name) for source, name in extension_files]
    manual_files.append((ROOT / "README.md", "README.md"))
    manual_files.extend((source, source.relative_to(ROOT).as_posix()) for source in (ROOT / "docs").rglob("*") if source.is_file())
    manual = OUTPUT / "Clique-Limpo.zip"
    store = OUTPUT / "Clique-Limpo-loja.zip"
    archive(manual, manual_files)
    archive(store, extension_files)
    for destination, manifest_path in [(manual, "clique-limpo/manifest.json"), (store, "manifest.json")]:
        with ZipFile(destination) as bundle:
            if bundle.testzip() is not None or json.loads(bundle.read(manifest_path))["version"] != manifest["version"]:
                raise ValueError("Invalid release archive")
        print("{}: version {} ({} bytes)".format(destination.name, manifest["version"], destination.stat().st_size))
    checksums = "".join("{}  {}\n".format(hashlib.sha256(destination.read_bytes()).hexdigest(), destination.name) for destination in [manual, store])
    (OUTPUT / "SHA256SUMS.txt").write_text(checksums, encoding="utf-8")


if __name__ == "__main__":
    main()
