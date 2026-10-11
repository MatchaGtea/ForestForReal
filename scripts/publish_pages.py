"""Build, scan, and publish the recorded demo to the existing gh-pages branch.

Requires Node.js, Git, GitHub CLI (logged in), and Gitleaks. No GEE credentials.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def run(command, cwd=ROOT, **kwargs):
    return subprocess.run(command, cwd=cwd, check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default='MatchaGtea/ForestForReal')
    parser.add_argument('--gitleaks', default='gitleaks')
    args = parser.parse_args()
    if len(args.repo.split('/')) != 2 or not all(part.replace('-', '').replace('_', '').replace('.', '').isalnum() for part in args.repo.split('/')):
        parser.error('--repo must be owner/repository')
    scanner = shutil.which(args.gitleaks)
    if not scanner:
        parser.error('Install Gitleaks or pass its executable path with --gitleaks')
    source = run(['git', 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
    frontend = ROOT / 'frontend'
    run(['npm', 'run', 'build'], cwd=frontend,
        env={**os.environ, 'VITE_DEMO_MODE': 'true', 'VITE_BASE_PATH': f'/{args.repo.split("/")[1]}/'})
    run([scanner, 'dir', '--redact', '--no-banner', str(frontend / 'dist')])
    auth = ['git', '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential']
    account = run(['gh', 'api', 'user', '--jq', '[ (.id|tostring), .login ]|join("+")'], capture_output=True, text=True).stdout.strip()
    with tempfile.TemporaryDirectory(prefix='forestforreal-pages-') as directory:
        checkout = Path(directory) / 'publish'
        run([*auth, 'clone', '--single-branch', '--branch', 'gh-pages', f'https://github.com/{args.repo}.git', str(checkout)])
        for path in checkout.iterdir():
            if path.name == '.git':
                continue
            if path.is_dir():shutil.rmtree(path)
            else:path.unlink()
        shutil.copytree(frontend / 'dist', checkout, dirs_exist_ok=True)
        (checkout / '.nojekyll').write_text('')
        run(['git', 'config', 'user.name', args.repo.split('/')[0]], cwd=checkout)
        run(['git', 'config', 'user.email', f'{account}@users.noreply.github.com'], cwd=checkout)
        run(['git', 'add', '.'], cwd=checkout)
        changes=subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=checkout)
        if changes.returncode == 0:
            print('The published build already matches; nothing to push.')
            return
        if changes.returncode != 1:raise RuntimeError('Could not inspect the publication diff')
        run(['git', 'commit', '-m', f'Publish recorded demo from source {source}'], cwd=checkout)
        run([*auth, 'push', 'origin', 'gh-pages'], cwd=checkout)
    print(f'Published build. Check https://{args.repo.split("/")[0].lower()}.github.io/{args.repo.split("/")[1]}/ after Pages deployment.')


if __name__ == '__main__':
    main()
