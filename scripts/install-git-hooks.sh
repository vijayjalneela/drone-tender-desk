#!/usr/bin/env bash
# Installs the pre-commit hook that runs scripts/check_secrets.py before every commit.
# Run once per clone:  bash scripts/install-git-hooks.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
hook=.git/hooks/pre-commit
if [ -e "$hook" ] && ! grep -q "check_secrets.py" "$hook"; then
  echo "A different pre-commit hook already exists at $hook; not replacing it." >&2
  exit 1
fi
cat > "$hook" <<'HOOK'
#!/usr/bin/env bash
# Installed by scripts/install-git-hooks.sh: block commits that contain secrets.
exec python3 "$(git rev-parse --show-toplevel)/scripts/check_secrets.py"
HOOK
chmod +x "$hook"
echo "Installed the secret check as $hook"
