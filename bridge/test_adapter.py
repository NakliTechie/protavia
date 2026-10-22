"""Tests for the FreeBindCraft adapter's translation and reading.

Run with the standard library, no dependencies and no GPU:

    python3 -m unittest discover -s bridge -p 'test_*.py' -v

What these cover is the part that decides whether a run is the run that was asked for: what the
adapter refuses, what it passes through, and what it makes of the engine's half-written CSVs.
Starting an actual design run is a forty-minute job on real hardware and is not done here.
"""

import json
import tempfile
import unittest
from pathlib import Path

from adapters import freebindcraft as fbc


class Translate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.run_dir = Path(self.tmp.name) / "run"
        self.pdb = Path(self.tmp.name) / "target.pdb"
        self.pdb.write_text("ATOM\n")
        self.engine = Path(self.tmp.name) / "engine"
        self.engine.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def ask(self, **over):
        request = {
            "engine": "freebindcraft",
            "target": {"path": str(self.pdb), "chain": "A"},
            "binder": {"lengths": [60, 80], "count": 2},
        }
        request.update(over)
        return fbc.translate(request, self.engine, self.run_dir)

    def test_a_plain_request_becomes_settings_the_engine_reads(self):
        settings, argv = self.ask()
        self.assertEqual(settings["chains"], "A")
        self.assertEqual(settings["lengths"], [60, 80])
        self.assertEqual(settings["number_of_final_designs"], 2)
        self.assertEqual(settings["starting_pdb"], str(self.pdb.resolve()))
        self.assertIn("--settings", argv)

    def test_hotspots_become_the_engine_s_own_comma_list(self):
        settings, _ = self.ask(target={"path": str(self.pdb), "chain": "B", "hotspots": [54, 56, 66]})
        self.assertEqual(settings["target_hotspot_residues"], "54,56,66")

    def test_no_hotspots_is_allowed_and_means_the_whole_chain(self):
        settings, _ = self.ask()
        self.assertEqual(settings["target_hotspot_residues"], "")

    def test_ranking_is_by_ipsae_unless_asked_otherwise(self):
        # The project already decided not to rank on one structure's interface confidence by
        # default; the engine computes ipSAE either way.
        _, argv = self.ask()
        self.assertEqual(argv[argv.index("--rank-by") + 1], "ipSAE")
        _, argv = self.ask(settings={"rankBy": "i_pTM"})
        self.assertEqual(argv[argv.index("--rank-by") + 1], "i_pTM")

    def test_seed_and_attempt_cap_are_passed_through(self):
        _, argv = self.ask(settings={"seed": 42, "maxAttempts": 1})
        self.assertEqual(argv[argv.index("--seed") + 1], "42")
        self.assertEqual(argv[argv.index("--max-attempts") + 1], "1")

    def test_a_modality_this_engine_lacks_is_refused_not_quietly_changed(self):
        # BindCraft2 designs nanobodies; FreeBindCraft does not. Silently designing a plain binder
        # instead would be worse than refusing.
        with self.assertRaises(fbc.Refused) as caught:
            self.ask(modality="nanobody")
        self.assertIn("nanobody", str(caught.exception))
        self.assertIn("BindCraft2", str(caught.exception))

    def test_a_missing_target_is_refused_with_the_field_name(self):
        with self.assertRaises(fbc.Refused) as caught:
            fbc.translate({"binder": {}}, self.engine, self.run_dir)
        self.assertIn("target.path", str(caught.exception))

    def test_a_target_that_is_not_on_this_machine_is_refused(self):
        with self.assertRaises(fbc.Refused) as caught:
            self.ask(target={"path": "/nowhere/missing.pdb", "chain": "A"})
        self.assertIn("No such target structure", str(caught.exception))

    def test_a_missing_chain_is_refused(self):
        with self.assertRaises(fbc.Refused) as caught:
            self.ask(target={"path": str(self.pdb)})
        self.assertIn("target.chain", str(caught.exception))

    def test_nonsense_lengths_are_refused(self):
        for lengths in ([80, 60], [0, 50], [70], ["a", "b"]):
            with self.assertRaises(fbc.Refused, msg=f"{lengths} should be refused"):
                self.ask(binder={"lengths": lengths, "count": 1})

    def test_a_count_below_one_is_refused(self):
        with self.assertRaises(fbc.Refused):
            self.ask(binder={"lengths": [60, 80], "count": 0})


class Read(unittest.TestCase):
    """Reading a run that is still being written."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.run_dir = Path(self.tmp.name)
        self.output = self.run_dir / "output"
        self.output.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, header, *rows):
        lines = [",".join(header)] + [",".join(str(c) for c in r) for r in rows]
        (self.output / name).write_text("\n".join(lines) + "\n")

    def test_a_run_that_has_written_nothing_yet_reads_as_zero(self):
        state = fbc.read(self.run_dir, wanted=5)
        self.assertEqual(state["progress"], {"attempted": 0, "redesigned": 0, "accepted": 0, "wanted": 5})
        self.assertEqual(state["designs"], [])

    def test_progress_counts_what_the_engine_has_appended(self):
        self.write("trajectory_stats.csv", ["Design"], ["a"], ["b"], ["c"])
        self.write("mpnn_design_stats.csv", ["Design"], ["a"])
        state = fbc.read(self.run_dir, wanted=5)
        self.assertEqual(state["progress"]["attempted"], 3)
        self.assertEqual(state["progress"]["redesigned"], 1)
        self.assertEqual(state["progress"]["accepted"], 0)

    def test_an_accepted_design_comes_back_with_its_metrics(self):
        self.write(
            "final_design_stats.csv",
            ["Rank", "Sequence", "Length", "ipSAE", "i_pTM", "pLDDT"],
            [1, "MKVLW", 5, 0.812, 0.76, 91.4],
        )
        [design] = fbc.read(self.run_dir, wanted=1)["designs"]
        self.assertEqual(design["rank"], 1)
        self.assertEqual(design["sequence"], "MKVLW")
        self.assertEqual(design["length"], 5)
        self.assertEqual(design["metrics"]["ipSAE"], 0.812)
        self.assertEqual(design["metrics"]["pLDDT"], 91.4)

    def test_a_metric_the_engine_left_blank_is_left_out_rather_than_guessed(self):
        self.write("final_design_stats.csv", ["Rank", "Sequence", "ipSAE", "i_pTM"], [1, "MK", "", 0.5])
        [design] = fbc.read(self.run_dir, wanted=1)["designs"]
        self.assertNotIn("ipSAE", design["metrics"])
        self.assertEqual(design["metrics"]["i_pTM"], 0.5)

    def test_an_accepted_design_points_at_its_structure_when_there_is_one(self):
        ranked = self.output / "Accepted" / "Ranked"
        ranked.mkdir(parents=True)
        (ranked / "1_UBQ_model1.pdb").write_text("ATOM\n")
        self.write("final_design_stats.csv", ["Rank", "Sequence"], [1, "MK"])
        [design] = fbc.read(self.run_dir, wanted=1)["designs"]
        self.assertTrue(design["structure"].endswith("1_UBQ_model1.pdb"))

    def test_no_structure_file_is_None_rather_than_a_broken_path(self):
        self.write("final_design_stats.csv", ["Rank", "Sequence"], [1, "MK"])
        [design] = fbc.read(self.run_dir, wanted=1)["designs"]
        self.assertIsNone(design["structure"])

    def test_a_half_written_csv_does_not_bring_the_read_down(self):
        # The engine appends to these while the page is reading them.
        (self.output / "final_design_stats.csv").write_text('Rank,Sequence\n1,"MK')
        state = fbc.read(self.run_dir, wanted=1)
        self.assertIsInstance(state["designs"], list)


if __name__ == "__main__":
    unittest.main()
