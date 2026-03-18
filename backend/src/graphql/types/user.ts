import gql from 'graphql-tag';

export const userTypes = gql`
  type AuthPayload {
    token: String!
    user: User!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    posts(limit: Int = 10, offset: Int = 0): PaginatedPosts!
    createdAt: String!
  }

  type PaginatedUsers {
    items: [User!]!
    pageInfo: PageInfo!
  }

  extend type Query {
    users(limit: Int = 20, offset: Int = 0): PaginatedUsers!
    user(id: ID!): User
    me: User
  }

  extend type Mutation {
    signup(name: String!, email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    deleteUser(id: ID!): User!
  }
`;
