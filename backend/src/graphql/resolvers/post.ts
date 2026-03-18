import { eq, and, count } from 'drizzle-orm';
import { db } from '../../db';
import { postsTable } from '../../db/schema';
import {
  validate,
  idSchema,
  postSchemas,
  paginationSchema,
} from '../../validators/graphql';
import { requireAuth } from '../../lib/requireAuth';
import { logger } from '../../lib/logger';
import type { Resolvers } from '../../__generated__/resolvers-types';

export const postResolvers: Resolvers = {
  Query: {
    feed: async (_parent, args) => {
      const { limit, offset } = validate(paginationSchema, args);

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(postsTable)
          .where(eq(postsTable.published, true))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count() })
          .from(postsTable)
          .where(eq(postsTable.published, true)),
      ]);
      const total = countResult[0]?.total ?? 0;

      return {
        items,
        pageInfo: { total, hasMore: offset + limit < total },
      };
    },

    drafts: async (_parent, args, context) => {
      const actor = await requireAuth(context);
      const { limit, offset } = validate(paginationSchema, args);

      const condition = and(
        eq(postsTable.published, false),
        eq(postsTable.authorId, actor.id),
      );

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(postsTable)
          .where(condition)
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(postsTable).where(condition),
      ]);
      const total = countResult[0]?.total ?? 0;

      return {
        items,
        pageInfo: { total, hasMore: offset + limit < total },
      };
    },

    post: async (_parent, args, context) => {
      const { id } = validate(idSchema, args);

      logger.debug({ id }, 'Fetching post by id');

      const [post] = await db
        .select()
        .from(postsTable)
        .where(eq(postsTable.id, id))
        .limit(1);

      logger.debug({ id, found: !!post }, 'Post fetch result');

      if (!post) return null;

      // Unpublished posts are only visible to their author
      if (!post.published) {
        if (!context.user || context.user.id !== post.authorId) {
          return null;
        }
      }

      return post;
    },
  },

  Mutation: {
    createDraft: async (_parent, args, context) => {
      const user = await requireAuth(context);

      const { title, content } = validate(postSchemas.createDraft, args);

      logger.debug({ title, authorId: user.id }, 'Creating draft');

      const [newPost] = await db
        .insert(postsTable)
        .values({
          title,
          content: content ?? null,
          published: false,
          authorId: user.id,
        })
        .returning();

      if (!newPost) {
        throw new Error('Failed to create draft');
      }

      logger.info({ id: newPost.id, title: newPost.title }, 'Draft created');

      return newPost;
    },

    publish: async (_parent, args, context) => {
      const actor = await requireAuth(context);

      const { id } = validate(idSchema, args);

      logger.debug({ id }, 'Publishing post');

      const [post] = await db
        .select()
        .from(postsTable)
        .where(eq(postsTable.id, id))
        .limit(1);

      if (!post) {
        throw new Error(`Post with id ${id} not found`);
      }

      if (post.authorId !== actor.id) {
        throw new Error('Forbidden — you can only publish your own posts');
      }

      const [updatedPost] = await db
        .update(postsTable)
        .set({
          published: true,
          updatedAt: new Date(),
        })
        .where(eq(postsTable.id, id))
        .returning();

      if (!updatedPost) {
        throw new Error('Failed to publish post');
      }

      logger.info(
        { id: updatedPost.id, title: updatedPost.title },
        'Post published',
      );
      return updatedPost;
    },
  },
};
