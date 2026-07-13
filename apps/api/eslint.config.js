import dhaConfig from '@dha/config/eslint';

export default [
  ...dhaConfig,
  {
    rules: {
      // В NestJS активно используются декораторы и инъекции
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
