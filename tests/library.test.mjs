import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categories, guitarLibrary, findShape, shapesByCategory } from '../src/library.js';
import { analyzeSelection } from '../src/theory.js';

test('library entries use safe unique identifiers and six valid string states', () => {
  assert.equal(new Set(guitarLibrary.map(({ id }) => id)).size, guitarLibrary.length);
  for (const item of guitarLibrary) {
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.equal(item.shape.length, 6);
    assert.ok(
      item.shape.every((value) => value === 'x' || (Number.isInteger(value) && value >= 0 && value <= 12)),
    );
  }
});

test('each library category can be selected and each id can be found', () => {
  assert.ok(categories.length >= 4);
  for (const category of categories) assert.ok(shapesByCategory(category).length > 0);
  for (const item of guitarLibrary) assert.equal(findShape(item.id), item);
});

test('named chord and triad cards analyze to their declared root', () => {
  const chordCards = guitarLibrary.filter(({ category }) => !category.startsWith('Scales'));
  for (const item of chordCards) {
    const result = analyzeSelection(item.shape);
    assert.ok(
      result.chords.some(({ root, exact }) => root === item.root && exact),
      `${item.title} should contain an exact ${item.root} chord candidate`,
    );
  }
});
