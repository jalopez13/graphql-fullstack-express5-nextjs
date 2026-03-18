import gql from 'graphql-tag';
import { postTypes } from './post';
import { userTypes } from './user';

// Base query required when using extend type Query in other files
const baseTypes = gql`
  type Query
  type Mutation
`;

export const typeDefs = [baseTypes, userTypes, postTypes];
