import { db } from './';
import { postsTable } from './schema';

const posts = [
  {
    title: 'Getting Started with GraphQL',
    content:
      'GraphQL is a query language for APIs and a runtime for executing those queries. Unlike REST, GraphQL allows clients to request exactly the data they need.',
    published: true,
  },
  {
    title: 'Why I Switched from REST to GraphQL',
    content:
      'After years of building REST APIs, I made the switch to GraphQL. Here is what I learned along the way and why I will never go back.',
    published: true,
  },
  {
    title: 'GraphQL Mutations Explained',
    content:
      'Mutations in GraphQL are how you modify server-side data. In this post we cover createPost, updatePost, and deletePost with real examples.',
    published: true,
  },
  {
    title: 'Understanding GraphQL Resolvers',
    content:
      'Resolvers are the functions that handle GraphQL queries and mutations. Each field in your schema maps to a resolver function.',
    published: true,
  },
  {
    title: 'Draft: GraphQL Subscriptions Deep Dive',
    content:
      'Subscriptions allow clients to listen for real-time updates from the server. This post is still in progress...',
    published: false,
  },
  {
    title: 'Draft: Apollo Client vs urql in 2026',
    content: null,
    published: false,
  },
];

const seed = async () => {
  if (process.env.NODE_ENV === 'production') {
    console.error('Seed script cannot run in production. Use --force to override.');
    process.exit(1);
  }

  console.log('Seeding posts...');

  await db.delete(postsTable); // clear existing data first

  await db.insert(postsTable).values(posts);

  console.log(`✅ Successfully seeded ${posts.length} posts!`);
  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
