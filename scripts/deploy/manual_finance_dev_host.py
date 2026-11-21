"""Host checks for the reviewed development-only manual finance cutover."""

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

from manual_finance_dev_cutover import (
    CutoverError, DatabaseFence, FenceCredential, Journal, MIGRATIONS,
    activate, fence, migrate, plan_binding, recover, role_fence_drain_migrator_sql,
    role_fence_probe_sql, role_fence_release_sql, role_fence_seal_sql,
    role_fence_status_sql, validate_plan, verify_bundle,
)


def run_host(args, *, input=None):
    try:
        result = subprocess.run(args, input=input, text=True, capture_output=True, timeout=90, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CutoverError(f"Perintah VPS tidak selesai: {args[0]}") from exc
    if result.returncode:
        raise CutoverError(f"Perintah VPS gagal: {args[0]}")
    return result.stdout.strip()


class DevPostgres:
    """Run administrative SQL through the verified local dev container only."""

    DEV = "posdev-db"
    PROD = "posprod-db"
    IDENTITY = "SELECT system_identifier::text, current_database() FROM pg_catalog.pg_control_system();"

    def __init__(self, runner=run_host):
        self.run = runner

    def _query(self, container, sql):
        return self.run(["docker", "exec", "-i", container, "psql", "-X", "-qAt",
                         "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres"], input=sql)

    def _identity(self, container):
        value = self._query(container, self.IDENTITY)
        match = re.fullmatch(r"([1-9][0-9]{0,29})\|([A-Za-z0-9_]{1,63})", value)
        if not match:
            raise CutoverError("Identitas database VPS tidak valid")
        return dict(zip(("cluster", "database"), match.groups()))

    def verify(self, plan):
        dev, prod = self._identity(self.DEV), self._identity(self.PROD)
        return dev == plan["dev_database"] and prod == plan["prod_database"] and dev["cluster"] != prod["cluster"]

    def admin(self, plan, sql):
        if not self.verify(plan):
            raise CutoverError("Database VPS tidak cocok dengan identitas development yang ditinjau")
        return self._query(self.DEV, sql)

    def migration_history(self, plan):
        raw = self.admin(plan, """
            SELECT COALESCE(json_agg(json_build_array(migration_name, checksum, finished_at IS NOT NULL)
                                    ORDER BY started_at), '[]'::json)
            FROM public._prisma_migrations WHERE rolled_back_at IS NULL;
        """)
        try:
            return json.loads(raw)
        except ValueError as exc:
            raise CutoverError("Riwayat Prisma development tidak dapat dibaca") from exc

    def cron_writers_are_fenced(self, plan):
        writers = plan["database_roles"]["writers"]
        if not writers or any(not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", role) for role in writers):
            raise CutoverError("Daftar penulis cron development tidak sesuai")
        names = ", ".join(f"'{role}'" for role in writers)
        return self.admin(plan, f"""
            SELECT current_setting('cron.use_background_workers', true) = 'off'
                AND NOT EXISTS (
                    SELECT FROM cron.job WHERE active AND
                        (username NOT IN ({names}) OR database <> current_database())
                );
        """) == "t"


def pending_migrations(directory, history):
    """Accept Git bytes for the new migrations and legacy CRLF for old history."""
    files = {entry.name: entry / "migration.sql" for entry in directory.iterdir() if entry.is_dir()}
    applied = set()
    for name, checksum, finished in history:
        if (finished is not True or name not in files or name in applied
                or not isinstance(checksum, str) or not re.fullmatch(r"[a-f0-9]{64}", checksum)):
            raise CutoverError("Riwayat migrasi development tidak sesuai")
        data = files[name].read_bytes()
        accepted = {hashlib.sha256(data).hexdigest()}
        if name not in MIGRATIONS:
            accepted.add(hashlib.sha256(data.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")).hexdigest())
        if checksum not in accepted:
            raise CutoverError(f"Checksum riwayat migrasi berbeda: {name}")
        applied.add(name)
    pending = tuple(sorted(files.keys() - applied))
    first_pending = len(MIGRATIONS) - len(pending)
    if first_pending < 0 or pending != MIGRATIONS[first_pending:]:
        raise CutoverError("Migrasi tertunda bukan urutan migrasi manual finance yang ditinjau")
    return pending


def baseline_compatible(plan, services, github, active):
    previous = plan["active_release"]
    baseline = plan.get("database_baseline", {
        "commit": previous["commit"],
        "fingerprint": previous["database_fingerprint"],
    })
    return (github.head("dev") == baseline["commit"]
            and services.compatible({**active, "database_fingerprint": baseline["fingerprint"]}))


def write_verified_backup(path, dump, restore):
    """Publish the fenced snapshot after an isolated restore succeeds."""
    parent = path.parent
    if (parent.is_symlink() or not parent.is_dir() or path.exists() or path.is_symlink()
            or (os.name == "posix" and (parent.stat().st_uid != os.geteuid()
                                       or stat.S_IMODE(parent.stat().st_mode) & 0o077))):
        raise CutoverError("Lokasi backup development tidak aman atau sudah terpakai")
    fd, staging = tempfile.mkstemp(prefix=".dev-backup-", dir=parent)
    staged = Path(staging)
    try:
        with os.fdopen(fd, "wb") as stream:
            dump(stream)
            stream.flush()
            os.fsync(stream.fileno())
        if staged.stat().st_size == 0 or restore(staged) is not True:
            raise CutoverError("Pemulihan backup development tidak terverifikasi")
        with staged.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        try:
            os.link(staged, path)
        except FileExistsError as exc:
            raise CutoverError("Backup development sudah tersedia") from exc
        if os.name == "posix":
            directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        return {"backup_sha256": digest, "restore_verified": True}
    finally:
        staged.unlink()


def dev_migrator_url(env, role, password):
    parsed = urlsplit(env["DIRECT_URL"])
    if (parsed.scheme not in {"postgres", "postgresql"} or parsed.hostname != "127.0.0.1"
            or parsed.port != 15432 or parsed.path != "/postgres" or parsed.username != "postgres"
            or parsed.fragment or not re.fullmatch(r"mfc_migrator_[a-f0-9]{24}", role)
            or not re.fullmatch(r"[a-f0-9]{48}", password)):
        raise CutoverError("Endpoint migrator development tidak sesuai")
    return urlunsplit((parsed.scheme, f"{role}:{quote(password)}@127.0.0.1:15432",
                       "/postgres", "schema=public&connection_limit=1", ""))


def run_dev_prisma(runtime, schema, url, operation):
    node = "/usr/local/bin/node"
    if operation == "fingerprint":
        args = [node, "/usr/local/lib/pos-deploy/probe-db.cjs", str(runtime)]
    elif operation in ("deploy", "status"):
        args = [node, str(runtime / "packages/db/node_modules/prisma/build/index.js"),
                "migrate", operation, "--schema", str(schema)]
    else:
        raise CutoverError("Operasi Prisma development tidak dikenal")
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "DATABASE_URL": url, "DIRECT_URL": url}
    result = subprocess.run(args, env=env, cwd=schema.parent, capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise CutoverError(f"Prisma development gagal menjalankan {operation}")
    output = result.stdout.strip()
    if operation == "fingerprint" and not re.fullmatch(r"[a-f0-9]{64}", output):
        raise CutoverError("Fingerprint development tidak valid")
    return output


def restore_development_backup(archive, db, plan):
    """Restore only into a scratch database on the separate finance fixture cluster."""
    fixture = "codex-finance-test-20261116"
    cluster = db._identity(fixture)["cluster"]
    if cluster in {plan["dev_database"]["cluster"], plan["prod_database"]["cluster"]}:
        raise CutoverError("Container pemulihan bukan cluster uji")
    if not db.cron_writers_are_fenced(plan):
        raise CutoverError("Jadwal cron development menggunakan penulis di luar fence")
    name = "codex_mfc_backup_" + uuid.uuid4().hex[:16]
    path = "/tmp/" + name + ".dump"
    tools = ["docker", "exec", fixture]
    created = False
    try:
        db.run(["docker", "cp", str(archive), f"{fixture}:{path}"])
        listing = db.run([*tools, "pg_restore", "--list", path])
        # pg_cron is installed only in the fixture cluster's primary database.
        exclude = re.compile(r"EXTENSION(?: -)? pg_cron|SCHEMA cron|\scron\s|EVENT TRIGGER - issue_pg_cron_access")
        restore_list = "\n".join(line for line in listing.splitlines() if not exclude.search(line)) + "\n"
        db.run([*tools, "createdb", "-U", "supabase_admin", "-T", "template0", name])
        created = True
        db.run(["docker", "exec", "-i", fixture, "sh", "-c",
                'umask 077; cat > "$1"', "restore-list", path + ".list"], input=restore_list)
        db.run([*tools, "pg_restore", "--exit-on-error", "--single-transaction", "-U", "supabase_admin",
                "-d", name, "-L", path + ".list", path])
        query = """
            SELECT md5(COALESCE(string_agg(migration_name || checksum, '|' ORDER BY migration_name), ''))
            FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
        """
        restored = db.run(["docker", "exec", "-i", fixture, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                           "-U", "supabase_admin", "-d", name], input=query)
        return restored == db.admin(plan, query)
    finally:
        if created:
            db.run([*tools, "dropdb", "-U", "supabase_admin", name])
        db.run([*tools, "rm", "-f", path, path + ".list"])


class DevMigrationAdapter:
    def __init__(self, plan, workdir, release, services, manager, gate, db=None):
        self.workdir = workdir
        self.bundle = workdir / "packages/db/prisma"
        self.backup = workdir / "dev.dump"
        self.release = release
        self.services = services
        self.manager = manager
        self.gate = gate
        self.db = db or DevPostgres()
        self.plan = plan
        self.binding = plan_binding(plan)
        self.journal = Journal(workdir / "transition.json", self.binding)
        self.credential = FenceCredential(workdir / "migrator.json", self.binding)
        self.db_fence = DatabaseFence(plan, self.binding, self.credential,
                                      lambda sql: self.db.admin(self.plan, sql))

    def active(self, plan):
        state = self.manager.load()
        release_id = state["environments"]["dev"]
        record = state["releases"][release_id]
        expected = plan["active_release"]
        if (state.get("pending") or record["target"] != "dev" or release_id != expected["id"]
                or record["metadata"]["checkedOutSha"] != expected["commit"]
                or record["metadata"]["schemaSha256"] != expected["schema_sha256"]
                or record["database_fingerprint"] != expected["database_fingerprint"]):
            raise CutoverError("Release dev aktif berubah")
        return record

    def verify_target(self, plan):
        if not self.db.verify(plan):
            return False
        self.active(plan)
        settings = self.services.settings("dev")
        if (settings["web"], settings["worker"], settings["env_file"]) != (
                "posdev-web", "posdev-import-worker", "/etc/pos-system/development.env"):
            return False
        return (self.db.run(["docker", "port", self.db.DEV, "5432/tcp"]) == "127.0.0.1:15432"
                and self.db.cron_writers_are_fenced(plan))

    def close_gate(self, plan):
        self.gate.close()
        if not self.gate.wait_drained(180):
            raise CutoverError("Permintaan lama development belum selesai")

    def verify_gate(self, plan):
        return self.gate.verify()

    def stop_old_writers(self, plan):
        if not self.services.drain("dev", 120):
            raise CutoverError("Worker development belum berhenti")
        self.release.command(["systemctl", "stop", "posdev-web"], timeout=120)

    def verify_old_writers_stopped(self, plan):
        properties = self.services.properties("posdev-web")
        return (properties.get("ActiveState") == "inactive" and properties.get("MainPID") == "0"
                and not self.services.cgroup_pids(properties) and self.services.worker_stopped("dev"))

    def install_database_fence(self, plan):
        self.db_fence.install()

    def verify_database_fence(self, plan):
        status = self.db.admin(plan, role_fence_status_sql(plan, self.binding))
        return self.db_fence._last_result(status) == "fenced" and self.db.cron_writers_are_fenced(plan)

    def create_verified_backup(self, plan):
        def dump(stream):
            if not self.db.verify(plan) or not self.verify_database_fence(plan):
                raise CutoverError("Pelindung database development berubah sebelum backup")
            completed = subprocess.run(["docker", "exec", self.db.DEV, "pg_dump", "-U", "supabase_admin",
                                        "-d", "postgres", "-Fc"], stdout=stream, stderr=subprocess.PIPE, timeout=180)
            if completed.returncode:
                raise CutoverError("Backup database development gagal")

        if self.backup.is_file() and not self.backup.is_symlink():
            if not restore_development_backup(self.backup, self.db, plan):
                raise CutoverError("Backup development yang tersimpan tidak terverifikasi")
            with self.backup.open("rb") as stream:
                return {"backup_sha256": hashlib.file_digest(stream, "sha256").hexdigest(), "restore_verified": True}
        return write_verified_backup(self.backup, dump, lambda path: restore_development_backup(path, self.db, plan))

    def verify_backup(self, plan, evidence):
        if self.backup.is_symlink() or not self.backup.is_file():
            return False
        with self.backup.open("rb") as stream:
            return hashlib.file_digest(stream, "sha256").hexdigest() == evidence["backup_sha256"]

    def verify_migration_files(self, plan):
        return verify_bundle(plan, self.bundle)

    def _prisma(self, plan, operation):
        url = dev_migrator_url(self.services.environment("dev"), "mfc_migrator_" + self.binding[:24],
                               self.credential.read())
        return run_dev_prisma(Path(self.active(plan)["runtime"]), self.bundle / "schema.prisma", url, operation)

    def apply_migrations(self, plan):
        pending = pending_migrations(self.bundle / "migrations", self.db.migration_history(plan))
        if pending:
            self._prisma(plan, "deploy")

    def verify_migrated(self, plan):
        if pending_migrations(self.bundle / "migrations", self.db.migration_history(plan)):
            raise CutoverError("Migrasi development masih tertunda")
        self._prisma(plan, "status")
        return self._prisma(plan, "fingerprint")

    def migrate_only(self):
        current = self.journal.load()
        if current is None:
            if shutil.disk_usage(self.services.config["root"]).free < 4 * 1024 ** 3:
                raise CutoverError("Ruang staging development kurang dari 4 GiB")
            self.verify_migration_files(self.plan)
            pending = pending_migrations(self.bundle / "migrations", self.db.migration_history(self.plan))
            if pending != MIGRATIONS or not baseline_compatible(
                    self.plan, self.services, self.manager.github, self.active(self.plan)):
                raise CutoverError("Baseline migrasi development berubah")
        if current is None or current["phase"] in ("gate_intent", "gate_closed", "fence_intent", "fenced"):
            fence(self.plan, self, self.journal)
        migrate(self.plan, self, self.journal)


class DevReleaseAdapter(DevMigrationAdapter):
    def __init__(self, plan, workdir, release, services, manager, gate, write_unit, local_readiness):
        super().__init__(plan, workdir, release, services, manager, gate)
        self.write_unit = write_unit
        self.local_readiness = local_readiness
        self.candidate = None
        self.canary_record = workdir / "canary.json"

    def active(self, plan):
        current = self.journal.load()
        candidate = self.candidate_evidence(current)
        if current and current["phase"] in ("thawing", "complete") and candidate:
            state = self.manager.load()
            release_id = self.candidate_id(candidate)
            if state["environments"]["dev"] == release_id and not state.get("pending"):
                previous = state["releases"][plan["active_release"]["id"]]
                if previous["metadata"]["checkedOutSha"] == plan["active_release"]["commit"]:
                    return previous
        return super().active(plan)

    @staticmethod
    def candidate_evidence(current):
        return next((event["evidence"] for event in current["events"] if event["phase"] == "ci_ready"),
                    None) if current else None

    @staticmethod
    def candidate_id(evidence):
        return f"dev-{evidence['commit'][:16]}-{evidence['run_id']}"

    def verify_ci_artifact(self, plan, evidence):
        plain = self.manager.github
        picked = evidence["commit"]
        if plain.head("dev") != picked:
            return False
        commit = plain.api(f"git/commits/{picked}")
        baseline = plan.get("database_baseline", plan["active_release"])
        if (commit["tree"]["sha"] != plan["candidate"]["tree"]
                or [parent["sha"] for parent in commit["parents"]] != [baseline["commit"]]):
            return False
        previous = self.active(plan)
        checks = self.services.expected("dev", previous["runtime"])

        class CandidateSettings:
            def expected(_, target, runtime):
                if target != "dev":
                    raise CutoverError("Artefak harus berasal dari dev")
                return {**checks, "schemaSha256": plan["candidate"]["schema_sha256"]}

        github = self.release.Github(self.services.config, CandidateSettings())
        request = {"target": "dev", "action": "deploy", "manual": False,
                   "run_id": evidence["run_id"], "artifact_id": evidence["artifact_id"]}
        candidate = github.prepare(request, {**previous, "database_fingerprint": plan["candidate"]["database_fingerprint"]})
        runtime = Path(candidate["runtime"])
        if (candidate["id"] != self.candidate_id(evidence)
                or candidate["metadata"]["checkedOutSha"] != picked):
            return False
        self.verify_runtime_bundle(plan, runtime)
        self.candidate = candidate
        return True

    def verify_runtime_bundle(self, plan, runtime):
        source = runtime / "packages/db/prisma"
        if source.is_symlink() or (source / "migrations").is_symlink():
            raise CutoverError("Bundle Prisma kandidat menggunakan symlink")
        with tempfile.TemporaryDirectory(dir=self.workdir, prefix="artifact-prisma-") as tmp:
            bundle = Path(tmp)
            shutil.copy2(source / "schema.prisma", bundle / "schema.prisma", follow_symlinks=False)
            shutil.copytree(source / "migrations", bundle / "migrations", symlinks=True)
            verify_bundle(plan, bundle)

    def _unit_paths(self):
        expected = Path(self.candidate["runtime"])
        units = ("posdev-web", "posdev-import-worker")
        return all(Path(self.services.properties(unit).get("WorkingDirectory", "/")).resolve() == expected.resolve()
                   for unit in units)

    def _candidate_canary(self, plan, evidence):
        binding = {"binding": self.binding, "evidence": evidence}
        if self.canary_record.is_file() and json.loads(self.canary_record.read_text()) == binding:
            return
        url = dev_migrator_url(self.services.environment("dev"), "mfc_migrator_" + self.binding[:24],
                               self.credential.read())
        settings = self.services.settings("dev")
        # systemd reads the environment file before entering the service namespace.
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.workdir, prefix="canary-") as env:
            source = Path(settings["env_file"]).read_text(encoding="utf-8")
            for line in source.splitlines():
                if line.partition("=")[0].strip() not in {"DIRECT_URL", "DATABASE_URL"}:
                    env.write(line + "\n")
            env.write(f'DATABASE_URL="{url}"\nDIRECT_URL="{url}"\n')
            env.flush()
            config = {**self.services.config, "targets": {
                **self.services.config["targets"], "dev": {**settings, "env_file": env.name},
            }}
            canary = self.release.Services(config)
            unit = "pos-canary-" + hashlib.sha256(self.candidate["id"].encode()).hexdigest()[:16]
            canary.stop_canary(unit)
            canary.canary(self.candidate, unit)
        self.release.write_json(self.canary_record, binding)

    def switch_candidate(self, plan, evidence):
        self._candidate_canary(plan, evidence)
        path = self.candidate["runtime"]
        for name in ("posdev-web", "posdev-import-worker"):
            unit = Path("/etc/systemd/system") / (name + ".service.d") / "zz-cicd-release.conf"
            self.write_unit(unit, "[Service]\nWorkingDirectory=" + path + "\n")
        self.release.command(["systemctl", "daemon-reload"])

    def verify_candidate_active(self, plan, evidence):
        return (self.candidate is not None and self._unit_paths()
                and self.canary_record.is_file()
                and json.loads(self.canary_record.read_text()) == {"binding": self.binding, "evidence": evidence})

    def _database_state(self, plan):
        status = self.db.admin(plan, role_fence_probe_sql(plan, self.binding))
        return self.db_fence._last_result(status)

    def verify_database_released(self, plan):
        return self._database_state(plan) == "absent"

    def verify_thaw_state(self, plan, evidence):
        return self.verify_candidate_active(plan, evidence) and (
            self.verify_gate(plan) or self.verify_gate_open(plan))

    def release_database_fence(self, plan, evidence):
        state = self._database_state(plan)
        if state == "fenced":
            self.db.admin(plan, role_fence_seal_sql(plan, self.binding))
            state = self._database_state(plan)
        if state == "sealed":
            self.db.admin(plan, role_fence_drain_migrator_sql(plan, self.binding))
            self.db.admin(plan, role_fence_release_sql(plan, self.binding))
        if not self.verify_database_released(plan):
            raise CutoverError("Login development belum dipulihkan")

    def _verified_release(self, plan, evidence):
        state = self.manager.load()
        candidate = self.candidate
        previous = plan["active_release"]["id"]
        if (state.get("pending") or state["environments"]["dev"] not in {previous, candidate["id"]}
                or not self.verify_candidate_active(plan, evidence)
                or self.manager.github.head("dev") != evidence["commit"]):
            raise CutoverError("Kandidat dev berubah saat aktivasi")
        readiness = self.release.Services(self.services.config)
        self.local_readiness(readiness, self.services.settings("dev")["url"])
        if any(self.services.properties(unit).get("ActiveState") != "active"
               for unit in ("posdev-web", "posdev-import-worker")):
            self.release.command(["systemctl", "start", "posdev-web", "posdev-import-worker"], timeout=100)
        if not readiness.ready("dev", candidate):
            raise CutoverError("Readiness runtime dev tidak lulus")
        if state["environments"]["dev"] == previous:
            now = time.time()
            state["releases"][previous]["inactive_at"] = now
            state["releases"][candidate["id"]] = {**candidate, "healthy": True, "activated_at": now}
            state["environments"]["dev"] = candidate["id"]
            state.setdefault("blocked", {}).pop("dev", None)
            self.services.reconcile(state)
            self.manager.save(state)
            directory = os.open(self.manager.path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        return {"target": "dev", "release": candidate["id"], "commit": evidence["commit"],
                "run_id": evidence["run_id"], "artifact_id": evidence["artifact_id"],
                "schema_sha256": evidence["schema_sha256"], "database_fingerprint": candidate["database_fingerprint"]}

    def open_gate(self, plan, evidence):
        self.gate.open(lambda: self._verified_release(plan, evidence))

    def resume_gate_if_needed(self, plan, gate_release):
        current = self.journal.load()
        evidence = self.candidate_evidence(current)
        if (current and current["phase"] == "thawing" and gate_release.is_file()
                and not self.verify_gate(plan)):
            if (not evidence or not self.verify_ci_artifact(plan, evidence)
                    or not self.verify_database_released(plan)):
                raise CutoverError("Bukti pelepasan gerbang dev tidak bisa diverifikasi")
            self.gate.resume_open(lambda: self._verified_release(plan, evidence))

    def verify_gate_open(self, plan):
        current = self.journal.load()
        evidence = self.candidate_evidence(current)
        if not evidence or not self.candidate:
            return False
        registered = self.manager.load()["environments"]["dev"] == self.candidate["id"]
        if not registered or self.verify_gate(plan):
            return False
        try:
            self.services.page(self.services.settings("dev")["url"])
        except (OSError, self.release.ReleaseError):
            return False
        return True


def main(argv):
    parser = argparse.ArgumentParser(description="Manual finance cutover for the POS dev VPS")
    parser.add_argument("action", choices=("preflight", "migrate", "activate", "recover"))
    parser.add_argument("directory", type=Path)
    parser.add_argument("--commit")
    parser.add_argument("--run", type=int)
    parser.add_argument("--artifact", type=int)
    args = parser.parse_args(argv)
    if os.geteuid() != 0:
        raise CutoverError("Cutover development memerlukan operator VPS")
    release_dir = Path("/usr/local/lib/pos-deploy")
    prior = release_dir / "manual-income-release-f42df659-final"
    sys.path.insert(0, str(release_dir))
    sys.path.append(str(prior))
    import pos_release as release
    from manual_income_dev_firewall import DevFirewallGate, SystemFirewallAdapter, use_local_dev_readiness
    from manual_income_dev_preflight import validate_endpoints
    from manual_income_dev_switch import write_durable

    directory = args.directory
    permitted_parent = Path("/var/lib/pos-system-deploy")
    if (not directory.is_absolute() or directory.parent != permitted_parent or directory.resolve() != directory
            or not re.fullmatch(r"manual-finance-dev-[a-z0-9-]+", directory.name)
            or directory.stat().st_uid != 0 or stat.S_IMODE(directory.stat().st_mode) & 0o077):
        raise CutoverError("Direktori cutover development tidak aman")
    plan_file = directory / "plan.json"
    if plan_file.is_symlink() or plan_file.stat().st_uid != 0 or stat.S_IMODE(plan_file.stat().st_mode) & 0o077:
        raise CutoverError("Rencana cutover development tidak aman")
    plan = validate_plan(json.loads(plan_file.read_text()))
    config = json.loads(release.CONFIG.read_text())
    services = release.Services(config)
    validate_endpoints(services.environment("dev"), services.environment("prod"))
    manager = release.ReleaseManager(config, services, release.Github(config, services))
    gate_adapter = SystemFirewallAdapter(Path("/"), subprocess.run, enabled=True)
    gate_adapter.release_journal = directory / "ingress-release.json"
    adapter = DevReleaseAdapter(plan, directory, release, services, manager, DevFirewallGate(gate_adapter),
                                write_durable, use_local_dev_readiness)
    with release.locked(wait=False):
        if not adapter.verify_target(plan):
            raise CutoverError("Target development tidak dapat diverifikasi")
        if args.action == "preflight":
            gate_adapter.preflight()
            gate_adapter.original_config()
            verify_bundle(plan, adapter.bundle)
            active = adapter.active(plan)
            pending = pending_migrations(adapter.bundle / "migrations", adapter.db.migration_history(plan))
            if pending != MIGRATIONS or not baseline_compatible(plan, services, manager.github, active):
                raise CutoverError("Migrasi atau release development berubah")
            available = shutil.disk_usage(config["root"]).free
            if available < 4 * 1024 ** 3:
                raise CutoverError("Ruang staging development kurang dari 4 GiB")
            print(json.dumps({"phase": "preflight", "release": active["id"], "pending": pending, "free_bytes": available}))
            return
        if args.action == "migrate":
            adapter.migrate_only()
        elif args.action == "activate":
            adapter.resume_gate_if_needed(plan, gate_adapter.release_journal)
            activate(plan, adapter, adapter.journal, {
                "commit": args.commit, "run_id": args.run, "artifact_id": args.artifact,
                "schema_sha256": plan["candidate"]["schema_sha256"],
            })
        else:
            adapter.resume_gate_if_needed(plan, gate_adapter.release_journal)
            recover(plan, adapter, adapter.journal)
        print(json.dumps({"phase": adapter.journal.load()["phase"]}))


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except CutoverError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
