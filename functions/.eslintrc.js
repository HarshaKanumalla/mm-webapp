module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:promise/recommended',
  ],
  rules: {
    'no-restricted-globals': ['error', 'name', 'length'],
    'prefer-arrow-callback': 'error',
    'quotes': ['error', 'single', { 'allowTemplateLiterals': true }],
    'no-case-declarations': 'off',
    'indent': 'off',
    'no-unused-vars': 'warn',
    'max-len': 'off'
  },
  parserOptions: {
    ecmaVersion: 2020,  // Updated to support optional chaining
  }
};