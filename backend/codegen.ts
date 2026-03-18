import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'src/graphql/types/*.ts',
  documents: ['src/**/*.test.ts'],
  ignoreNoDocuments: true,
  generates: {
    // Backend: typed resolver signatures
    'src/__generated__/resolvers-types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../lib/context#Context',
        useIndexSignature: true,
        useTypeImports: true,
        enumsAsTypes: true,
        mappers: {
          User: '../db/schema#SafeUser as UserModel',
          Post: '../db/schema#Post as PostModel',
        },
      },
    },
    // Testing: TypedDocumentNode for executeOperation()
    'src/__generated__/gql/': {
      preset: 'client',
    },
  },
};

export default config;
