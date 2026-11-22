import importlib.util
import pathlib
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/deploy/prepare_ubuntu_mirror.py"


class UbuntuMirrorTests(unittest.TestCase):
    def load_preparation(self):
        self.assertTrue(SCRIPT.exists(), "The CI mirror preparation script must exist")
        spec = importlib.util.spec_from_file_location("prepare_ubuntu_mirror", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_replaces_only_the_azure_ubuntu_archive(self):
        prepare = self.load_preparation()
        with tempfile.TemporaryDirectory() as directory:
            mirrors = pathlib.Path(directory) / "apt-mirrors.txt"
            mirrors.write_text(
                "http://azure.archive.ubuntu.com/ubuntu/\n"
                "https://security.ubuntu.com/ubuntu/\n"
                "# retain this comment\n",
                encoding="utf-8",
            )
            prepare.rewrite_mirrors([mirrors])
            self.assertEqual(
                mirrors.read_text(encoding="utf-8"),
                "http://archive.ubuntu.com/ubuntu/\n"
                "https://security.ubuntu.com/ubuntu/\n"
                "# retain this comment\n",
            )

    def test_supports_https_sources_and_missing_optional_files(self):
        prepare = self.load_preparation()
        with tempfile.TemporaryDirectory() as directory:
            sources = pathlib.Path(directory) / "ubuntu.sources"
            missing = pathlib.Path(directory) / "missing.list"
            sources.write_text(
                "URIs: https://azure.archive.ubuntu.com/ubuntu\n",
                encoding="utf-8",
            )
            prepare.rewrite_mirrors([missing, sources])
            self.assertEqual(
                sources.read_text(encoding="utf-8"),
                "URIs: https://archive.ubuntu.com/ubuntu\n",
            )
            self.assertFalse(missing.exists())

    def test_leaves_other_hosts_unchanged(self):
        prepare = self.load_preparation()
        with tempfile.TemporaryDirectory() as directory:
            sources = pathlib.Path(directory) / "sources.list"
            original = "deb https://mirror.example.test/ubuntu noble main\n"
            sources.write_text(original, encoding="utf-8")
            prepare.rewrite_mirrors([sources])
            self.assertEqual(sources.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
