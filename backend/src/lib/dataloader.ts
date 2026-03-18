import DataLoader from 'dataloader';
import { inArray } from 'drizzle-orm';
import { db } from '../db';
import { postsTable, type Post } from '../db/schema';

/**
 * Batches User.posts lookups: instead of N separate queries,
 * issues one `SELECT * FROM posts WHERE authorId IN (...)`.
 */
async function batchPostsByAuthor(authorIds: readonly number[]): Promise<Post[][]> {
  const posts = await db
    .select()
    .from(postsTable)
    .where(inArray(postsTable.authorId, [...authorIds]));

  const postsByAuthor = new Map<number, Post[]>();
  for (const post of posts) {
    if (post.authorId == null) continue;
    const list = postsByAuthor.get(post.authorId) ?? [];
    list.push(post);
    postsByAuthor.set(post.authorId, list);
  }

  return authorIds.map((id) => postsByAuthor.get(id) ?? []);
}

export interface Loaders {
  postsByAuthor: DataLoader<number, Post[]>;
}

/** Create a fresh set of DataLoaders — call once per request. */
export function createLoaders(): Loaders {
  return {
    postsByAuthor: new DataLoader(batchPostsByAuthor),
  };
}
