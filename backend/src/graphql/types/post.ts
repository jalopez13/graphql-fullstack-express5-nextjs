import gql from 'graphql-tag';

export const postTypes = gql`
  type Post {
    id: ID!
    title: String!
    content: String
    published: Boolean!
  }

  type PageInfo {
    total: Int!
    hasMore: Boolean!
  }

  type PaginatedPosts {
    items: [Post!]!
    pageInfo: PageInfo!
  }

  type Query {
    feed(limit: Int = 20, offset: Int = 0): PaginatedPosts!
    drafts(limit: Int = 20, offset: Int = 0): PaginatedPosts!
    post(id: ID!): Post
  }

  type Mutation {
    createDraft(content: String, title: String!): Post!
    publish(id: ID!): Post
  }
`;
