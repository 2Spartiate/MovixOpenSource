import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceFunction } from './helpers/sourceFunction.mjs';

for (const payload of [undefined, {}, '<html>maintenance</html>', { comments: null }, { comments: {} }]) {
  test(`une réponse commentaires invalide préserve la liste (${JSON.stringify(payload)})`, async () => {
    const previous = [{ id: 1, content: 'existant' }];
    let comments = previous;
    const loadComments = sourceFunction('src/components/CommentsSection.tsx', 'loadComments', {
      useCallback: (callback: unknown) => callback, contentType: 'movie', contentId: 42,
      MAIN_API: 'https://example.test', localStorage: { getItem: () => null },
      axios: { get: async () => ({ data: payload }) },
      setComments: (value: typeof comments) => { comments = value; },
      setHasMore() {}, setLoading() {}, setShowComments() {}, setTimeout() {},
      console: { error() {} },
    });
    await loadComments(1);
    assert.equal(comments, previous);
  });
}
