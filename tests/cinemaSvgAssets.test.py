"""Valide les icônes réellement chargées : python tests/cinemaSvgAssets.test.py."""

from pathlib import Path
import hashlib
import json
import re
import unittest
import xml.etree.ElementTree as ET


ASSETS = Path(__file__).resolve().parents[1] / 'src' / 'assets' / 'cinema'
MOTIFS = {
    'popcorn', 'camera', 'clapperboard', 'reel', 'ticket', 'star', 'projector',
    'filmstrip', 'glasses', 'seat', 'screen', 'soda', 'trophy', 'comedy', 'tragedy',
}


class CinemaSvgAssetsTest(unittest.TestCase):
    def test_collection_is_complete_and_square(self):
        files = {path.stem: path for path in ASSETS.glob('*.svg')}
        self.assertEqual(set(files), MOTIFS | {'projector-beam'})
        for name, path in files.items():
            with self.subTest(motif=name):
                root = ET.parse(path).getroot()
                self.assertEqual(root.tag, '{http://www.w3.org/2000/svg}svg')
                size = 24 if name in {'projector', 'soda'} else 256
                expected = [0, 0, 512, 256] if name == 'projector-beam' else [0, 0, size, size]
                self.assertEqual(list(map(float, root.get('viewBox').split())), expected)
                if root.get('width') and root.get('height'):
                    ratio = float(root.get('width')) / float(root.get('height'))
                    self.assertEqual(ratio, 2 if name == 'projector-beam' else 1)

    def test_geometry_is_vector_and_references_are_local(self):
        for path in ASSETS.glob('*.svg'):
            with self.subTest(motif=path.stem):
                root = ET.parse(path).getroot()
                ids = [element.get('id') for element in root.iter() if element.get('id')]
                self.assertEqual(len(ids), len(set(ids)))
                for element in root.iter():
                    tag = element.tag.split('}')[-1]
                    self.assertNotIn(tag, {'image', 'script', 'foreignObject', 'text'})
                    for attribute, value in element.attrib.items():
                        self.assertFalse(attribute.lower().startswith('on'))
                        if attribute.split('}')[-1] == 'href':
                            self.assertTrue(value.startswith('#'))
                            self.assertIn(value[1:], ids)
                        for reference in re.findall(r'url\(([^)]+)\)', value):
                            target = reference.strip().strip('"').strip("'")
                            self.assertTrue(target.startswith('#'))
                            self.assertIn(target[1:], ids)

    def test_approved_sources_and_white_palette_are_preserved(self):
        sources = json.loads((ASSETS / 'sources.json').read_text(encoding='utf8'))
        self.assertEqual({entry['file'] for entry in sources}, {name + '.svg' for name in MOTIFS})
        self.assertEqual(len(sources), 15)
        self.assertEqual(sum(entry['library'] == 'Phosphor Icons' for entry in sources), 13)
        self.assertEqual(sum(entry['library'] == 'MingCute' for entry in sources), 2)
        for entry in sources:
            with self.subTest(file=entry['file']):
                content = (ASSETS / entry['file']).read_bytes().replace(b'\r\n', b'\n').strip()
                self.assertEqual(hashlib.sha256(content).hexdigest(), entry['sha256'])
                self.assertEqual(ET.fromstring(content).get('color'), '#f8fafc')
                self.assertTrue(entry['source'].startswith('https://raw.githubusercontent.com/'))
        for filename in ('LICENSE-Phosphor.txt', 'LICENSE-MingCute.txt'):
            self.assertTrue((ASSETS / filename).is_file())


if __name__ == '__main__':
    unittest.main()
