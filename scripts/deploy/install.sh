#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
test "$#" = 2 || { echo 'Usage: install.sh PROD_PUBLIC_KEY_FILE DEV_PUBLIC_KEY_FILE' >&2; exit 2; }
source_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
for public_key in "$1" "$2"; do ssh-keygen -lf "$public_key" >/dev/null; done
install -d -m 0755 /usr/local/lib/pos-deploy
install -m 0644 "$source_dir"/{pos_release.py,release_engine.py,release_policy.py,probe-db.cjs} /usr/local/lib/pos-deploy/
cat > /usr/local/sbin/pos-release <<'WRAPPER'
#!/bin/sh
exec /usr/bin/python3 /usr/local/lib/pos-deploy/pos_release.py "$@"
WRAPPER
chmod 0755 /usr/local/sbin/pos-release
id pos-deploy >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/pos-deploy-ssh --shell /bin/sh pos-deploy
install -d -o root -g root -m 0755 /var/lib/pos-deploy-ssh /var/lib/pos-deploy-ssh/.ssh
{
  printf 'restrict,command="sudo -n /usr/local/sbin/pos-release ssh prod" %s\n' "$(cat -- "$1")"
  printf 'restrict,command="sudo -n /usr/local/sbin/pos-release ssh dev" %s\n' "$(cat -- "$2")"
} > /var/lib/pos-deploy-ssh/.ssh/authorized_keys
chown root:root /var/lib/pos-deploy-ssh/.ssh/authorized_keys
chmod 0644 /var/lib/pos-deploy-ssh/.ssh/authorized_keys
cat > /etc/sudoers.d/pos-deploy <<'SUDO'
pos-deploy ALL=(root) NOPASSWD: /usr/local/sbin/pos-release ssh prod, /usr/local/sbin/pos-release ssh dev
SUDO
chmod 0440 /etc/sudoers.d/pos-deploy
visudo -cf /etc/sudoers.d/pos-deploy
sshd -t
for worker in pos-import-worker posdev-import-worker; do
  install -d -m 0755 "/etc/systemd/system/$worker.service.d"
  cat > "/etc/systemd/system/$worker.service.d/zzz-cicd-worker-safety.conf" <<'WORKER'
[Service]
TimeoutStopSec=infinity
SendSIGKILL=no
WORKER
done
for operation in cleanup recover; do
  extra=''
  test "$operation" != cleanup || extra=' --apply'
  cat > "/etc/systemd/system/pos-deploy-$operation.service" <<UNIT
[Unit]
Description=POS deployment $operation
After=network-online.target
[Service]
Type=oneshot
User=root
UMask=0077
Nice=19
ExecStart=/usr/local/sbin/pos-release $operation$extra
UNIT
done
cat > /etc/systemd/system/pos-deploy-cleanup.timer <<'TIMER'
[Unit]
Description=Hourly POS release cleanup
[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=120
[Install]
WantedBy=timers.target
TIMER
cat > /etc/systemd/system/pos-deploy-recover.timer <<'TIMER'
[Unit]
Description=Recover interrupted POS deployments
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
TIMER
systemctl daemon-reload
echo 'Installed. Bootstrap registry and verify dry-run before enabling timers.'
