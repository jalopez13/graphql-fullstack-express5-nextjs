import { mergeResolvers } from '@graphql-tools/merge';
import { postResolvers } from './post';
import { userResolvers } from './user';
import type { Resolvers } from '../../__generated__/resolvers-types';

export const resolvers: Resolvers = mergeResolvers([userResolvers, postResolvers]);
