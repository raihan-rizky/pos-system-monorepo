"""Journalled release transitions. OS/network adapters live in pos_release.py."""
import json
import hashlib
import os
import pathlib
import shutil
import time

from release_policy import ReleaseError, RETENTION, cleanup_plan


class ReleaseManager:
    def __init__(self, config, services, github, clock=time.time):
        self.config, self.services, self.github, self.clock = config, services, github, clock
        self.path = pathlib.Path(config['state_file'])

    def load(self):
        try:
            state = json.loads(self.path.read_text())
            if state['version'] != 1 or not isinstance(state['releases'], dict):
                raise ValueError()
            return state
        except (OSError, ValueError, KeyError) as exc:
            raise ReleaseError('Registry tidak valid; operasi dihentikan') from exc

    def save(self, state):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix('.tmp')
        with open(temp, 'w', encoding='utf-8') as stream:
            os.chmod(temp, 0o600)
            json.dump(state, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, self.path)

    def deploy(self, request):
        self.recover()
        state = self.load()
        if state.get('pending'):
            raise ReleaseError('Pemulihan worker masih berjalan')
        target = request['target']
        active = state['releases'][state['environments'][target]]
        if not self.services.compatible(active):
            raise ReleaseError('Konfigurasi/database berubah; tinjau migrasi terlebih dahulu')
        candidate = self.github.prepare(request, active)
        sha = candidate['metadata']['checkedOutSha']
        reason = None
        if not request.get('manual') and self.github.head(target) != sha:
            reason = 'Build tertinggal dari push terbaru'
        if state.get('blocked', {}).get(target) == sha and not request.get('manual'):
            reason = 'Versi ini diblokir setelah kegagalan/rollback'
        if reason:
            if active['id'] != candidate['id']:
                candidate.update(failed_at=self.clock(), healthy=False)
                state['releases'][candidate['id']] = candidate
                self.save(state)
            raise ReleaseError(reason)
        if active['id'] == candidate['id']:
            return {'result': 'already_active', 'release': active['id']}
        return self.activate(state, target, candidate)

    def activate(self, state, target, candidate, rollback=False):
        old_id = state['environments'][target]
        old = state['releases'][old_id]
        candidate = dict(candidate)
        candidate.setdefault('database_fingerprint', old.get('database_fingerprint'))
        state['releases'][candidate['id']] = candidate
        canary_unit = 'pos-canary-' + hashlib.sha256(candidate['id'].encode()).hexdigest()[:16]
        state['pending'] = dict(target=target, old=old_id, candidate=candidate['id'], phase='canary', canary_unit=canary_unit)
        self.save(state)
        try:
            self.services.canary(candidate, canary_unit)
        except Exception as exc:
            candidate['failed_at'] = self.clock()
            candidate['healthy'] = False
            state.setdefault('blocked', {})[target] = candidate['metadata']['checkedOutSha']
            self.services.stop_canary(canary_unit)
            state.pop('pending', None)
            self.save(state)
            raise ReleaseError('Canary gagal; release aktif dipertahankan') from exc
        state['pending'] = dict(target=target, old=old_id, candidate=candidate['id'], phase='draining')
        self.save(state)
        if not self.services.drain(target, 120):
            state['pending']['phase'] = 'waiting_worker'
            candidate['failed_at'] = self.clock()
            self.save(state)
            raise ReleaseError('Worker belum berhenti aman; promosi dibatalkan dan pemulihan menunggu')
        state['pending']['phase'] = 'waiting_worker'
        self.save(state)
        if not rollback and self.github.head(target) != candidate['metadata']['checkedOutSha']:
            self.recover()
            raise ReleaseError('Push baru tiba saat drain; promosi versi lama dibatalkan')
        state['pending']['phase'] = 'switching'
        self.save(state)
        try:
            self.services.switch(target, candidate)
            if not self.services.ready(target, candidate):
                raise ReleaseError('Readiness gagal')
        except Exception as exc:
            candidate['failed_at'], candidate['healthy'] = self.clock(), False
            state.setdefault('blocked', {})[target] = candidate['metadata']['checkedOutSha']
            self.save(state)
            self.recover()
            raise ReleaseError('Aktivasi gagal; lihat status pemulihan') from exc
        old['inactive_at'] = self.clock()
        if rollback:
            old['healthy'], old['failed_at'] = False, self.clock()
            state.setdefault('blocked', {})[target] = old['metadata']['checkedOutSha']
        else:
            state.setdefault('blocked', {}).pop(target, None)
        candidate.pop('inactive_at', None)
        candidate.pop('failed_at', None)
        candidate['healthy'], candidate['activated_at'] = True, self.clock()
        state['environments'][target] = candidate['id']
        state.pop('pending', None)
        self.save(state)
        return {'result': 'active', 'release': candidate['id'], 'rollback': old_id,
                'readiness': 'passed', 'status': self.status()}

    def rollback(self, request):
        self.recover()
        state = self.load()
        if state.get('pending'):
            raise ReleaseError('Pemulihan sebelumnya belum selesai')
        target, now = request['target'], self.clock()
        records = [r for r in state['releases'].values() if r['target'] == target and r.get('healthy')
                   and 'inactive_at' in r and 0 <= now - r['inactive_at'] < RETENTION]
        if request.get('run_id'):
            records = [r for r in records if r.get('run_id') == request['run_id']]
        if records:
            candidate = max(records, key=lambda r: r['inactive_at'])
        elif request.get('run_id') and request.get('artifact_id'):
            active = state['releases'][state['environments'][target]]
            candidate = self.github.prepare(request, active)
        else:
            raise ReleaseError('Tidak ada rollback sehat yang masih berlaku')
        if not self.services.compatible(candidate):
            raise ReleaseError('Rollback tidak kompatibel dengan konfigurasi/database saat ini')
        return self.activate(state, target, candidate, rollback=True)

    def recover(self):
        state = self.load()
        pending = state.get('pending')
        if not pending:
            self.services.reconcile(state)
            return
        target, old = pending['target'], state['releases'][pending['old']]
        if pending['phase'] == 'canary':
            self.services.stop_canary(pending['canary_unit'])
            self.services.reconcile(state)
            candidate = state['releases'][pending['candidate']]
            candidate.update(healthy=False, failed_at=self.clock())
            state.setdefault('blocked', {})[target] = candidate['metadata']['checkedOutSha']
            state.pop('pending', None)
            self.save(state)
            return
        if not self.services.compatible(old):
            raise ReleaseError('Pemulihan memerlukan operator: konfigurasi/database berubah')
        if pending['phase'] == 'waiting_worker':
            if not self.services.worker_stopped(target):
                return
            self.services.start_worker(target)
        else:
            if not self.services.drain(target, 120):
                return
            self.services.switch(target, old)
            if not self.services.ready(target, old):
                raise ReleaseError('Pemulihan release lama belum sehat')
        candidate = state['releases'][pending['candidate']]
        candidate['healthy'], candidate['failed_at'] = False, self.clock()
        state['environments'][target] = old['id']
        state.pop('pending', None)
        self.save(state)

    def cleanup(self, apply=False):
        state = self.load()
        self.services.reconcile(state)
        protected = set(state['environments'].values())
        if state.get('pending'):
            protected.update((state['pending']['old'], state['pending']['candidate']))
        live = self.services.live_paths()
        for record in state['releases'].values():
            path = pathlib.Path(record['runtime']).parent
            if any(pathlib.Path(p).is_relative_to(path) for p in live):
                protected.add(record['id'])
        records = []
        for record in state['releases'].values():
            record = dict(record)
            record['remote_verified'] = False
            if (record['id'] not in protected and 'inactive_at' in record
                    and 0 <= self.clock() - record['inactive_at'] < RETENTION
                    and hasattr(self.github, 'available')):
                record['remote_verified'] = self.github.available(record)
            records.append(record)
        selected = cleanup_plan(records, protected, self.clock())
        deleted = []
        for release_id in selected:
            record = state['releases'][release_id]
            runtime = pathlib.Path(record['runtime'])
            parent = runtime.parent
            allowed = pathlib.Path(self.config['root']) / 'releases'
            if (not parent.is_dir() or runtime.name != 'runtime' or parent.name != release_id or parent.is_symlink()
                    or runtime.is_symlink() or parent.resolve().parent != allowed.resolve()):
                continue
            if apply:
                shutil.rmtree(parent)
                del state['releases'][release_id]
                self.save(state)
            deleted.append(release_id)
        return deleted

    def status(self):
        state, now = self.load(), self.clock()
        active, rollback = {}, {}
        for target, release_id in state['environments'].items():
            record = state['releases'][release_id]
            active[target] = {'id': release_id, 'metadata': record['metadata']}
            choices = [r for r in state['releases'].values() if r['target'] == target and r.get('healthy')
                       and 'inactive_at' in r and 0 <= now - r['inactive_at'] < RETENTION]
            if choices:
                old = max(choices, key=lambda r: r['inactive_at'])
                rollback[target] = {'id': old['id'], 'expires_at': old['inactive_at'] + RETENTION}
        return dict(active=active, rollback=rollback, pending=state.get('pending'),
                    blocked=state.get('blocked', {}), free_bytes=shutil.disk_usage(self.config['root']).free)
