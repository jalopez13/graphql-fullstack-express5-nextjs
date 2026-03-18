import {
  pgTable,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users Table
export const usersTable = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  password: text().notNull(),
  role: varchar('role', { length: 20 }).notNull().default('user'),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});

// Posts Table
export const postsTable = pgTable(
  'posts',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: varchar({ length: 255 }).notNull(),
    content: text(),
    published: boolean().notNull().default(false),
    authorId: integer().references(() => usersTable.id),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('posts_title_idx').on(table.title),
    index('posts_published_idx').on(table.published),
    index('posts_author_idx').on(table.authorId),
  ],
);

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  posts: many(postsTable),
}));

export const postsRelations = relations(postsTable, ({ one }) => ({
  author: one(usersTable, {
    fields: [postsTable.authorId],
    references: [usersTable.id],
  }),
}));

// Types
export type User = typeof usersTable.$inferSelect;
export type SafeUser = Omit<User, 'password'>;
export type Post = typeof postsTable.$inferSelect;
