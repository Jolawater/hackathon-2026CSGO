"""Tie saved validation results to the exact local model and reference inputs."""
import hashlib
from pathlib import Path


def fingerprints(root: Path):
    paths = list((root / 'backend').glob('*.py'))
    paths += [root / 'scripts/validate.py', root / 'data/settings.json', root / 'data/hko_reference.json']
    paths += list((root / 'data').glob('weather*'))
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(paths) if p.is_file()}


def report_status(report, root: Path, version: str):
    recorded = report.get('input_sha256')
    if not recorded or not report.get('generated_at'):
        return {'status': 'unverified', 'changed_files': []}
    current = fingerprints(root)
    changed = sorted(k for k in set(recorded) | set(current) if recorded.get(k) != current.get(k))
    if changed or report.get('model_version') != version:
        return {'status': 'stale', 'changed_files': changed}
    return {'status': 'current', 'changed_files': []}
